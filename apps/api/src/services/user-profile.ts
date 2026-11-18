import { asc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@simak/db";
import type { Role } from "@simak/shared";
import type { RuasIdentity } from "../lib/ruas-auth";
import type { SessionUser } from "../middleware/auth";

const { users } = schema;

type ProfileIdentityFields = {
  id: number;
  ruasUserId: string;
  username: string;
};

export type ProfileSyncPlan<T extends ProfileIdentityFields = ProfileIdentityFields> =
  | { action: "sync"; user: T; heal: boolean }
  | { action: "insert" };

/**
 * Pelipatan pengenal untuk kecocokan warisan: trim + huruf kecil.
 * Pengenal tersimpan dari era sumber autentikasi lama bisa berbeda
 * spasi maupun huruf besar/kecil dari nilai kanonis RUAS; keduanya
 * menunjuk orang yang sama dan harus dikenali sebagai baris yang sama.
 */
function foldIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Keputusan sinkronisasi profil untuk identitas yang sudah dirapikan:
 * baris yang ruas_user_id/username-nya cocok PERSIS selalu menang (baris
 * kembaran warisan tidak ikut disentuh — urusan bersih-bersih manual);
 * bila tidak ada yang persis, baris yang pengenalnya cocok sesudah
 * dilipat (di-trim dan dihurufkecilkan) adalah profil warisan lama dan
 * baris itulah yang disinkronkan, sehingga penulisan sinkronisasi biasa
 * menyembuhkan pengenalnya menjadi nilai kanonis RUAS. Bila keduanya
 * tidak ada, profil baru dibuat.
 *
 * Kecocokan warisan WAJIB tidak peka huruf: kueri kandidat menemukan
 * baris warisan lewat kolasi basis data yang tidak peka huruf, jadi
 * keputusan yang peka huruf menyatakan baris itu "tidak cocok" lalu
 * mencoba menyisipkan baris baru — dan sisipan itu menabrak batas unik
 * username di bawah kolasi yang sama (kasus 'Aldo_kkkr' lokal vs
 * 'aldo_kkkr' kanonis RUAS: login menjawab 503 di setiap percobaan,
 * dan jalur serah-terima RUAS→SIMAK ikut terkena karena memakai
 * upsert yang sama).
 */
export function planProfileSync<T extends ProfileIdentityFields>(
  identity: { ruasUserId: string; username: string },
  candidates: readonly T[],
): ProfileSyncPlan<T> {
  const exact = candidates.find(
    (row) => row.ruasUserId === identity.ruasUserId || row.username === identity.username,
  );
  if (exact) return { action: "sync", user: exact, heal: false };
  const legacy = candidates.find(
    (row) =>
      foldIdentifier(row.ruasUserId) === foldIdentifier(identity.ruasUserId) ||
      foldIdentifier(row.username) === foldIdentifier(identity.username),
  );
  if (legacy) return { action: "sync", user: legacy, heal: true };
  return { action: "insert" };
}

export async function upsertSimakProfile(identity: RuasIdentity): Promise<SessionUser> {
  // Satu kueri kandidat: kecocokan persis ATAU kecocokan sesudah pengenal
  // tersimpan di-trim (profil hantu lama yang berawalan spasi) ATAU
  // kecocokan sesudah dilipat hurufnya (baris warisan yang pengenalnya
  // beda huruf besar/kecil dari kanonis RUAS — perbandingan lower()
  // membuat temuan ini tidak bergantung pada kolasi kolom). Urut id
  // agar pilihan deterministik; prioritasnya diputuskan planProfileSync.
  const foldedRuasUserId = foldIdentifier(identity.ruasUserId);
  const foldedUsername = foldIdentifier(identity.username);
  const candidates = await db
    .select()
    .from(users)
    .where(or(
      eq(users.ruasUserId, identity.ruasUserId),
      eq(users.username, identity.username),
      sql`trim(${users.ruasUserId}) = ${identity.ruasUserId}`,
      sql`trim(${users.username}) = ${identity.username}`,
      sql`lower(trim(${users.ruasUserId})) = ${foldedRuasUserId}`,
      sql`lower(trim(${users.username})) = ${foldedUsername}`,
    ))
    .orderBy(asc(users.id));

  const plan = planProfileSync(identity, candidates);

  if (plan.action === "sync") {
    const existing = plan.user;
    await db
      .update(users)
      .set({
        ruasUserId: identity.ruasUserId,
        username: identity.username,
        name: identity.name,
        role: identity.role,
        isActive: identity.isActive,
        lastSyncedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    return toSessionUser({ ...existing, ...identity });
  }

  const [created] = await db
    .insert(users)
    .values({
      ruasUserId: identity.ruasUserId,
      username: identity.username,
      name: identity.name,
      role: identity.role,
      isActive: identity.isActive,
      lastSyncedAt: new Date(),
    })
    .$returningId();

  return {
    userId: created!.id,
    ruasUserId: identity.ruasUserId,
    username: identity.username,
    role: identity.role,
    name: identity.name,
  };
}

function toSessionUser(user: {
  id: number;
  ruasUserId: string;
  username: string;
  role: Role;
  name: string;
}): SessionUser {
  return {
    userId: user.id,
    ruasUserId: user.ruasUserId,
    username: user.username,
    role: user.role,
    name: user.name,
  };
}

export function publicUser(user: SessionUser) {
  return {
    id: user.userId,
    ruas_user_id: user.ruasUserId,
    username: user.username,
    display_name: user.name,
    name: user.name,
    role: user.role,
  };
}
