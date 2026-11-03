// Tests for the "Bagikan WA" assignment share message (v1.0.22).
// Run with bun from apps/web:  bun lib/wa-share.test.mjs
//
// Case 1 is a GOLDEN test: the message built from the agreed sample inputs
// must equal the approved target text byte-for-byte (emoji, blank lines,
// "pukul", inline URLs, class join code).
import { buildWhatsAppShareMessage } from "./wa-share.ts";

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

const ORIGIN = "https://simak.smkpasirian-lmj.sch.id";
const DUE = "2026-11-02T08:00:00Z"; // = Senin, 2 November 2026 pukul 15.00 WIB

// Case 1: golden — satu kelas berkode, tanpa tautan kuis RUAS.
console.log("Case 1: golden (satu kelas, tanpa ruas_quiz_url)");
const golden = buildWhatsAppShareMessage(
  {
    title: "Matematika Keuangan · XI DPIB",
    due_at: DUE,
    ruas_quiz_url: null,
    classes: [{ name: "XI DPIB", join_code: "ECE4E736E7" }],
  },
  ORIGIN,
);
const expected = [
  "📚 *Matematika Keuangan · XI DPIB*",
  "Kelas: XI DPIB",
  "Kode kelas: ECE4E736E7",
  "",
  "Kegiatan belajar hari ini:",
  "1. Baca dan pahami materi di SIMAK https://simak.smkpasirian-lmj.sch.id",
  "2. Kerjakan LKPD-nya di SIMAK",
  "3. Kerjakan kuis di RUAS https://ruas.smkpasirian-lmj.sch.id",
  "4. Isi exit ticket 3-2-1 di SIMAK",
  "",
  "⏰ Batas pengumpulan: Senin, 2 November 2026 pukul 15.00 WIB — pengumpulan tercatat sebagai kehadiran.",
  "🔑 Gunakan akun RUAS untuk masuk ke SIMAK",
].join("\n");
check("persis sama dengan teks target", golden === expected, golden === expected ? "" : `\n--- didapat ---\n${golden}\n--- diharapkan ---\n${expected}`);
check("baris 🔗 lama hilang", !golden.includes("🔗"));
check("diakhiri baris akun RUAS", golden.endsWith("🔑 Gunakan akun RUAS untuk masuk ke SIMAK"));

// Case 2: banyak kelas — pasangan "Nama — KODE", kelas tanpa kode dilewati.
console.log("Case 2: banyak kelas");
const multi = buildWhatsAppShareMessage(
  {
    title: "Tugas X",
    due_at: DUE,
    ruas_quiz_url: null,
    classes: [
      { name: "XI DPIB", join_code: "ECE4E736E7" },
      { name: "XI TKJ A", join_code: "AB12CD34EF" },
      { name: "XI RPL", join_code: null },
    ],
  },
  ORIGIN,
);
check("baris Kelas memuat semua nama", multi.includes("Kelas: XI DPIB, XI TKJ A, XI RPL"));
check("baris Kode kelas berpasangan", multi.includes("Kode kelas: XI DPIB — ECE4E736E7 · XI TKJ A — AB12CD34EF"));
check("kelas tanpa kode tidak muncul di baris kode", !multi.split("\n").find((line) => line.startsWith("Kode kelas:"))?.includes("RPL"));

// Case 3: tanpa kelas sama sekali — tidak ada baris Kelas/Kode kelas.
console.log("Case 3: tanpa kelas");
const noClass = buildWhatsAppShareMessage(
  { title: "Tugas Y", due_at: DUE, ruas_quiz_url: null, classes: [] },
  ORIGIN,
);
check("tanpa baris Kelas", !noClass.includes("Kelas:"));
check("tanpa baris Kode kelas", !noClass.includes("Kode kelas:"));
check("judul tetap di baris pertama", noClass.split("\n")[0] === "📚 *Tugas Y*");

// Case 4: ruas_quiz_url terisi dipakai di langkah 3; kosong → fallback.
console.log("Case 4: tautan kuis RUAS");
const withQuiz = buildWhatsAppShareMessage(
  { title: "Tugas Z", due_at: DUE, ruas_quiz_url: "https://ruas.smkpasirian-lmj.sch.id/quiz/7?subject_id=1", classes: [] },
  ORIGIN,
);
check("langkah 3 memakai ruas_quiz_url", withQuiz.includes("3. Kerjakan kuis di RUAS https://ruas.smkpasirian-lmj.sch.id/quiz/7?subject_id=1"));
const emptyQuiz = buildWhatsAppShareMessage(
  { title: "Tugas Z", due_at: DUE, ruas_quiz_url: "", classes: [] },
  ORIGIN,
);
check("string kosong → fallback RUAS polos", emptyQuiz.includes("3. Kerjakan kuis di RUAS https://ruas.smkpasirian-lmj.sch.id\n"));

// Case 5: satu kelas tanpa kode — ada baris Kelas, tidak ada baris Kode kelas.
console.log("Case 5: satu kelas tanpa kode");
const noCode = buildWhatsAppShareMessage(
  { title: "Tugas W", due_at: DUE, ruas_quiz_url: null, classes: [{ name: "X TKR A", join_code: "" }] },
  ORIGIN,
);
check("baris Kelas ada", noCode.includes("Kelas: X TKR A"));
check("baris Kode kelas tidak ada", !noCode.includes("Kode kelas:"));

// Case 6: mode kelompok — baris 👥 muncul sesudah baris kode kelas, dan
// pesan lengkapnya terkunci sebagai golden kedua.
console.log("Case 6: penugasan kelompok (golden)");
const groupMessage = buildWhatsAppShareMessage(
  {
    title: "Matematika Keuangan · XI DPIB",
    due_at: DUE,
    ruas_quiz_url: null,
    work_mode: "kelompok",
    classes: [{ name: "XI DPIB", join_code: "ECE4E736E7" }],
  },
  ORIGIN,
);
const expectedGroup = [
  "📚 *Matematika Keuangan · XI DPIB*",
  "Kelas: XI DPIB",
  "Kode kelas: ECE4E736E7",
  "👥 Penugasan ini dikerjakan berkelompok — lihat kelompokmu di SIMAK.",
  "",
  "Kegiatan belajar hari ini:",
  "1. Baca dan pahami materi di SIMAK https://simak.smkpasirian-lmj.sch.id",
  "2. Kerjakan LKPD-nya di SIMAK",
  "3. Kerjakan kuis di RUAS https://ruas.smkpasirian-lmj.sch.id",
  "4. Isi exit ticket 3-2-1 di SIMAK",
  "",
  "⏰ Batas pengumpulan: Senin, 2 November 2026 pukul 15.00 WIB — pengumpulan tercatat sebagai kehadiran.",
  "🔑 Gunakan akun RUAS untuk masuk ke SIMAK",
].join("\n");
check("persis sama dengan teks target kelompok", groupMessage === expectedGroup, groupMessage === expectedGroup ? "" : `\n--- didapat ---\n${groupMessage}\n--- diharapkan ---\n${expectedGroup}`);

// Case 7: work_mode individu eksplisit sama persis dengan tanpa work_mode.
console.log("Case 7: mode individu eksplisit");
const individuExplicit = buildWhatsAppShareMessage(
  { title: "Matematika Keuangan · XI DPIB", due_at: DUE, ruas_quiz_url: null, work_mode: "individu", classes: [{ name: "XI DPIB", join_code: "ECE4E736E7" }] },
  ORIGIN,
);
check("tanpa baris kelompok", !individuExplicit.includes("👥"));
check("identik dengan golden individu", individuExplicit === expected);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
