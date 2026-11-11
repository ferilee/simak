import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";
import { AVATAR_CATALOG, avatarBySlug, avatarImagePath, planRedemption } from "../lib/avatar";

// Avatar murid (gamifikasi): katalog, penukaran dengan poin XP, dan
// pemasangan avatar. Semua route khusus murid. Kepemilikan dibaca dari
// buku besar xp_ledger (baris event "tukar_avatar"); avatar terpasang
// ditunjuk users.avatar_slug dan selalu divalidasi ke katalog — slug
// asing di basis data diperlakukan sebagai belum memasang.
export const avatarRoutes = new Hono();

avatarRoutes.use("*", requireRole("murid"));

const { users, xpLedger } = schema;

/** XP seumur (jumlah baris positif) + saldo tukar (jumlah semua baris). */
async function ledgerSums(studentId: number): Promise<{ lifetime: number; balance: number }> {
  const [row] = await db
    .select({
      lifetime: sql<number>`coalesce(sum(case when ${xpLedger.points} > 0 then ${xpLedger.points} else 0 end), 0)`,
      balance: sql<number>`coalesce(sum(${xpLedger.points}), 0)`,
    })
    .from(xpLedger)
    .where(eq(xpLedger.studentId, studentId));
  return { lifetime: Number(row?.lifetime ?? 0), balance: Number(row?.balance ?? 0) };
}

/** Id avatar (source_id katalog) yang sudah dimiliki murid ini. */
async function ownedAvatarIds(studentId: number): Promise<Set<number>> {
  const rows = await db
    .select({ sourceId: xpLedger.sourceId })
    .from(xpLedger)
    .where(and(eq(xpLedger.studentId, studentId), eq(xpLedger.event, "tukar_avatar")));
  return new Set(rows.map((row) => row.sourceId));
}

/** Slug avatar terpasang yang sah menurut katalog; selain itu null. */
async function equippedSlug(studentId: number): Promise<string | null> {
  const [me] = await db
    .select({ avatarSlug: users.avatarSlug })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  return me?.avatarSlug && avatarBySlug(me.avatarSlug) ? me.avatarSlug : null;
}

avatarRoutes.get("/avatars", async (c) => {
  const user = c.get("user")!;
  const [{ balance, lifetime }, owned, equipped] = await Promise.all([
    ledgerSums(user.userId),
    ownedAvatarIds(user.userId),
    equippedSlug(user.userId),
  ]);
  return c.json({
    ok: true,
    data: {
      balance,
      lifetime,
      equipped_slug: equipped,
      catalog: AVATAR_CATALOG.map((avatar) => ({
        id: avatar.id,
        slug: avatar.slug,
        name: avatar.name,
        emoji: avatar.emoji,
        price: avatar.price,
        image_url: avatarImagePath(avatar.slug),
        owned: owned.has(avatar.id),
        equipped: equipped === avatar.slug,
      })),
    },
  });
});

// Lepas avatar terpasang. Didaftarkan SEBELUM route /:slug agar segmen
// "unequip" tidak pernah tertangkap sebagai slug.
avatarRoutes.post("/avatars/unequip", async (c) => {
  const user = c.get("user")!;
  await db.update(users).set({ avatarSlug: null }).where(eq(users.id, user.userId));
  return c.json({ ok: true, data: { equipped_slug: null } });
});

avatarRoutes.post("/avatars/:slug/redeem", async (c) => {
  const user = c.get("user")!;
  const avatar = avatarBySlug(c.req.param("slug"));
  if (!avatar) return c.json({ ok: false, message: "Avatar tidak ditemukan." }, 404);
  const [{ balance }, owned] = await Promise.all([ledgerSums(user.userId), ownedAvatarIds(user.userId)]);
  const plan = planRedemption({ avatar, owned: owned.has(avatar.id), balance });
  if (!plan.ok) {
    if (plan.reason === "sudah_dimiliki") {
      return c.json({ ok: false, message: "Avatar ini sudah kamu miliki." }, 409);
    }
    return c.json({ ok: false, message: `Saldo XP kurang ${plan.kurang}.`, kurang: plan.kurang }, 400);
  }
  // Penukaran adalah baris negatif buku besar (0 untuk avatar gratis);
  // kunci unik + onDuplicateKeyUpdate no-op — pola idempoten yang sama
  // dengan awardXp — membuat penukaran ulang tidak menggandakan baris.
  await db
    .insert(xpLedger)
    .values({ studentId: user.userId, event: "tukar_avatar", sourceId: avatar.id, points: -avatar.price })
    .onDuplicateKeyUpdate({ set: { points: -avatar.price } });
  const after = await ledgerSums(user.userId);
  return c.json({ ok: true, data: { slug: avatar.slug, balance: after.balance, owned: true } });
});

avatarRoutes.post("/avatars/:slug/equip", async (c) => {
  const user = c.get("user")!;
  const avatar = avatarBySlug(c.req.param("slug"));
  if (!avatar) return c.json({ ok: false, message: "Avatar tidak ditemukan." }, 404);
  const owned = await ownedAvatarIds(user.userId);
  if (!owned.has(avatar.id)) {
    return c.json({ ok: false, message: "Tukar dulu avatar ini dengan XP." }, 403);
  }
  await db.update(users).set({ avatarSlug: avatar.slug }).where(eq(users.id, user.userId));
  return c.json({ ok: true, data: { equipped_slug: avatar.slug } });
});
