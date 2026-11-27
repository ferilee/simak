// Tests for Serah-Terima Masuk RUAS -> SIMAK (Tahap 4 Hub Murid):
// kebijakan murni di lib/serah-terima.ts + pengkabelan endpoint internal
// dan rute penukaran di routes/serah-terima.ts + migrasi 0022 tabel
// ruas_handoff_tokens. Cermin uji sisi RUAS (simak-handoff) untuk arah
// sebaliknya.
// Run with bun from apps/api:  bun src/lib/serah-terima-masuk.test.mjs
//
// Yang dikunci di sini:
//  - Token: 32 byte acak base64url (43 char), dua token selalu berbeda;
//    yang disimpan hanya SHA-256 hex (vektor resmi "abc"); hash !=
//    token mentah; TTL tepat 60 detik.
//  - Penjaga rahasia: belum disetel -> not_configured (404); header
//    hilang/salah -> unauthorized (401); cocok -> ok; banding aman
//    untuk panjang berbeda (tidak melempar).
//  - Penerbitan: identitas null (asing / tidak aktif / admin tak
//    terpetakan) -> not_found; identitas sah -> issue.
//  - Penukaran: baris tidak ada -> not_found; used_at terisi ->
//    already_used; expiresAt <= now (termasuk tepat sama) -> expired;
//    baris sah -> ok dengan userId dari baris token.
//  - Pengalihan per peran: murid -> /murid, guru -> /guru.
//  - Pembatas gagal: 10 kegagalan / 10 menit per kunci memblokir;
//    jendela berlalu membuka; reset membersihkan; kunci lain tak ikut.
//  - Pengkabelan: rute internal memverifikasi x-internal-secret
//    terhadap RUAS_INTERNAL_SECRET, mencari identitas lewat
//    findRuasIdentityByUsername, menyinkronkan profil lewat
//    upsertSimakProfile, dan hanya menyimpan hash; rute penukaran
//    mengklaim atomik (used_at IS NULL), memakai createSession +
//    attachSessionCookie yang sama dengan login, dan dipasang di
//    app.ts SEBELUM logger (token tak masuk log); Caddy mengarahkan
//    /masuk-ruas/* ke API.
//  - Migrasi: jurnal 25 entri; 0022_token_serah_terima tetap di
//    idx 22; SQL 0022 membuat tabel ruas_handoff_tokens (token_hash
//    varchar(64) PK, user_id FK ke users, expires/used/created);
//    skema Drizzle mengekspor tabel yang sama.
import { readFileSync } from "node:fs";
import {
  HANDOFF_TOKEN_BYTES,
  HANDOFF_TOKEN_TTL_MS,
  createFailedAttemptLimiter,
  evaluateInternalGuard,
  evaluateRedemption,
  generateHandoffToken,
  handoffHomePath,
  hashHandoffToken,
  planHandoffIssue,
  secretsMatch,
} from "./serah-terima.ts";

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

const NOW = 1_800_000_000_000;

// --- Konstanta & token ---------------------------------------------------------
check("TTL token = 60 detik", HANDOFF_TOKEN_TTL_MS === 60_000, `got ${HANDOFF_TOKEN_TTL_MS}`);
check("ukuran token mentah = 32 byte", HANDOFF_TOKEN_BYTES === 32, `got ${HANDOFF_TOKEN_BYTES}`);

