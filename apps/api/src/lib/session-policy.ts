import { createHash } from "node:crypto";

// Kebijakan masa berlaku SESI PERSISTEN (Tahap 1 Hub Murid) — MURNI:
// tanpa basis data, tanpa env, tanpa jam dinding kecuali yang diberikan
// pemanggil, supaya setiap keputusan bisa diuji langsung. Penyimpanan
// dan pengkabelannya tinggal di lib/session.ts; tabelnya `sessions`
// (migrasi 0019).
//
// Keputusan pemilik (15 Nov 2026): masa berlaku 30 hari MELUNCUR —
// dihitung dari aktivitas terakhir, bukan dari login — supaya murid
// yang aktif tidak pernah terlempar di tengah semester, sedangkan
// sesi yang ditinggalkan mati sendiri sesudah 30 hari.

/** Masa berlaku sesi sejak aktivitas terakhir: 30 hari. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ambang perpanjangan meluncur: last_seen_at/expires_at hanya ditulis
 * ulang bila aktivitas terakhir lebih tua dari 24 jam. Alasannya:
 * ketelitian satu hari tidak berarti apa-apa pada masa berlaku 30
 * hari, sedangkan menulis pada SETIAP permintaan berarti satu UPDATE
 * basis data untuk setiap panggilan API dari setiap pengguna aktif.
 * Dengan ambang ini, satu sesi menulis paling sering sekali sehari —
 * dan cookie peramban hanya perlu diterbitkan ulang pada saat yang
 * sama (lihat getSessionFromRequest di lib/session.ts).
 */
export const SESSION_TOUCH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Hash yang disimpan di tabel sessions: SHA-256 (hex) dari id sesi
 * yang beredar di cookie. Id mentahnya adalah token pembawa (bearer) —
 * tidak pernah ditulis ke basis data, jadi salinan tabel sessions
 * tidak bisa dipakai untuk membajak sesi siapa pun.
 */
export function hashSessionToken(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

/** Apakah baris sesi dengan expiresAt ini sudah kedaluwarsa pada `now`. */
export function isSessionExpired(expiresAtMs: number, now: number): boolean {
  return expiresAtMs <= now;
}

export type NewSessionPlan = {
  createdAtMs: number;
  expiresAtMs: number;
  lastSeenAtMs: number;
};

/** Rencana baris sesi baru pada saat login. */
export function planNewSession(now: number): NewSessionPlan {
  return { createdAtMs: now, expiresAtMs: now + SESSION_TTL_MS, lastSeenAtMs: now };
}

export type SessionRowTimes = {
  expiresAtMs: number;
  lastSeenAtMs: number;
};

export type SessionResolution =
  | {
      action: "accept";
      /** true bila baris perlu disentuh (last_seen/expires diperbarui). */
      touch: boolean;
      nextExpiresAtMs: number;
      nextLastSeenAtMs: number;
    }
  | { action: "reject"; reason: "expired" };

/**
 * Keputusan resolusi satu baris sesi pada waktu `now`:
 * - kedaluwarsa (expiresAt <= now) → tolak; pemanggil membuang barisnya.
 * - masih sah dan aktivitas terakhir lebih tua dari ambang sentuh →
 *   terima + sentuh: expires digeser menjadi now + 30 hari (meluncur).
 * - masih sah dan baru disentuh → terima apa adanya, tanpa menulis.
 */
export function planSessionResolution(row: SessionRowTimes, now: number): SessionResolution {
  if (isSessionExpired(row.expiresAtMs, now)) return { action: "reject", reason: "expired" };
  const touch = now - row.lastSeenAtMs >= SESSION_TOUCH_THRESHOLD_MS;
  return {
    action: "accept",
    touch,
    nextExpiresAtMs: touch ? now + SESSION_TTL_MS : row.expiresAtMs,
    nextLastSeenAtMs: touch ? now : row.lastSeenAtMs,
  };
}
