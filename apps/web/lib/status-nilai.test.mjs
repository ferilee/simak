// Tests for the teacher grading-status rollup helpers (Pantau Hasil,
// v1.0.66): badge/fraction/context/filter/order derivations are pure in
// lib/status-nilai.ts; the page + CSS wiring is locked statically.
// Run with bun from apps/web:  bun lib/status-nilai.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignmentGrading,
  countAssignmentsNeedingGrading,
  gradingBadge,
  gradingBadgeVisible,
  gradingForClassFilter,
  gradingFractionLabel,
  gradingProgressPercent,
  matchesGradingFilter,
  sortAssignmentsByGradingNeed,
} from "./status-nilai.ts";

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

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");

const rollup = (submitted_count, graded_count, partial_count, grading_status) => ({ submitted_count, graded_count, partial_count, grading_status });
const asg = (over = {}) => ({
  status: "terbit",
  worksheet_id: 10,
  work_mode: "individu",
  grading: rollup(0, 0, 0, "belum_ada_pengumpulan"),
  grading_by_class: [],
  ...over,
});

// ---------------------------------------------------------------------------
console.log("Case 1: lencana + pecahan + progres");
{
  check("belum_dinilai → label + rona danger", gradingBadge("belum_dinilai").label === "Belum dinilai" && gradingBadge("belum_dinilai").tone === "danger");
  check("sebagian → label + rona warning", gradingBadge("sebagian").label === "Sebagian dinilai" && gradingBadge("sebagian").tone === "warning");
  check("selesai → label bercentang + rona success", gradingBadge("selesai").label === "Selesai dinilai ✓" && gradingBadge("selesai").tone === "success");
  check("belum_ada_pengumpulan → label + rona neutral", gradingBadge("belum_ada_pengumpulan").label === "Belum ada pengumpulan" && gradingBadge("belum_ada_pengumpulan").tone === "neutral");

  check("pecahan individu memakai satuan murid", gradingFractionLabel(rollup(8, 5, 1, "sebagian"), "individu") === "Dinilai 5 dari 8 murid");
  check("pecahan kelompok memakai satuan kelompok", gradingFractionLabel(rollup(8, 5, 1, "sebagian"), "kelompok") === "Dinilai 5 dari 8 kelompok");
  check("belum ada pengumpulan → tanpa pecahan", gradingFractionLabel(rollup(0, 0, 0, "belum_ada_pengumpulan"), "individu") === null);

  check("progres 0 penyebut → 0", gradingProgressPercent(rollup(0, 0, 0, "belum_ada_pengumpulan")) === 0);
  check("progres 1/4 → 25", gradingProgressPercent(rollup(4, 1, 0, "sebagian")) === 25);
  check("progres 2/3 → 67 (dibulatkan)", gradingProgressPercent(rollup(3, 2, 0, "sebagian")) === 67);
  check("progres penuh → 100", gradingProgressPercent(rollup(3, 3, 0, "selesai")) === 100);
}

// ---------------------------------------------------------------------------
console.log("Case 2: keterlihatan lencana");
{
  check("terbit + LKPD → terlihat", gradingBadgeVisible(asg()) === true);
  check("ditutup + LKPD → terlihat", gradingBadgeVisible(asg({ status: "ditutup" })) === true);
  check("draf → tersembunyi", gradingBadgeVisible(asg({ status: "draf" })) === false);
  check("tanpa LKPD → tersembunyi", gradingBadgeVisible(asg({ worksheet_id: null })) === false);
  check("payload tanpa grading dibaca sebagai rollup kosong",
    assignmentGrading({ status: "terbit", worksheet_id: 1, work_mode: "individu" }).grading_status === "belum_ada_pengumpulan");
}

// ---------------------------------------------------------------------------
console.log("Case 3: konteks kelas mengikuti saringan Langkah 4");
{
  const byClass = [
    { class_id: 7, ...rollup(4, 4, 0, "selesai") },
    { class_id: 9, ...rollup(6, 1, 2, "sebagian") },
  ];
  const assignment = asg({ grading: rollup(10, 5, 2, "sebagian"), grading_by_class: byClass });
  check('"semua" → gabungan', gradingForClassFilter(assignment, "semua").submitted_count === 10);
  check('"siswa" → gabungan', gradingForClassFilter(assignment, "siswa").submitted_count === 10);
  check("id kelas 7 → rincian kelas itu", gradingForClassFilter(assignment, "7").grading_status === "selesai");
  check("id kelas 9 → rincian kelas itu", gradingForClassFilter(assignment, "9").graded_count === 1);
  check("kelas tanpa rincian → rollup kosong", gradingForClassFilter(assignment, "42").grading_status === "belum_ada_pengumpulan");
  check("filter kosong/null → gabungan", gradingForClassFilter(assignment, null).submitted_count === 10 && gradingForClassFilter(assignment, undefined).submitted_count === 10);
}

