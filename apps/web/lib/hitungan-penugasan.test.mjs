// Tests for hitungan chip penugasan mengikuti kelas (lib/hitungan-penugasan.ts
// + wiring di app/guru/page.tsx).
// Run with bun from apps/web:  bun lib/hitungan-penugasan.test.mjs
//
// Yang dikunci di sini:
//  - Himpunan dasar hitungan chip = penugasan yang lolos saringan KELAS
//    terpilih ("semua"/null → semua; id kelas → hanya kelas itu, termasuk
//    penugasan multi-kelas yang memang memuatnya; "siswa" → hanya
//    penugasan bersasaran siswa tertentu).
//  - Semua selalu = terbit + draf + ditutup di dalam himpunan dasar;
//    status kelas lain tidak bocor; kelas tanpa penugasan → semua nol.
//  - Skenario tangkapan layar pengguna: 42 penugasan lintas kelas, kelas
//    terpilih hanya punya 4 (semua terbit) → hitungan {4, 4, 0, 0}.
//  - Wiring halaman: chip dan penyebut "Menampilkan X dari Y" memakai
//    hasil lib dengan kelas terpilih (bukan array penuh), dan daftar
//    tampil tetap berkomposisi kelas dulu lalu status.
import { readFileSync } from "node:fs";
import { filterAssignmentsByClass, planAssignmentCounts } from "./hitungan-penugasan.ts";

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

function sameCounts(actual, expected) {
  return actual.total === expected.total
    && actual.terbit === expected.terbit
    && actual.draf === expected.draf
    && actual.ditutup === expected.ditutup;
}

function fmt(counts) {
  return `{total:${counts.total}, terbit:${counts.terbit}, draf:${counts.draf}, ditutup:${counts.ditutup}}`;
}

// Dua kelas (10 dan 11), satu penugasan multi-kelas (id 6, ditutup),
// satu penugasan siswa tertentu (id 8, terbit).
const A = [
  { id: 1, status: "terbit", target_type: "kelas", classes: [{ id: 10, name: "X A" }] },
  { id: 2, status: "draf", target_type: "kelas", classes: [{ id: 10, name: "X A" }] },
  { id: 3, status: "ditutup", target_type: "kelas", classes: [{ id: 10, name: "X A" }] },
  { id: 4, status: "terbit", target_type: "kelas", classes: [{ id: 11, name: "X B" }] },
  { id: 5, status: "terbit", target_type: "kelas", classes: [{ id: 11, name: "X B" }] },
  { id: 6, status: "ditutup", target_type: "kelas", classes: [{ id: 11, name: "X B" }, { id: 10, name: "X A" }] },
  { id: 7, status: "draf", target_type: "kelas", classes: [{ id: 11, name: "X B" }] },
  { id: 8, status: "terbit", target_type: "siswa", classes: [] },
];

console.log("Case 1: tanpa saringan kelas (null / 'semua' / undefined)");
{
  const expected = { total: 8, terbit: 4, draf: 2, ditutup: 2 };
  check("null menghitung semua penugasan", sameCounts(planAssignmentCounts(A, null), expected), fmt(planAssignmentCounts(A, null)));
  check("'semua' sama dengan null", sameCounts(planAssignmentCounts(A, "semua"), expected));
  check("undefined sama dengan null", sameCounts(planAssignmentCounts(A, undefined), expected));
  check("filter 'semua' meloloskan semua", filterAssignmentsByClass(A, "semua").length === 8);
}

console.log("Case 2: kelas tertentu — status kelas lain tidak bocor");
{
  const c10 = planAssignmentCounts(A, "10");
  check("kelas 10: {4, 1, 1, 2} (multi-kelas id 6 ikut)", sameCounts(c10, { total: 4, terbit: 1, draf: 1, ditutup: 2 }), fmt(c10));
  const c11 = planAssignmentCounts(A, "11");
  check("kelas 11: {4, 2, 1, 1}", sameCounts(c11, { total: 4, terbit: 2, draf: 1, ditutup: 1 }), fmt(c11));
  const ids10 = filterAssignmentsByClass(A, "10").map((a) => a.id);
  check("himpunan dasar kelas 10 tepat [1,2,3,6] berurutan", JSON.stringify(ids10) === "[1,2,3,6]", ids10.join(","));
}

