// Static source test for the integrity transparency banner (v1.0.24).
// Run with bun from apps/web:  bun lib/banner-integritas.test.mjs
//
// The banner is presentation-only: this test pins the exact approved copy
// (bold title + the original body sentence byte-for-byte), the amber banner
// styling tokens, and that rendering stays gated on assignmentId — the same
// condition as before, so the banner appears only when an LKPD is opened
// through an assignment.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../app/murid/worksheets/[id]/page.tsx"), "utf8");

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

const TITLE = "Aktivitasmu di halaman ini dicatat";
const BODY = "Untuk membantu guru meninjau proses belajar, SIMAK mencatat indikasi seperti berpindah halaman dan aktivitas clipboard. Ini bukan penilaian otomatis bahwa Anda melakukan kecurangan.";

console.log("Banner integritas kontras — tes statis sumber:");

check("judul tebal persis seperti disetujui", source.includes(`>${TITLE}</p>`));
check("kalimat isi persis byte-for-byte (tidak diubah)", source.includes(`>${BODY}</p>`));
check("latar amber #FFFAEB", source.includes('background: "#FFFAEB"'));
check("garis tepi #F79009", source.includes('border: "1px solid #F79009"'));
check("warna teks #93370D", source.includes('color: "#93370D"'));
check("ikon info ℹ️ ada", source.includes("ℹ️"));
check("render tetap bersyarat assignmentId", /\{assignmentId \? \(\s*<div style=\{styles\.integrityNotice\}>/.test(source));
check("pelaporan /integrity tetap ada (tidak disentuh)", source.includes('apiRequest("/integrity"'));

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
