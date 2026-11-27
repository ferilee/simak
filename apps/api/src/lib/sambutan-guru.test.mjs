// Tests for "Sambutan Guru" (kartu selamat datang ruang kerja guru:
// penanda tutup welcome_dismissed_at + endpoint dismiss + panduan_url).
// Run with bun from apps/api:  bun src/lib/sambutan-guru.test.mjs
//
// There is no test database in this repo's convention, so: the pure
// helpers (lib/sambutan-guru.ts) are tested behaviorally, and the route
// wiring (guru-only guard, idempotent dismiss, /me payload fields,
// schema + migration) is locked statically against the sources.
import { readFileSync } from "node:fs";
import { isWelcomeDismissed, readPanduanUrl } from "./sambutan-guru.ts";

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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
console.log("Case 1: readPanduanUrl — env opsional, kosong berarti null");
{
  check("tidak terdaftar → null", readPanduanUrl({}) === null);
  check("undefined → null", readPanduanUrl({ SIMAK_PANDUAN_URL: undefined }) === null);
  check("string kosong → null", readPanduanUrl({ SIMAK_PANDUAN_URL: "" }) === null);
  check("hanya spasi → null", readPanduanUrl({ SIMAK_PANDUAN_URL: "   " }) === null);
  check("URL dikembalikan apa adanya", readPanduanUrl({ SIMAK_PANDUAN_URL: "https://contoh.sch.id/panduan.pdf" }) === "https://contoh.sch.id/panduan.pdf");
  check("URL di-trim", readPanduanUrl({ SIMAK_PANDUAN_URL: "  https://contoh.sch.id/p  " }) === "https://contoh.sch.id/p");
}

// ---------------------------------------------------------------------------
console.log("Case 2: isWelcomeDismissed — hanya null/undefined yang berarti belum ditutup");
{
  check("null → belum ditutup", isWelcomeDismissed(null) === false);
  check("undefined → belum ditutup", isWelcomeDismissed(undefined) === false);
  check("Date → sudah ditutup", isWelcomeDismissed(new Date()) === true);
  check("string tanggal → sudah ditutup", isWelcomeDismissed("2026-11-28T00:00:00.000Z") === true);
}

// ---------------------------------------------------------------------------
console.log("Case 3: endpoint dismiss — khusus guru, idempoten, mengembalikan nilai terbaru");
{
  const guru = read("../routes/guru.ts");
  check("rute POST /welcome/dismiss terdaftar", guru.includes('post("/welcome/dismiss"'));
  check("seluruh rute guru dijaga requireRole(\"guru\")", guru.includes('guruRoutes.use("*", requireRole("guru"))'));
  check("pembaruan hanya bila masih NULL (idempoten)", guru.includes("isNull(users.welcomeDismissedAt)"));
  check("pembaruan menetapkan welcomeDismissedAt", guru.includes("set({ welcomeDismissedAt: new Date() })"));
  check("balikan membawa welcome_dismissed_at terbaru", guru.includes("welcome_dismissed_at: me?.welcomeDismissedAt ?? null"));
  const auth = read("../middleware/auth.ts");
  check("requireRole menolak peran lain dengan 403", auth.includes('user.role !== role') && auth.includes("403"));
}

// ---------------------------------------------------------------------------
console.log("Case 4: /auth/me membawa welcome_dismissed_at + panduan_url");
{
  const authRoutes = read("../routes/auth.ts");
  check("/me menyertakan welcome_dismissed_at pada user", authRoutes.includes("welcome_dismissed_at: welcomeDismissedAt"));
  check("/me menyertakan panduan_url", authRoutes.includes("panduan_url: panduanUrl()"));
  check("penanda hanya dibaca untuk peran guru", authRoutes.includes('user.role === "guru"'));
}

// ---------------------------------------------------------------------------
console.log("Case 5: skema + migrasi 0024 konsisten");
{
  const schemaUsers = read("../../../../packages/db/src/schema/users.ts");
  check("skema users punya welcomeDismissedAt", schemaUsers.includes('welcomeDismissedAt: timestamp("welcome_dismissed_at")'));
  const sql = read("../../../../packages/db/migrations/0024_sambutan_guru.sql");
  check("migrasi 0024 menambahkan kolom", sql.includes("ALTER TABLE `users` ADD `welcome_dismissed_at` timestamp;"));
  const journal = read("../../../../packages/db/migrations/meta/_journal.json");
  check("jurnal mencatat 0024_sambutan_guru", journal.includes('"tag": "0024_sambutan_guru"'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