console.log("Case 3: kelas kosong, opsi siswa, invarian jumlah");
{
  check("kelas tanpa penugasan semua nol", sameCounts(planAssignmentCounts(A, "99"), { total: 0, terbit: 0, draf: 0, ditutup: 0 }));
  check("daftar kosong semua nol", sameCounts(planAssignmentCounts([], "10"), { total: 0, terbit: 0, draf: 0, ditutup: 0 }));
  check("opsi 'siswa' hanya penugasan siswa tertentu", sameCounts(planAssignmentCounts(A, "siswa"), { total: 1, terbit: 1, draf: 0, ditutup: 0 }), fmt(planAssignmentCounts(A, "siswa")));
  for (const f of [null, "semua", "10", "11", "99", "siswa"]) {
    const c = planAssignmentCounts(A, f);
    check(`invarian total = terbit+draf+ditutup untuk saringan ${String(f)}`, c.total === c.terbit + c.draf + c.ditutup, fmt(c));
  }
  const sebelum = A.length;
  const hasil = filterAssignmentsByClass(A, "semua");
  check("saringan tidak mengubah masukan dan mengembalikan array baru", A.length === sebelum && hasil !== A);
}

console.log("Case 4: skenario tangkapan layar — 42 penugasan, kelas terpilih 4 terbit");
{
  const banyak = [];
  for (let i = 0; i < 4; i++) banyak.push({ id: 100 + i, status: "terbit", target_type: "kelas", classes: [{ id: 7, name: "X TKJ A" }] });
  const statusLain = ["terbit", "draf", "ditutup"];
  for (let i = 0; i < 38; i++) banyak.push({ id: 200 + i, status: statusLain[i % 3], target_type: "kelas", classes: [{ id: 8 + (i % 2), name: "Kelas lain" }] });
  const terpilih = planAssignmentCounts(banyak, "7");
  check("kelas terpilih: Semua 4 / Terbit 4 / Draf 0 / Ditutup 0", sameCounts(terpilih, { total: 4, terbit: 4, draf: 0, ditutup: 0 }), fmt(terpilih));
  check("tanpa saringan total tetap 42", planAssignmentCounts(banyak, null).total === 42);
  check("penyebut ringkasan = himpunan dasar kelas (4)", filterAssignmentsByClass(banyak, "7").length === terpilih.total);
}

console.log("Case 5: wiring halaman guru");
{
  const guru = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");
  check("halaman mengimpor lib hitungan-penugasan", guru.includes('import { filterAssignmentsByClass, planAssignmentCounts } from "../../lib/hitungan-penugasan";'));
  check("himpunan dasar dari lib dengan kelas terpilih", guru.includes("const classFilteredAssignments = filterAssignmentsByClass(assignments, assignmentClassFilter);"));
  check("hitungan chip dari lib dengan kelas terpilih", guru.includes("const assignmentCounts = planAssignmentCounts(assignments, assignmentClassFilter);"));
  check("chip Semua memakai total lib", guru.includes("semua: assignmentCounts.total,"));
  check("hitungan lama dari array penuh sudah hilang", !guru.includes("semua: assignments.length,"));
  check("penyebut 'Menampilkan' memakai himpunan dasar kelas", guru.includes("assignmentFiltersActive ? `Menampilkan ${visibleAssignments.length} dari ${classFilteredAssignments.length} penugasan`"));
  check("daftar tampil tetap kelas dulu lalu status", guru.includes("const visibleAssignments = assignmentStatusFilter === \"semua\"\n    ? classFilteredAssignments\n    : classFilteredAssignments.filter((assignment) => assignment.status === assignmentStatusFilter);"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
