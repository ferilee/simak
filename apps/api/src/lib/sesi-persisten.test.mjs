// Tests for Sesi Persisten (Tahap 1 Hub Murid): kebijakan masa berlaku
// sesi di lib/session-policy.ts (MURNI) + pengkabelan penyimpanan basis
// data di lib/session.ts + migrasi 0019 tabel sessions.
// Run with bun from apps/api:  bun src/lib/sesi-persisten.test.mjs
//
// Yang dikunci di sini:
//  - Hash sesi = SHA-256 hex (64 char) dari id sesi; vektor uji resmi
//    SHA-256("abc"); deterministik; id berbeda → hash berbeda.
//  - Masa berlaku 30 hari MELUNCUR: planNewSession menaruh expires di
//    now+30 hari; resolusi baris segar diterima tanpa sentuh; baris
//    yang aktivitas terakhirnya melewati ambang 24 jam diterima DENGAN
//    sentuh dan expires digeser ke now+30 hari; tepat di ambang ikut
//    disentuh; di bawah ambang tidak.
//  - Kedaluwarsa: expiresAt <= now ditolak (termasuk tepat sama dengan).
//  - Ambang sentuh (24 jam) jauh di bawah masa berlaku (30 hari).
//  - Pengkabelan: session.ts tidak lagi memakai Map ingatan; membuat
//    sesi menyapu baris kedaluwarsa lalu INSERT hash; resolusi JOIN ke
//    users dan gagal-lembut (basis data tak terjangkau → null); logout
//    DELETE baris; cookie diterbitkan ulang saat sentuh; routes/auth +
//    middleware meng-await fungsi sesi yang kini async.
//  - Migrasi: 0019_sesi_persisten di idx 19 pada jurnal;
//    SQL 0019 membuat tabel sessions (token_hash varchar(64) PK,
//    user_id FK ke users, indeks expires); skema Drizzle mengekspor
//    tabel sessions dengan kolom yang sama.
import { readFileSync } from "node:fs";
import {
  SESSION_TOUCH_THRESHOLD_MS,
  SESSION_TTL_MS,
  hashSessionToken,
  isSessionExpired,
  planNewSession,
  planSessionResolution,
} from "./session-policy.ts";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

// --- Konstanta ---------------------------------------------------------------
check("masa berlaku sesi = 30 hari", SESSION_TTL_MS === 30 * DAY, `got ${SESSION_TTL_MS}`);
check("ambang sentuh = 24 jam", SESSION_TOUCH_THRESHOLD_MS === DAY, `got ${SESSION_TOUCH_THRESHOLD_MS}`);
check("ambang sentuh jauh di bawah masa berlaku", SESSION_TOUCH_THRESHOLD_MS < SESSION_TTL_MS / 7);

