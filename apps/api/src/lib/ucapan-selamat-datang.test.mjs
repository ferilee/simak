// Tests for ucapan selamat datang murid (modal sambutan pertama):
// aturan penanda server, migrasinya, dan wiring route murid.
// Run with bun from apps/api:  bun src/lib/ucapan-selamat-datang.test.mjs
//
// Yang dikunci di sini:
//  - needsWelcome murni dari welcomed_at: NULL → disambut, terisi →
//    tidak pernah lagi. Penanda di server karena murid berbagi
//    perangkat.
//  - /murid/today membawa needs_welcome dengan pola gagal-aman
//    (kegagalan query → modal tidak tampil, beranda tidak gagal).
//  - POST /murid/welcome/seen hanya mengisi penanda yang masih NULL.
//  - Migrasi 0015 menambahkan users.welcomed_at dan menutup jurnal.
import { readFileSync } from "node:fs";
import { needsWelcome } from "./sapaan.ts";

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

check("welcomed_at NULL → perlu disambut", needsWelcome(null) === true);
check("welcomed_at tak terbaca (undefined) → perlu disambut", needsWelcome(undefined) === true);
check("welcomed_at terisi → tidak disambut lagi", needsWelcome(new Date("2026-11-11T02:00:00Z")) === false);

const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
check("route /today membawa needs_welcome", muridRoute.includes("needs_welcome: showWelcome"));
check("keputusan sambutan memakai needsWelcome dari lib/sapaan", muridRoute.includes("showWelcome = needsWelcome(me?.welcomedAt)"));
check("endpoint penanda sambutan terdaftar", muridRoute.includes('muridRoutes.post("/welcome/seen"'));
check(
  "penanda hanya diisi saat masih NULL (idempoten, waktu pertama tidak bergeser)",
  muridRoute.includes("isNull(users.welcomedAt)"),
);
check("seluruh route murid tetap khusus peran murid", muridRoute.includes('muridRoutes.use("*", requireRole("murid"))'));

const migration = readFileSync(
  new URL("../../../../packages/db/migrations/0015_ucapan_selamat_datang.sql", import.meta.url),
  "utf8",
);
check(
  "migrasi 0015 menambahkan kolom welcomed_at yang boleh NULL",
  migration.includes("ALTER TABLE `users` ADD `welcomed_at` timestamp;"),
);
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
const lastEntry = journal.entries.at(-1);
check(
  "jurnal migrasi berakhir di 0015_ucapan_selamat_datang (16 entri)",
  journal.entries.length === 16 && lastEntry.idx === 15 && lastEntry.tag === "0015_ucapan_selamat_datang",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
