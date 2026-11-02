// Tests for the Step-5 "Pengumpulan LKPD" grading helpers (v1.0.23).
// Run with bun from apps/web:  bun lib/grading-helpers.test.mjs
import {
  countGradingAttempts,
  distinctGradingClasses,
  filterGradingAttemptsByClass,
  formatScoreValue,
  gradingClassFilterValue,
  GRADING_PAGE_SIZE,
  isUngradedAttempt,
  matchesGradingClassFilter,
  matchesGradingStatusFilter,
  nextRevealedCount,
  pickNextUngradedAttempt,
  quickScoreDrafts,
  revealedCountForIndex,
  revealedSliceCount,
  runningTotal,
  sortGradingAttempts,
} from "./grading-helpers.ts";

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

// Keadaan attempt nyata dari API: draf (total null), terkumpul (total null),
// dinilai (status digeser server, total terisi).
const fixture = [
  { id: 1, status: "draf", total_score: null },
  { id: 2, status: "terkumpul", total_score: null },
  { id: 3, status: "terkumpul", total_score: null },
  { id: 4, status: "dinilai", total_score: 80 },
  { id: 5, status: "dinilai", total_score: 65.5 },
  { id: 6, status: "draf", total_score: null },
];

console.log("Case 1: hitungan ringkas pada fixture campuran");
const counts = countGradingAttempts(fixture);
check("terkumpul = semua yang sudah mengumpulkan (terkumpul + dinilai)", counts.terkumpul === 4, JSON.stringify(counts));
check("belum dinilai = terkumpul tanpa total", counts.belumDinilai === 2, JSON.stringify(counts));
check("sudah dinilai = total terisi", counts.sudahDinilai === 2, JSON.stringify(counts));
check("terkumpul = belum + sudah", counts.terkumpul === counts.belumDinilai + counts.sudahDinilai);
check("daftar kosong menghasilkan nol semua", JSON.stringify(countGradingAttempts([])) === JSON.stringify({ terkumpul: 0, belumDinilai: 0, sudahDinilai: 0 }));

console.log("Case 2: urutan kelompok stabil (belum dinilai, draf, sudah dinilai)");
const sorted = sortGradingAttempts(fixture);
check("urutan id hasil sortir", JSON.stringify(sorted.map((a) => a.id)) === JSON.stringify([2, 3, 1, 6, 4, 5]), JSON.stringify(sorted.map((a) => a.id)));
check("array asal tidak berubah", JSON.stringify(fixture.map((a) => a.id)) === JSON.stringify([1, 2, 3, 4, 5, 6]));
const sortedAgain = sortGradingAttempts(sorted);
check("mengurutkan daftar yang sudah urut tidak menggeser apa pun", JSON.stringify(sortedAgain.map((a) => a.id)) === JSON.stringify([2, 3, 1, 6, 4, 5]));

console.log("Case 3: pemilih pengumpulan berikutnya yang belum dinilai");
check("dari awal daftar mengambil yang belum dinilai pertama", pickNextUngradedAttempt(sorted, null)?.id === 2);
check("melewati yang baru disimpan", pickNextUngradedAttempt(sorted, 2)?.id === 3);
check("melewati yang sudah dinilai dan draf", pickNextUngradedAttempt(sortGradingAttempts([fixture[3], fixture[0], fixture[2]]), null)?.id === 3);
check("habis: semua sudah dinilai/draf menghasilkan null", pickNextUngradedAttempt([fixture[0], fixture[3], fixture[4]], null) === null);
check("habis: tinggal yang baru disimpan menghasilkan null", pickNextUngradedAttempt([fixture[1]], 2) === null);
check("isUngradedAttempt hanya untuk terkumpul tanpa total", isUngradedAttempt(fixture[1]) && !isUngradedAttempt(fixture[0]) && !isUngradedAttempt(fixture[3]));

console.log("Case 4: saringan status");
check("belum_dinilai cocok dengan predikat belum dinilai", matchesGradingStatusFilter(fixture[1], "belum_dinilai") && !matchesGradingStatusFilter(fixture[3], "belum_dinilai"));
check("sudah_dinilai cocok dengan total terisi", matchesGradingStatusFilter(fixture[4], "sudah_dinilai") && !matchesGradingStatusFilter(fixture[1], "sudah_dinilai"));
check("semua menerima semua keadaan", fixture.every((a) => matchesGradingStatusFilter(a, "semua")));

console.log("Case 5: total sementara dari draf nilai");
const items = [
  { id: 11, points: 10 },
  { id: 12, points: 5 },
  { id: 13, points: 5 },
];
const totals = runningTotal(items, { 11: "7.5", 12: "", 13: "abc" });
check("draf kosong/bukan angka dihitung 0", totals.current === 7.5, JSON.stringify(totals));
check("maksimum adalah jumlah poin", totals.max === 20, JSON.stringify(totals));
check("draf berisi spasi saja dihitung 0", runningTotal(items, { 11: "  ", 12: "5", 13: "2.25" }).current === 7.25);
check("tanpa draf sama sekali menghasilkan 0", runningTotal(items, {}).current === 0);
check("kebisingan floating point dibulatkan (0.1 + 0.2)", runningTotal([{ id: 1, points: 1 }, { id: 2, points: 1 }], { 1: "0.1", 2: "0.2" }).current === 0.3);

