import { Hono, type Context } from "hono";
import { and, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { env } from "../lib/env";
import { findRuasIdentityByUsername, RuasAuthUnavailable } from "../lib/ruas-auth";
import { attachSessionCookie, createSession } from "../lib/session";
import { upsertSimakProfile } from "../services/user-profile";
import type { SessionUser } from "../middleware/auth";
import {
  HANDOFF_TOKEN_TTL_MS,
  createFailedAttemptLimiter,
  evaluateInternalGuard,
  evaluateRedemption,
  generateHandoffToken,
  handoffHomePath,
  hashHandoffToken,
  planHandoffIssue,
} from "../lib/serah-terima";

// Serah-terima masuk RUAS -> SIMAK (Hub Murid Tahap 4) — cermin sisi
// RUAS pada Tahap 2 (routes/simak-internal.ts di RUAS) untuk arah
// sebaliknya, mengikuti kontrak yang sama:
//  - RUAS meminta token lewat POST /api/internal/ruas/handoff dengan
//    rahasia bersama pada header "x-internal-secret" (di SIMAK nilainya
//    env RUAS_INTERNAL_SECRET — SATU rahasia untuk kedua arah).
//    Rahasia belum disetel -> 404 (fitur belum aktif); salah -> 401.
//  - Peramban murid menukar token di GET /masuk-ruas/:token menjadi
//    sesi SIMAK biasa lewat createSession + attachSessionCookie yang
//    sama persis dengan login (lib/session.ts).
// Token mentah dan rahasia tidak pernah ditulis ke log; username sesi
// selalu berasal dari baris token, tidak bisa diganti parameter apa pun.

const { ruasHandoffTokens, users } = schema;

const LOGIN_PATH = "/login";

async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export const ruasInternalRoutes = new Hono();

ruasInternalRoutes.post("/handoff", async (c) => {
  const guard = evaluateInternalGuard(env.RUAS_INTERNAL_SECRET, c.req.header("x-internal-secret"));
  if (guard === "not_configured") {
    return c.json({ ok: false, message: "Endpoint tidak tersedia." }, 404);
  }
  if (guard === "unauthorized") {
    return c.json({ ok: false, message: "Rahasia internal tidak valid." }, 401);
  }

  const body = await readJsonBody(c);
  const username =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).username === "string"
      ? ((body as Record<string, unknown>).username as string).trim()
      : "";
  if (!username) {
    return c.json({ ok: false, message: "Badan permintaan tidak sesuai format." }, 400);
  }

  // Identitas dicari dari sumber akun RUAS (jalur basis data bersama di
  // lib/ruas-auth.ts) — username asing / tidak aktif / peran admin yang
  // tidak terpetakan semuanya tiba sebagai null dan menjawab 404.
  let identity;
  try {
    identity = await findRuasIdentityByUsername(username);
  } catch (error) {
    if (error instanceof RuasAuthUnavailable) {
      return c.json({ ok: false, message: "Layanan autentikasi RUAS sedang tidak tersedia." }, 503);
    }
    throw error;
  }
  if (planHandoffIssue(identity).action === "not_found" || !identity) {
    return c.json({ ok: false, message: "Pengguna tidak ditemukan atau tidak aktif." }, 404);
  }

  // Profil SIMAK lahir/diperbarui dengan cara yang sama persis seperti
  // login biasa — murid yang belum pernah masuk SIMAK pun dapat profil
  // di sini, lalu token diikatkan pada user_id baris itu.
  const now = Date.now();
  const rawToken = generateHandoffToken();
  let user: SessionUser;
  try {
    user = await upsertSimakProfile(identity);
    // Sapuan oportunistik baris kedaluwarsa (pola createSession).
    await db.delete(ruasHandoffTokens).where(lte(ruasHandoffTokens.expiresAt, new Date(now)));
    await db.insert(ruasHandoffTokens).values({
      tokenHash: hashHandoffToken(rawToken),
      userId: user.userId,
      expiresAt: new Date(now + HANDOFF_TOKEN_TTL_MS),
      createdAt: new Date(now),
    });
  } catch {
    return c.json({ ok: false, message: "Penyimpanan SIMAK sedang tidak tersedia." }, 503);
  }

  const origin = new URL(c.req.url).origin;
  return c.json({ url: `${origin}/masuk-ruas/${rawToken}` });
});

// Rute penukaran yang dibuka peramban. Semua kegagalan — token tidak
// dikenal, sudah terpakai, kedaluwarsa, kalah balapan, atau basis data
// terganggu — dialihkan ke halaman login biasa tanpa pesan teknis;
// murid selalu punya jalan cadangan login langsung (rancangan Bagian 6).
const redeemFailureLimiter = createFailedAttemptLimiter();

export const masukRuasRoutes = new Hono();

masukRuasRoutes.get("/masuk-ruas/:token", async (c) => {
  const clientKey = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (redeemFailureLimiter.isBlocked(clientKey)) {
    return c.redirect(LOGIN_PATH, 302);
  }

  const fail = () => {
    redeemFailureLimiter.recordFailure(clientKey);
    return c.redirect(LOGIN_PATH, 302);
  };

  const rawToken = c.req.param("token");
  if (!rawToken) return fail();
  const tokenHash = hashHandoffToken(rawToken);
  const now = Date.now();

  let row: { token: typeof ruasHandoffTokens.$inferSelect; user: typeof users.$inferSelect } | undefined;
  try {
    const rows = await db
      .select({ token: ruasHandoffTokens, user: users })
      .from(ruasHandoffTokens)
      .innerJoin(users, eq(users.id, ruasHandoffTokens.userId))
      .where(eq(ruasHandoffTokens.tokenHash, tokenHash))
      .limit(1);
    row = rows[0];
  } catch {
    return fail();
  }

  const decision = evaluateRedemption(
    row
      ? {
          userId: row.token.userId,
          expiresAtMs: row.token.expiresAt.getTime(),
          usedAtMs: row.token.usedAt ? row.token.usedAt.getTime() : null,
        }
      : null,
    now,
  );
  if (!decision.ok || !row) return fail();

  // Klaim atomik sekali pakai: hanya penukar pertama yang barisnya
  // masih used_at IS NULL yang menang; balapan yang kalah = gagal.
  try {
    const claim = await db
      .update(ruasHandoffTokens)
      .set({ usedAt: new Date(now) })
      .where(and(eq(ruasHandoffTokens.tokenHash, tokenHash), isNull(ruasHandoffTokens.usedAt)));
    const header = (Array.isArray(claim) ? claim[0] : claim) as { affectedRows?: number } | undefined;
    if (!header || header.affectedRows !== 1) return fail();
  } catch {
    return fail();
  }

  // Sesi dibentuk dari baris PENGGUNA YANG TERIKAT PADA TOKEN — bukan
  // dari parameter mana pun — lewat pembuat sesi yang sama dengan login.
  const u = row.user;
  const sessionUser: SessionUser = {
    userId: u.id,
    ruasUserId: u.ruasUserId,
    username: u.username,
    name: u.name,
    role: u.role,
  };
  let session: string;
  try {
    session = await createSession(sessionUser);
  } catch {
    // Token sudah terpakai; murid diarahkan ke login biasa.
    return c.redirect(LOGIN_PATH, 302);
  }
  attachSessionCookie(c, session);
  return c.redirect(handoffHomePath(u.role), 302);
});
