import { createPool, type RowDataPacket } from "mysql2/promise";
import { verifyPassword } from "./ruas-password";
import { env } from "./env";
import type { Role } from "@simak/shared";

type RuasRole = "admin" | "editor" | "participant";

export type RuasIdentity = {
  ruasUserId: string;
  username: string;
  name: string;
  role: Role;
  isActive: true;
};

export class RuasAuthUnavailable extends Error {
  constructor() {
    super("Sumber autentikasi RUAS tidak tersedia.");
    this.name = "RuasAuthUnavailable";
  }
}

function normalizeRole(role: unknown): Role | null {
  if (role === "editor") return "guru";
  if (role === "participant") return "murid";
  return null;
}

function normalizeIdentity(input: {
  username: string;
  role: unknown;
  ruasUserId?: unknown;
  name?: unknown;
}) {
  const role = normalizeRole(input.role);
  if (!role) return null;

  return {
    ruasUserId: String(input.ruasUserId ?? input.username),
    username: input.username,
    name: String(input.name ?? input.username),
    role,
    isActive: true as const,
  } satisfies RuasIdentity;
}

async function authenticateWithEndpoint(username: string, password: string) {
  if (!env.RUAS_AUTH_ENDPOINT) throw new RuasAuthUnavailable();

  let response: Response;
  try {
    response = await fetch(env.RUAS_AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new RuasAuthUnavailable();
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new RuasAuthUnavailable();

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RuasAuthUnavailable();
  }

  if (!body || typeof body !== "object") throw new RuasAuthUnavailable();
  const value = body as Record<string, unknown>;
  if (typeof value.token !== "string" || !value.token) return null;

  const nestedUser = value.user && typeof value.user === "object"
    ? value.user as Record<string, unknown>
    : undefined;

  // Respons login RUAS hanya memuat token dan role — nama tampilan tidak
  // disertakan di dalamnya (klien RUAS sendiri mengambil profil terpisah
  // sesudah login). Bila nama tidak ada di respons login, ambil dari profil.
  const loginName = value.display_name ?? value.name ?? nestedUser?.display_name ?? nestedUser?.name;
  const name = typeof loginName === "string" && loginName
    ? loginName
    : await fetchRuasProfileName(value.token) ?? loginName;

  return normalizeIdentity({
    username,
    role: value.role ?? nestedUser?.role,
    ruasUserId: value.ruas_user_id ?? value.user_id ?? nestedUser?.id ?? nestedUser?.user_id,
    name,
  });
}

function ruasProfileUrl(): string | null {
  if (!env.RUAS_AUTH_ENDPOINT) return null;
  // RUAS_AUTH_ENDPOINT berbentuk ".../api/auth"; profil tinggal di
  // ".../api/profile" pada basis API yang sama.
  if (!/\/auth\/?$/.test(env.RUAS_AUTH_ENDPOINT)) return null;
  return env.RUAS_AUTH_ENDPOINT.replace(/\/auth\/?$/, "/profile");
}

async function fetchRuasProfileName(token: string): Promise<string | undefined> {
  const url = ruasProfileUrl();
  if (!url) return undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "x-auth-token": token, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  if (!body || typeof body !== "object") return undefined;

  const value = body as Record<string, unknown>;
  const profile = value.profile && typeof value.profile === "object"
    ? value.profile as Record<string, unknown>
    : value;

  const name = profile.display_name ?? profile.name;
  return typeof name === "string" && name ? name : undefined;
}

type RuasUserRow = RowDataPacket & {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: RuasRole;
  active: number;
};

let ruasPool: ReturnType<typeof createPool> | null = null;

function getRuasPool() {
  if (!env.RUAS_DATABASE_URL) throw new RuasAuthUnavailable();
  ruasPool ??= createPool({ uri: env.RUAS_DATABASE_URL, connectionLimit: 5, timezone: "Z" });
  return ruasPool;
}

async function authenticateWithSharedDatabase(username: string, password: string) {
  const pool = getRuasPool();
  let rows: RuasUserRow[];
  try {
    const [result] = await pool.execute<RuasUserRow[]>(
      "SELECT id, username, password_hash, display_name, role, active FROM users WHERE username = ? LIMIT 1",
      [username],
    );
    rows = result;
  } catch {
    throw new RuasAuthUnavailable();
  }

  const user = rows[0];
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) return null;

  return normalizeIdentity({
    username: user.username,
    ruasUserId: user.id,
    name: user.display_name,
    role: user.role,
  });
}

export async function authenticateAgainstRuas(username: string, password: string) {
  if (env.RUAS_AUTH_MODE === "shared-db") {
    return authenticateWithSharedDatabase(username, password);
  }
  return authenticateWithEndpoint(username, password);
}