console.log("Case 6: format angka dan nilai cepat");
check("formatScoreValue membuang nol ekor", formatScoreValue(80.5) === "80.5" && formatScoreValue(80) === "80" && formatScoreValue(80.25) === "80.25");
check("formatScoreValue merapikan 0.30000000000000004", formatScoreValue(0.1 + 0.2) === "0.3");
const quick5 = quickScoreDrafts(5);
check("setengah dari 5 adalah 2.5", quick5.half === "2.5", JSON.stringify(quick5));
check("nol dan penuh dari 5", quick5.zero === "0" && quick5.full === "5");
const quick10 = quickScoreDrafts(10);
check("setengah dari 10 adalah 5", quick10.half === "5" && quick10.full === "10");
check("setengah dari 7 adalah 3.5", quickScoreDrafts(7).half === "3.5");
check("setengah dari 2.5 adalah 1.25", quickScoreDrafts(2.5).half === "1.25");

console.log("Case 7: saringan kelas — opsi berbeda dari daftar sumber");
const classFixture = [
  { id: 21, status: "terkumpul", total_score: null, class_id: 5, class_name: "XI TKJ B" },
  { id: 22, status: "dinilai", total_score: 90, class_id: 3, class_name: "XI TKJ A" },
  { id: 23, status: "terkumpul", total_score: null, class_id: 5, class_name: "XI TKJ B" },
  { id: 24, status: "draf", total_score: null, class_id: null, class_name: null },
  { id: 25, status: "terkumpul", total_score: null, class_id: 3, class_name: "XI TKJ A" },
];
const classOptions = distinctGradingClasses(classFixture);
check(
  "kelas terurut nama, Tanpa kelas terakhir",
  JSON.stringify(classOptions.map((option) => option.name)) === JSON.stringify(["XI TKJ A", "XI TKJ B", "Tanpa kelas"]),
  JSON.stringify(classOptions),
);
check(
  "nilai saringan: id sebagai string, Tanpa kelas = tanpa_kelas",
  gradingClassFilterValue(classOptions[0]) === "3" && gradingClassFilterValue(classOptions[2]) === "tanpa_kelas",
);
check(
  "Tanpa kelas tidak muncul bila semua attempt berkelas",
  JSON.stringify(distinctGradingClasses(classFixture.slice(0, 3)).map((option) => option.id)) === JSON.stringify([3, 5]),
);
check("daftar kosong menghasilkan opsi kosong", distinctGradingClasses([]).length === 0);

console.log("Case 8: saringan kelas — pencocokan dan hitungan sesudahnya");
check("semua menerima semua kelas", classFixture.every((a) => matchesGradingClassFilter(a, "semua")));
check("id kelas cocok persis", matchesGradingClassFilter(classFixture[0], "5") && !matchesGradingClassFilter(classFixture[0], "3"));
check("tanpa_kelas hanya untuk class_id null", matchesGradingClassFilter(classFixture[3], "tanpa_kelas") && !matchesGradingClassFilter(classFixture[0], "tanpa_kelas"));
const tkjB = filterGradingAttemptsByClass(classFixture, "5");
check("saring kelas 5 menyisakan attempt kelas itu", JSON.stringify(tkjB.map((a) => a.id)) === JSON.stringify([21, 23]));
const tkjBCounts = countGradingAttempts(tkjB);
check(
  "hitungan dihitung sesudah saringan kelas",
  tkjBCounts.terkumpul === 2 && tkjBCounts.belumDinilai === 2 && tkjBCounts.sudahDinilai === 0,
  JSON.stringify(tkjBCounts),
);
const tanpaKelasCounts = countGradingAttempts(filterGradingAttemptsByClass(classFixture, "tanpa_kelas"));
check("hitungan Tanpa kelas hanya dari attempt tanpa kelas", tanpaKelasCounts.terkumpul === 0 && tanpaKelasCounts.belumDinilai === 0 && tanpaKelasCounts.sudahDinilai === 0);

console.log("Case 9: rantai saringan sumber → kelas → urutan → status tetap konsisten");
const chained = sortGradingAttempts(filterGradingAttemptsByClass(classFixture, "3"))
  .filter((attempt) => matchesGradingStatusFilter(attempt, "belum_dinilai"));
check("sesudah rantai hanya belum dinilai dari kelas 3", JSON.stringify(chained.map((a) => a.id)) === JSON.stringify([25]), JSON.stringify(chained.map((a) => a.id)));
check(
  "lompat otomatis tetap di dalam daftar tersaring kelas",
  pickNextUngradedAttempt(sortGradingAttempts(tkjB), 21)?.id === 23,
);
const tkjBSudahDinilai = tkjB.map((a) => ({ ...a, status: "dinilai", total_score: 80 }));
check(
  "semua attempt kelas tersaring sudah dinilai menghasilkan null",
  pickNextUngradedAttempt(sortGradingAttempts(tkjBSudahDinilai), 23) === null,
);

console.log("Case 10: tampilkan bertahap (progressive reveal)");
check("ukuran halaman 20", GRADING_PAGE_SIZE === 20);
check("slice dibatasi total daftar", revealedSliceCount(55, 20) === 20 && revealedSliceCount(12, 20) === 12 && revealedSliceCount(0, 20) === 0);
check("slice tidak pernah negatif", revealedSliceCount(10, -5) === 0);
check("tampilkan lebih banyak menambah satu halaman", nextRevealedCount(20) === 40 && nextRevealedCount(40) === 60);
check("indeks di halaman pertama cukup 20", revealedCountForIndex(0) === 20 && revealedCountForIndex(19) === 20);
check("indeks pertama halaman kedua menuntut 40", revealedCountForIndex(20) === 40 && revealedCountForIndex(39) === 40);
check("indeks jauh dibulatkan ke kelipatan halaman berikutnya", revealedCountForIndex(47) === 60 && revealedCountForIndex(100) === 120);
check("indeks negatif jatuh ke satu halaman", revealedCountForIndex(-1) === 20);
check(
  "target lompat otomatis selalu ikut terlihat sesudah perluasan",
  [0, 19, 20, 41, 59, 60, 99].every((index) => revealedCountForIndex(index) > index),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