const tokenA = generateHandoffToken();
const tokenB = generateHandoffToken();
check("token base64url 43 char (32 byte)", /^[A-Za-z0-9_-]{43}$/.test(tokenA), tokenA);
check("dua token selalu berbeda", tokenA !== tokenB);
check(
  "hash = SHA-256 resmi dari \"abc\"",
  hashHandoffToken("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  hashHandoffToken("abc"),
);
check("hash selalu 64 char hex", /^[0-9a-f]{64}$/.test(hashHandoffToken(tokenA)));
check("hash bukan token mentahnya", hashHandoffToken(tokenA) !== tokenA);
check("hash deterministik", hashHandoffToken(tokenA) === hashHandoffToken(tokenA));

// --- Banding rahasia ------------------------------------------------------------
check("rahasia sama -> cocok", secretsMatch("rahasia-bersama", "rahasia-bersama") === true);
check("rahasia beda -> tidak cocok", secretsMatch("rahasia-salah", "rahasia-bersama") === false);
check("panjang beda -> tidak cocok, tidak melempar", secretsMatch("pendek", "rahasia-bersama-yang-jauh-lebih-panjang") === false);

// --- Penjaga endpoint internal ----------------------------------------------------
check("rahasia belum disetel -> not_configured (404)", evaluateInternalGuard(undefined, "apa pun") === "not_configured");
check("rahasia kosong -> not_configured (404)", evaluateInternalGuard("", "apa pun") === "not_configured");
check("header hilang -> unauthorized (401)", evaluateInternalGuard("rahasia-bersama", undefined) === "unauthorized");
check("header salah -> unauthorized (401)", evaluateInternalGuard("rahasia-bersama", "bukan-rahasia") === "unauthorized");
check("header cocok -> ok", evaluateInternalGuard("rahasia-bersama", "rahasia-bersama") === "ok");

// --- Keputusan penerbitan -----------------------------------------------------------
check(
  "identitas null (asing/tidak aktif/admin) -> not_found",
  planHandoffIssue(null).action === "not_found",
);
check(
  "identitas murid sah -> issue",
  planHandoffIssue({ ruasUserId: "7", username: "murid_a", name: "Murid A", role: "murid", isActive: true }).action === "issue",
);
check(
  "identitas guru sah -> issue",
  planHandoffIssue({ ruasUserId: "9", username: "guru_a", name: "Guru A", role: "guru", isActive: true }).action === "issue",
);

// --- Keputusan penukaran --------------------------------------------------------------
check("baris tidak ada -> not_found", evaluateRedemption(null, NOW).ok === false && evaluateRedemption(null, NOW).reason === "not_found");
check(
  "sudah terpakai -> already_used",
  evaluateRedemption({ userId: 5, expiresAtMs: NOW + 30_000, usedAtMs: NOW - 1_000 }, NOW).reason === "already_used",
);
check(
  "kedaluwarsa -> expired",
  evaluateRedemption({ userId: 5, expiresAtMs: NOW - 1, usedAtMs: null }, NOW).reason === "expired",
);
check(
  "expires tepat now -> expired",
  evaluateRedemption({ userId: 5, expiresAtMs: NOW, usedAtMs: null }, NOW).reason === "expired",
);
const validDecision = evaluateRedemption({ userId: 42, expiresAtMs: NOW + 1, usedAtMs: null }, NOW);
check("baris sah -> ok dengan userId baris token", validDecision.ok === true && validDecision.userId === 42);
check(
  "terpakai mengalahkan belum kedaluwarsa (tetap already_used)",
  evaluateRedemption({ userId: 5, expiresAtMs: NOW + 30_000, usedAtMs: NOW - 5_000 }, NOW).reason === "already_used",
);

// --- Pengalihan per peran -----------------------------------------------------------------
check("murid -> /murid", handoffHomePath("murid") === "/murid");
check("guru -> /guru", handoffHomePath("guru") === "/guru");

// --- Pembatas percobaan gagal ---------------------------------------------------------------
const limiter = createFailedAttemptLimiter();
for (let i = 0; i < 9; i++) limiter.recordFailure("ip-a", NOW + i);
check("9 kegagalan belum memblokir", limiter.isBlocked("ip-a", NOW + 100) === false);
limiter.recordFailure("ip-a", NOW + 100);
check("10 kegagalan memblokir", limiter.isBlocked("ip-a", NOW + 200) === true);
check("kunci lain tidak ikut terblokir", limiter.isBlocked("ip-b", NOW + 200) === false);
check("jendela 10 menit berlalu -> terbuka lagi", limiter.isBlocked("ip-a", NOW + 10 * 60_000 + 1_000) === false);
limiter.recordFailure("ip-c", NOW);
limiter.reset("ip-c");
check("reset membersihkan kegagalan", limiter.isBlocked("ip-c", NOW) === false);

// --- Pengkabelan rute -------------------------------------------------------------------------
const routesSrc = readFileSync(new URL("../routes/serah-terima.ts", import.meta.url), "utf8");
check("rute internal: POST /handoff terdaftar", routesSrc.includes('ruasInternalRoutes.post("/handoff"'));
check("rute internal: penjaga membaca header x-internal-secret", routesSrc.includes('c.req.header("x-internal-secret")'));
check("rute internal: penjaga memakai env RUAS_INTERNAL_SECRET", routesSrc.includes("evaluateInternalGuard(env.RUAS_INTERNAL_SECRET"));
check("rute internal: 404 belum disetel + 401 salah + 404 pengguna", routesSrc.includes("not_configured") && routesSrc.includes("unauthorized") && routesSrc.includes('"Pengguna tidak ditemukan atau tidak aktif."'));
check("rute internal: identitas lewat findRuasIdentityByUsername", routesSrc.includes("findRuasIdentityByUsername(username)"));
check("rute internal: profil disinkronkan lewat upsertSimakProfile", routesSrc.includes("upsertSimakProfile(identity)"));
check("rute internal: yang disimpan hanya hash token", routesSrc.includes("tokenHash: hashHandoffToken(rawToken)") && !routesSrc.includes("tokenHash: rawToken"));
check("rute internal: URL penukaran /masuk-ruas/ dari origin", routesSrc.includes("/masuk-ruas/${rawToken}"));
check("penukaran: GET /masuk-ruas/:token terdaftar", routesSrc.includes('masukRuasRoutes.get("/masuk-ruas/:token"'));
check("penukaran: klaim atomik used_at IS NULL", routesSrc.includes("isNull(ruasHandoffTokens.usedAt)") && routesSrc.includes("affectedRows !== 1"));
check("penukaran: sesi lewat createSession (sama dengan login)", routesSrc.includes("createSession(sessionUser)"));
check("penukaran: cookie lewat attachSessionCookie (sama dengan login)", routesSrc.includes("attachSessionCookie(c, session)"));
check("penukaran: pengalihan per peran lewat handoffHomePath", routesSrc.includes("c.redirect(handoffHomePath(u.role), 302)"));
check("penukaran: kegagalan -> redirect /login", routesSrc.includes('const LOGIN_PATH = "/login"'));
check("penukaran: sesi dari baris pengguna token (bukan parameter)", routesSrc.includes("userId: row.token.userId") || routesSrc.includes("userId: u.id"));

const authSrc = readFileSync(new URL("../routes/auth.ts", import.meta.url), "utf8");
check("login memakai createSession + attachSessionCookie yang sama", authSrc.includes("createSession(user)") && authSrc.includes("attachSessionCookie(c, session)"));

const ruasAuthSrc = readFileSync(new URL("./ruas-auth.ts", import.meta.url), "utf8");
check("ruas-auth mengekspor findRuasIdentityByUsername", ruasAuthSrc.includes("export async function findRuasIdentityByUsername"));
check("pencarian identitas tidak menyentuh password_hash", ruasAuthSrc.includes("SELECT id, username, display_name, role, active FROM users WHERE username = ?"));
check("pencarian identitas hanya jalur shared-db", ruasAuthSrc.includes('env.RUAS_AUTH_MODE !== "shared-db"'));

const appSrc = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
check("app memasang endpoint internal di /api/internal/ruas", appSrc.includes('app.route("/api/internal/ruas", ruasInternalRoutes)'));
check(
  "app memasang rute penukaran SEBELUM logger (token tak masuk log)",
  appSrc.indexOf('app.route("/", masukRuasRoutes)') !== -1 &&
    appSrc.indexOf('app.route("/", masukRuasRoutes)') < appSrc.indexOf('app.use("*", logger())'),
  `mount=${appSrc.indexOf('app.route("/", masukRuasRoutes)')} logger=${appSrc.indexOf('app.use("*", logger())')}`,
);

for (const caddyName of ["Caddyfile.production", "Caddyfile", "Caddyfile.staging"]) {
  const caddySrc = readFileSync(new URL(`../../../../${caddyName}`, import.meta.url), "utf8");
  check(`${caddyName} mengarahkan /masuk-ruas/* ke api`, caddySrc.includes("handle /masuk-ruas/*") && caddySrc.includes("reverse_proxy api:3001"));
}

// --- Migrasi & skema ----------------------------------------------------------------------------
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
check("jurnal migrasi 25 entri", journal.entries.length === 25, `got ${journal.entries.length}`);
const entry0022 = journal.entries[22];
check("entri 0022_token_serah_terima tetap di idx 22", entry0022.tag === "0022_token_serah_terima" && entry0022.idx === 22, JSON.stringify(entry0022));

const migrationSql = readFileSync(new URL("../../../../packages/db/migrations/0022_token_serah_terima.sql", import.meta.url), "utf8");
check("SQL 0022 membuat tabel ruas_handoff_tokens", migrationSql.includes("CREATE TABLE `ruas_handoff_tokens`"));
check("SQL 0022: token_hash varchar(64) kunci utama", migrationSql.includes("`token_hash` varchar(64) NOT NULL") && migrationSql.includes("PRIMARY KEY(`token_hash`)"));
check("SQL 0022: user_id FK ke users(id)", migrationSql.includes("FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)"));
check("SQL 0022: expires_at NOT NULL + used_at nullable + created_at", migrationSql.includes("`expires_at` timestamp NOT NULL") && migrationSql.includes("`used_at` timestamp,") && migrationSql.includes("`created_at` timestamp"));
check("SQL 0022: indeks expires_at untuk sapuan kedaluwarsa", migrationSql.includes("CREATE INDEX `ruas_handoff_tokens_expires_idx` ON `ruas_handoff_tokens` (`expires_at`)"));

const schemaSrc = readFileSync(new URL("../../../../packages/db/src/schema/ruas-handoff-tokens.ts", import.meta.url), "utf8");
check("skema Drizzle ruasHandoffTokens: tokenHash PK varchar(64)", schemaSrc.includes('varchar("token_hash", { length: 64 }).primaryKey()'));
check("skema Drizzle ruasHandoffTokens: userId mengacu users.id", schemaSrc.includes(".references(() => users.id)"));
const schemaIndexSrc = readFileSync(new URL("../../../../packages/db/src/schema/index.ts", import.meta.url), "utf8");
check("skema index mengekspor ruas-handoff-tokens", schemaIndexSrc.includes('export * from "./ruas-handoff-tokens";'));

console.log(`\nAPI serah-terima-masuk: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
