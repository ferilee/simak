import type { Context, Next } from "hono";
import type { Role } from "@simak/shared";
import { getSessionFromRequest } from "../lib/session";

// Sesi SIMAK sendiri (cookie httpOnly) diterbitkan setelah username + password
// diverifikasi ke sumber akun RUAS. SIMAK tidak menyimpan kata sandi.
export type SessionUser = {
  userId: number;
  ruasUserId: string;
  username: string;
  name: string;
  role: Role;
};

declare module "hono" {
  interface ContextVariableMap {
    user: SessionUser | undefined;
  }
}

export async function loadSession(c: Context, next: Next) {
  const user = getSessionFromRequest(c);
  if (user) c.set("user", user);
  await next();
}

export async function requireAuth(c: Context, next: Next) {
  const user = c.get("user");
  if (!user) {
    return c.json({ ok: false, message: "Belum masuk. Silakan login terlebih dahulu." }, 401);
  }
  await next();
}

export function requireRole(role: Role) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) return c.json({ ok: false, message: "Belum masuk." }, 401);
    if (user.role !== role) {
      return c.json({ ok: false, message: "Peran Anda tidak boleh mengakses ini." }, 403);
    }
    await next();
  };
}
