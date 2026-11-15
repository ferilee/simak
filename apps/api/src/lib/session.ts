import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { eq, lte } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { env } from "./env";
import {
  SESSION_TTL_MS,
  hashSessionToken,
  planNewSession,
  planSessionResolution,
} from "./session-policy";
import type { SessionUser } from "../middleware/auth";

// Sesi SIMAK PERSISTEN di basis data (tabel `sessions`, migrasi 0019 —
// Tahap 1 Hub Murid), menggantikan Map ingatan proses: Redeploy API
// tidak lagi mengeluarkan guru dan murid. Cookie dan bentuk nilainya
// TIDAK berubah (`<id>.<tanda tangan HMAC>`); yang berubah hanya
// tempat penyimpanannya. Di basis data hanya tersimpan SHA-256 dari id
// sesi (lihat lib/session-policy.ts) — token mentah tidak pernah
// ditulis ke mana pun. Masa berlaku 30 hari meluncur mengikuti
// kebijakan di session-policy.ts.
//
// Perilaku gagal yang disengaja: basis data tidak terjangkau saat
// resolusi = tidak ada sesi (pemanggil mengarahkan ke login). Tidak
// ada sesi cadangan di ingatan — sesi hantu yang tidak bisa dibatalkan
// lebih buruk daripada meminta login ulang.
export const SESSION_COOKIE = "simak_session";
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

const { sessions, users } = schema;

function signature(sessionId: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(sessionId).digest("base64url");
}

function signedValue(sessionId: string) {
  return `${sessionId}.${signature(sessionId)}`;
}

function verifySignedValue(value: string) {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const sessionId = value.slice(0, separator);
  const actual = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(sessionId));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return sessionId;
}

export async function createSession(user: SessionUser): Promise<string> {
  const now = Date.now();
  const plan = planNewSession(now);
  // Pembersihan oportunistik: baris kedaluwarsa (siapa pun) dibuang
  // saat sesi baru lahir — tanpa pekerjaan terjadwal. Tabel ini kecil
  // (satu baris per sesi aktif), jadi sapuan penuh aman.
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date(now)));
  const sessionId = randomUUID();
  await db.insert(sessions).values({
    tokenHash: hashSessionToken(sessionId),
    userId: user.userId,
    createdAt: new Date(plan.createdAtMs),
    expiresAt: new Date(plan.expiresAtMs),
    lastSeenAt: new Date(plan.lastSeenAtMs),
  });
  return signedValue(sessionId);
}

type ResolvedSession = { user: SessionUser; touched: boolean };

async function resolveSessionInternal(value: string | undefined): Promise<ResolvedSession | null> {
  if (!value) return null;

  const sessionId = verifySignedValue(value);
  if (!sessionId) return null;

  const tokenHash = hashSessionToken(sessionId);
  let row: { session: typeof sessions.$inferSelect; user: typeof users.$inferSelect } | undefined;
  try {
    const rows = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    row = rows[0];
  } catch {
    return null;
  }
  if (!row) return null;

  const now = Date.now();
  const plan = planSessionResolution(
    { expiresAtMs: row.session.expiresAt.getTime(), lastSeenAtMs: row.session.lastSeenAt.getTime() },
    now,
  );
  if (plan.action === "reject") {
    // Buang baris kedaluwarsa yang baru ditemukan ini (oportunistik).
    try {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    } catch {
      // Baris yatim akan kedaluwarsa dan tersapu pada login berikutnya.
    }
    return null;
  }
  if (plan.touch) {
    try {
      await db
        .update(sessions)
        .set({ lastSeenAt: new Date(plan.nextLastSeenAtMs), expiresAt: new Date(plan.nextExpiresAtMs) })
        .where(eq(sessions.tokenHash, tokenHash));
    } catch {
      // Sentuhan gagal tidak membatalkan sesi yang sah; perpanjangan
      // dicoba lagi pada permintaan berikutnya.
    }
  }

  const u = row.user;
  return {
    user: { userId: u.id, ruasUserId: u.ruasUserId, username: u.username, name: u.name, role: u.role },
    touched: plan.touch,
  };
}

export async function resolveSession(value: string | undefined): Promise<SessionUser | null> {
  const resolved = await resolveSessionInternal(value);
  return resolved?.user ?? null;
}

export async function revokeSession(value: string | undefined): Promise<void> {
  if (!value) return;
  const sessionId = verifySignedValue(value);
  if (!sessionId) return;
  try {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(sessionId)));
  } catch {
    // Cookie tetap dibersihkan pemanggil; baris yang tertinggal akan
    // kedaluwarsa sendiri dan tersapu secara oportunistik.
  }
}

export function attachSessionCookie(c: Context, value: string) {
  setCookie(c, SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function getSessionFromRequest(c: Context): Promise<SessionUser | null> {
  const value = getCookie(c, SESSION_COOKIE);
  const resolved = await resolveSessionInternal(value);
  if (!resolved) return null;
  // Cookie diterbitkan ulang tepat pada saat baris disentuh (paling
  // sering sekali sehari): maxAge peramban ikut meluncur bersama masa
  // berlaku di server, bukan berhenti 30 hari sejak login.
  if (resolved.touched && value) attachSessionCookie(c, value);
  return resolved.user;
}
