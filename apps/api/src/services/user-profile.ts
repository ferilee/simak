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
 * Keputusan sinkronisasi profil untuk identitas yang sudah dirapikan:
 * baris yang ruas_user_id/username-nya cocok PERSIS selalu menang (baris
 * kembaran berspasi tidak ikut disentuh — urusan bersih-bersih manual);
 * bila tidak ada yang persis, baris yang pengenalnya cocok sesudah
 * di-trim adalah profil hantu lama dan baris itulah yang disinkronkan,
 * sehingga penulisan sinkronisasi biasa menyembuhkan pengenalnya menjadi
 * nilai yang rapi. Bila keduanya tidak ada, profil baru dibuat.
 */
export function planProfileSync<T extends ProfileIdentityFields>(
  identity: { ruasUserId: string; username: string },
  candidates: readonly T[],
): ProfileSyncPlan<T> {
  const exact = candidates.find(
    (row) => row.ruasUserId === identity.ruasUserId || row.username === identity.username,
  );
  if (exact) return { action: "sync", user: exact, heal: false };
  const spaced = candidates.find(
    (row) => row.ruasUserId.trim() === identity.ruasUserId || row.username.trim() === identity.username,
  );
  if (spaced) return { action: "sync", user: spaced, heal: true };
  return { action: "insert" };
}

export async function upsertSimakProfile(identity: RuasIdentity): Promise<SessionUser> {
  // Satu kueri kandidat: kecocokan persis ATAU kecocokan sesudah pengenal
  // tersimpan di-trim (profil hantu lama yang berawalan spasi). Urut id
  // agar pilihan deterministik; prioritasnya diputuskan planProfileSync.
  const candidates = await db
    .select()
    .from(users)
    .where(or(
      eq(users.ruasUserId, identity.ruasUserId),
      eq(users.username, identity.username),
      sql`trim(${users.ruasUserId}) = ${identity.ruasUserId}`,
      sql`trim(${users.username}) = ${identity.username}`,
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
