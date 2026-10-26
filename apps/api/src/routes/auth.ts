import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema } from "@simak/shared";
import { authenticateAgainstRuas, RuasAuthUnavailable } from "../lib/ruas-auth";
import { attachSessionCookie, clearSessionCookie, createSession, getSessionFromRequest, revokeSession, SESSION_COOKIE } from "../lib/session";
import { consumeLoginAttempt, clearLoginAttempts } from "../lib/rate-limit";
import { publicUser, upsertSimakProfile } from "../services/user-profile";
import { getCookie } from "hono/cookie";

// Satu pintu login guru + murid (blueprint Bagian 07).
// Alur Tahap 0:
//  1. Terima username + password.
//  2. Verifikasi ke sumber akun RUAS sesuai RUAS_AUTH_MODE:
//     - "shared-db"        : baca profil dan hash dari database RUAS dengan akses
//                            baca saja; hash hanya dipakai sementara untuk verifikasi.
//     - "internal-endpoint": panggil RUAS_AUTH_ENDPOINT dengan kredensial tersebut.
//  3. Bila valid dan akun aktif: buat/perbarui pemetaan profil di tabel users
//     (ruas_user_id, username, nama, peran) lalu terbitkan sesi SIMAK sendiri.
//  4. Kata sandi tidak pernah ditulis ke basis data/log SIMAK.
export const authRoutes = new Hono();

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  const address = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const attemptKey = `${address}:${username.toLowerCase()}`;
  const attempt = consumeLoginAttempt(attemptKey);
  if (!attempt.allowed) {
    c.header("Retry-After", String(attempt.retryAfterSeconds));
    return c.json({ ok: false, message: "Terlalu banyak percobaan login. Coba lagi nanti." }, 429);
  }

  let identity;
  try {
    identity = await authenticateAgainstRuas(username, password);
  } catch (error) {
    if (error instanceof RuasAuthUnavailable) {
      return c.json({ ok: false, message: "Layanan autentikasi RUAS sedang tidak tersedia." }, 503);
    }
    throw error;
  }

  if (!identity) {
    return c.json({ ok: false, message: "Username atau password salah." }, 401);
  }

  clearLoginAttempts(attemptKey);
  const user = await upsertSimakProfile(identity);
  const session = createSession(user);
  attachSessionCookie(c, session);

  return c.json({ ok: true, user: publicUser(user) });
});

authRoutes.post("/logout", async (c) => {
  const session = getCookie(c, SESSION_COOKIE);
  revokeSession(session);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = getSessionFromRequest(c);
  if (!user) return c.json({ ok: false, message: "Belum masuk." }, 401);
  return c.json({ ok: true, user: publicUser(user) });
});
