import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@simak/shared";
import type { RuasIdentity } from "./ruas-auth";

// Kebijakan SERAH-TERIMA MASUK RUAS -> SIMAK (Hub Murid Tahap 4) —
// cermin persis lib/simak-handoff.ts di RUAS untuk arah sebaliknya.
// Berkas ini tidak menyentuh basis data atau env agar seluruh keputusan
// keamanan (penjaga rahasia, penerbitan, penukaran, pembatas percobaan
// gagal) dapat diuji langsung sebagai fungsi murni. Pengkabelan HTTP +
// basis datanya tinggal di routes/serah-terima.ts; tabelnya
// `ruas_handoff_tokens` (migrasi 0022).
//
// Aturan yang mengikat (rancangan Bagian 5 + 6): token acak kuat,
// disimpan TER-HASH, berlaku 60 detik, SEKALI PAKAI, terikat pada satu
// pengguna SIMAK; sandi tidak pernah berpindah dan token tidak pernah
// ditulis ke log.

/** Masa berlaku token serah-terima: 60 detik sejak diterbitkan. */
export const HANDOFF_TOKEN_TTL_MS = 60_000;

/** Ukuran token mentah: 32 byte (256 bit), di atas syarat minimum 128 bit. */
export const HANDOFF_TOKEN_BYTES = 32;

export function generateHandoffToken(): string {
  return randomBytes(HANDOFF_TOKEN_BYTES).toString("base64url");
}

/** Hash yang disimpan di tabel ruas_handoff_tokens: SHA-256 (hex). */
export function hashHandoffToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

// Banding rahasia secara konstan-waktu. Kedua sisi di-hash dulu agar
// timingSafeEqual selalu membandingkan panjang yang sama (32 byte) dan
// panjang rahasia asli tidak bocor lewat waktu respons.
export function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export type InternalGuardDecision = "not_configured" | "unauthorized" | "ok";

/**
 * Keputusan penjaga endpoint internal: rahasia bersama belum disetel di
 * env → fitur belum aktif (pemanggil menjawab 404, meniru sisi RUAS);
 * header hilang/salah → 401; cocok → lanjut.
 */
export function evaluateInternalGuard(
  configuredSecret: string | null | undefined,
  provided: string | null | undefined,
): InternalGuardDecision {
  if (!configuredSecret) return "not_configured";
  if (!provided || !secretsMatch(provided, configuredSecret)) return "unauthorized";
  return "ok";
}

export type HandoffIssueDecision =
  | { action: "issue" }
  | { action: "not_found" };

/**
 * Keputusan penerbitan token dari hasil pencarian identitas RUAS:
 * identitas tidak ditemukan — username asing, akun tidak aktif, atau
 * peran RUAS (admin) yang tidak terpetakan ke peran SIMAK — berarti
 * tidak ada token (pemanggil menjawab 404). Identitas sah selalu
 * diterbitkan token sesudah profil SIMAK-nya disinkronkan pemanggil.
 */
export function planHandoffIssue(identity: RuasIdentity | null): HandoffIssueDecision {
  return identity ? { action: "issue" } : { action: "not_found" };
}

export type HandoffTokenRow = {
  userId: number;
  expiresAtMs: number;
  usedAtMs: number | null;
};

export type RedemptionDecision =
  | { ok: true; userId: number }
  | { ok: false; reason: "not_found" | "already_used" | "expired" };

/**
 * Keputusan penukaran token: baris harus ada, belum pernah dipakai, dan
 * belum kedaluwarsa pada saat penukaran (expiresAt <= now = kedaluwarsa,
 * termasuk tepat sama). Penandaan terpakai dilakukan pemanggil secara
 * atomik (UPDATE ... WHERE used_at IS NULL) — keputusan "ok" di sini
 * masih bisa kalah balapan, dan kekalahan itu juga kegagalan.
 */
export function evaluateRedemption(row: HandoffTokenRow | null | undefined, now: number): RedemptionDecision {
  if (!row) return { ok: false, reason: "not_found" };
  if (row.usedAtMs !== null) return { ok: false, reason: "already_used" };
  if (row.expiresAtMs <= now) return { ok: false, reason: "expired" };
  return { ok: true, userId: row.userId };
}

/** Beranda peran sesudah penukaran berhasil: murid ke /murid, guru ke /guru. */
export function handoffHomePath(role: Role): string {
  return role === "guru" ? "/guru" : "/murid";
}

// Pembatas sederhana percobaan penukaran yang gagal, per kunci (alamat
// IP) — meniru persis pembatas sisi RUAS: sesudah ambang kegagalan
// dalam jendela waktu, percobaan berikutnya dari kunci itu ditolak
// sampai jendelanya berlalu. Perilaku luar tetap sama (dialihkan ke
// halaman login) — pembatas hanya memutus pencarian token.
export interface FailedAttemptLimiter {
  isBlocked(key: string, now?: number): boolean;
  recordFailure(key: string, now?: number): void;
  reset(key: string): void;
}

export function createFailedAttemptLimiter(options?: { maxFailures?: number; windowMs?: number }): FailedAttemptLimiter {
  const maxFailures = options?.maxFailures ?? 10;
  const windowMs = options?.windowMs ?? 10 * 60_000;
  const failures = new Map<string, number[]>();

  function recentFailures(key: string, now: number): number[] {
    const cutoff = now - windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length > 0) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  }

  return {
    isBlocked(key: string, now: number = Date.now()): boolean {
      return recentFailures(key, now).length >= maxFailures;
    },
    recordFailure(key: string, now: number = Date.now()): void {
      const kept = recentFailures(key, now);
      kept.push(now);
      failures.set(key, kept);
    },
    reset(key: string): void {
      failures.delete(key);
    },
  };
}
