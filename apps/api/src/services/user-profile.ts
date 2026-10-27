import { eq, or } from "drizzle-orm";
import { db, schema } from "@simak/db";
import type { Role } from "@simak/shared";
import type { RuasIdentity } from "../lib/ruas-auth";
import type { SessionUser } from "../middleware/auth";

const { users } = schema;

export async function upsertSimakProfile(identity: RuasIdentity): Promise<SessionUser> {
  const [existing] = await db
    .select()
    .from(users)
    .where(or(eq(users.ruasUserId, identity.ruasUserId), eq(users.username, identity.username)))
    .limit(1);

  if (existing) {
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