// ---------------------------------------------------------------------------
console.log("Case 4: saringan + hitungan ringkasan Pantau Hasil");
{
  const belum = asg({ grading: rollup(5, 0, 0, "belum_dinilai") });
  const sebagian = asg({ grading: rollup(5, 2, 1, "sebagian") });
  const selesai = asg({ grading: rollup(5, 5, 0, "selesai") });
  const kosong = asg({ grading: rollup(0, 0, 0, "belum_ada_pengumpulan") });
  const drafBelum = asg({ status: "draf", grading: rollup(5, 0, 0, "belum_dinilai") });
  const tanpaLkpd = asg({ worksheet_id: null, grading: rollup(5, 0, 0, "belum_dinilai") });

  check('"semua" meloloskan semua keadaan', [belum, sebagian, selesai, kosong, drafBelum].every((a) => matchesGradingFilter(a, "semua")));
  check('"perlu_dinilai" = belum_dinilai + sebagian saja',
    matchesGradingFilter(belum, "perlu_dinilai") && matchesGradingFilter(sebagian, "perlu_dinilai")
    && !matchesGradingFilter(selesai, "perlu_dinilai") && !matchesGradingFilter(kosong, "perlu_dinilai"));
  check('"selesai" hanya selesai', matchesGradingFilter(selesai, "selesai") && !matchesGradingFilter(sebagian, "selesai") && !matchesGradingFilter(kosong, "selesai"));
  check("draf / tanpa LKPD hanya tampil di semua",
    !matchesGradingFilter(drafBelum, "perlu_dinilai") && !matchesGradingFilter(tanpaLkpd, "perlu_dinilai") && !matchesGradingFilter(drafBelum, "selesai"));
  check("hitungan menunggu = belum_dinilai + sebagian yang berlencana",
    countAssignmentsNeedingGrading([belum, sebagian, selesai, kosong, drafBelum, tanpaLkpd]) === 2);
}

// ---------------------------------------------------------------------------
console.log("Case 5: urutan bawaan — perlu dinilai di atas, stabil");
{
  const items = [
    { id: 1, ...asg({ grading: rollup(5, 5, 0, "selesai") }) },
    { id: 2, ...asg({ grading: rollup(5, 0, 0, "belum_dinilai") }) },
    { id: 3, ...asg({ grading: rollup(0, 0, 0, "belum_ada_pengumpulan") }) },
    { id: 4, ...asg({ grading: rollup(5, 2, 0, "sebagian") }) },
    { id: 5, ...asg({ grading: rollup(5, 5, 0, "selesai") }) },
    { id: 6, ...asg({ grading: rollup(4, 0, 1, "belum_dinilai") }) },
  ];
  const sorted = sortAssignmentsByGradingNeed(items);
  check("urutan: perlu dinilai (urutan asal) → belum ada pengumpulan → selesai",
    JSON.stringify(sorted.map((a) => a.id)) === JSON.stringify([2, 4, 6, 3, 1, 5]),
    JSON.stringify(sorted.map((a) => a.id)));
  check("masukan tidak diubah", items[0].id === 1 && items[5].id === 6);
}

// ---------------------------------------------------------------------------
console.log("Case 6: kabel statis halaman + CSS");
{
  check("halaman mengimpor helper dari lib/status-nilai", page.includes('from "../../lib/status-nilai"'));
  check("baris Langkah 4 memakai konteks saringan kelas", page.includes("renderGradingRollup(assignment, gradingForClassFilter(assignment, assignmentClassFilter))"));
  check("baris Rekap memakai rollup gabungan", page.includes("renderGradingRollup(assignment, assignmentGrading(assignment))"));
  check("daftar Rekap digambar dari daftar tersaring + terurut", page.includes("displayedRekapAssignments.map("));
  check("chip saringan status penilaian terpasang", page.includes("setRekapGradingFilter(option.value)") && page.includes('"Perlu dinilai"'));
  check("baris ringkasan menunggu dinilai terpasang", page.includes("penugasan belum selesai dinilai"));
  check("CSS lencana empat rona tersedia",
    css.includes(".grading-badge.is-danger") && css.includes(".grading-badge.is-warning") && css.includes(".grading-badge.is-success") && css.includes(".grading-badge.is-neutral"));
  check("CSS bar progres + catatan cicilan tersedia", css.includes(".grading-progress-fill") && css.includes(".grading-partial-note"));
}

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