// --- Hash sesi -----------------------------------------------------------------
check(
  "hash = SHA-256 resmi dari \"abc\"",
  hashSessionToken("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  hashSessionToken("abc"),
);
check("hash selalu 64 char hex", /^[0-9a-f]{64}$/.test(hashSessionToken("550e8400-e29b-41d4-a716-446655440000")));
check("hash deterministik", hashSessionToken("id-yang-sama") === hashSessionToken("id-yang-sama"));
check("id berbeda → hash berbeda", hashSessionToken("id-a") !== hashSessionToken("id-b"));
check("hash bukan id mentahnya", hashSessionToken("id-a") !== "id-a");

// --- Rencana sesi baru -----------------------------------------------------------
const fresh = planNewSession(NOW);
check("sesi baru: created = lastSeen = now", fresh.createdAtMs === NOW && fresh.lastSeenAtMs === NOW);
check("sesi baru: expires = now + 30 hari", fresh.expiresAtMs === NOW + 30 * DAY);

// --- Kedaluwarsa -------------------------------------------------------------------
check("expires di masa lalu → kedaluwarsa", isSessionExpired(NOW - 1, NOW) === true);
check("expires tepat now → kedaluwarsa", isSessionExpired(NOW, NOW) === true);
check("expires 1ms lagi → belum kedaluwarsa", isSessionExpired(NOW + 1, NOW) === false);

// --- Resolusi: ditolak ----------------------------------------------------------------
const expired = planSessionResolution({ expiresAtMs: NOW - 1000, lastSeenAtMs: NOW - 1000 }, NOW);
check("baris kedaluwarsa → reject/expired", expired.action === "reject" && expired.reason === "expired");
const expiredEdge = planSessionResolution({ expiresAtMs: NOW, lastSeenAtMs: NOW }, NOW);
check("baris expires tepat now → reject", expiredEdge.action === "reject");

// --- Resolusi: diterima tanpa sentuh ------------------------------------------------------
const recent = planSessionResolution({ expiresAtMs: NOW + 29 * DAY, lastSeenAtMs: NOW - 60 * 1000 }, NOW);
check("baris segar → accept tanpa sentuh", recent.action === "accept" && recent.touch === false);
check(
  "tanpa sentuh: expires & lastSeen tidak berubah",
  recent.action === "accept" && recent.nextExpiresAtMs === NOW + 29 * DAY && recent.nextLastSeenAtMs === NOW - 60 * 1000,
);
const justUnder = planSessionResolution({ expiresAtMs: NOW + 29 * DAY, lastSeenAtMs: NOW - (DAY - 1) }, NOW);
check("aktivitas 23.59 jam lalu → belum disentuh", justUnder.action === "accept" && justUnder.touch === false);

// --- Resolusi: diterima dengan sentuh (meluncur) --------------------------------------------
const stale = planSessionResolution({ expiresAtMs: NOW + 5 * DAY, lastSeenAtMs: NOW - 2 * DAY }, NOW);
check("aktivitas 2 hari lalu → accept dengan sentuh", stale.action === "accept" && stale.touch === true);
check(
  "sentuh menggeser expires ke now + 30 hari (meluncur, bukan sisa lama)",
  stale.action === "accept" && stale.nextExpiresAtMs === NOW + 30 * DAY && stale.nextLastSeenAtMs === NOW,
);
const atThreshold = planSessionResolution({ expiresAtMs: NOW + 29 * DAY, lastSeenAtMs: NOW - DAY }, NOW);
check("aktivitas tepat 24 jam lalu → disentuh", atThreshold.action === "accept" && atThreshold.touch === true);
const nearExpiry = planSessionResolution({ expiresAtMs: NOW + 60 * 1000, lastSeenAtMs: NOW - 3 * DAY }, NOW);
check(
  "hampir kedaluwarsa tapi aktif → diselamatkan luncuran penuh 30 hari",
  nearExpiry.action === "accept" && nearExpiry.touch === true && nearExpiry.nextExpiresAtMs === NOW + 30 * DAY,
);

// --- Pengkabelan session.ts ---------------------------------------------------------------------
const sessionSrc = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
check("session.ts tidak lagi memakai Map ingatan", !sessionSrc.includes("new Map"));
check("session.ts tidak lagi menyimpan expiresAt di ingatan", !sessionSrc.includes("sessions.set("));
check("session.ts membaca tabel lewat @simak/db", sessionSrc.includes('from "@simak/db"') && sessionSrc.includes("schema"));
check("pembuatan sesi: sapu kedaluwarsa lalu insert hash", sessionSrc.includes("db.delete(sessions)") && sessionSrc.includes("db.insert(sessions)") && sessionSrc.includes("tokenHash: hashSessionToken(sessionId)"));
check("id mentah tidak pernah ditulis sebagai tokenHash", !/tokenHash:\s*sessionId/.test(sessionSrc));
check("resolusi: JOIN sessions→users", sessionSrc.includes("innerJoin(users, eq(users.id, sessions.userId))"));
check("resolusi memakai planSessionResolution", sessionSrc.includes("planSessionResolution("));
check("resolusi gagal-lembut: tangkapan galat basis data → null", /catch \{\s*\n?\s*return null;/.test(sessionSrc));
check("baris kedaluwarsa dibuang saat resolusi (reject → delete)", sessionSrc.includes('plan.action === "reject"') && sessionSrc.includes("db.delete(sessions)"));
check("logout menghapus baris (revokeSession → delete by hash)", sessionSrc.includes("db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(sessionId)))"));
check("cookie diterbitkan ulang saat sentuh", sessionSrc.includes("resolved.touched && value") && sessionSrc.includes("attachSessionCookie(c, value)"));
check("bentuk cookie tidak berubah (nama + nilai bertanda tangan)", sessionSrc.includes('SESSION_COOKIE = "simak_session"') && sessionSrc.includes("signedValue(sessionId)"));

// --- Pengkabelan pemanggil --------------------------------------------------------------------------
const authRoutesSrc = readFileSync(new URL("../routes/auth.ts", import.meta.url), "utf8");
check("login meng-await createSession", authRoutesSrc.includes("await createSession(user)"));
check("login: galat penyimpanan sesi → 503 yang sama", authRoutesSrc.includes('session = await createSession(user)') && authRoutesSrc.includes("Penyimpanan SIMAK sedang tidak tersedia."));
check("logout meng-await revokeSession", authRoutesSrc.includes("await revokeSession(session)"));
check("/me meng-await getSessionFromRequest", authRoutesSrc.includes("await getSessionFromRequest(c)"));
const middlewareSrc = readFileSync(new URL("../middleware/auth.ts", import.meta.url), "utf8");
check("middleware loadSession meng-await getSessionFromRequest", middlewareSrc.includes("await getSessionFromRequest(c)"));

// --- Migrasi & skema -----------------------------------------------------------------------------------
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
check("jurnal migrasi 24 entri", journal.entries.length === 24, `got ${journal.entries.length}`);
const entry0019 = journal.entries[19];
check("entri 0019_sesi_persisten tetap di idx 19", entry0019.tag === "0019_sesi_persisten" && entry0019.idx === 19, JSON.stringify(entry0019));

const migrationSql = readFileSync(
  new URL("../../../../packages/db/migrations/0019_sesi_persisten.sql", import.meta.url),
  "utf8",
);
check("SQL 0019 membuat tabel sessions", migrationSql.includes("CREATE TABLE `sessions`"));
check("token_hash varchar(64) kunci utama", migrationSql.includes("`token_hash` varchar(64) NOT NULL") && migrationSql.includes("PRIMARY KEY(`token_hash`)"));
check("user_id FK ke users(id)", migrationSql.includes("FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)"));
check("kolom waktu lengkap (created/expires/last_seen)", migrationSql.includes("`created_at`") && migrationSql.includes("`expires_at`") && migrationSql.includes("`last_seen_at`"));
check("indeks expires_at untuk sapuan kedaluwarsa", migrationSql.includes("CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`)"));

const schemaSrc = readFileSync(new URL("../../../../packages/db/src/schema/sessions.ts", import.meta.url), "utf8");
check("skema Drizzle sessions: tokenHash PK varchar(64)", schemaSrc.includes('varchar("token_hash", { length: 64 }).primaryKey()'));
check("skema Drizzle sessions: userId mengacu users.id", schemaSrc.includes(".references(() => users.id)"));
const schemaIndexSrc = readFileSync(new URL("../../../../packages/db/src/schema/index.ts", import.meta.url), "utf8");
check("skema index mengekspor sessions", schemaIndexSrc.includes('export * from "./sessions";'));

console.log(`\nAPI sesi-persisten: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
