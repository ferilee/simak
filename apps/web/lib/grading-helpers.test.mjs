// Tests for the Step-5 "Pengumpulan LKPD" grading helpers (v1.0.23).
// Run with bun from apps/web:  bun lib/grading-helpers.test.mjs
import {
  countGradingAttempts,
  distinctGradingClasses,
  filterGradingAttemptsByClass,
  formatScoreValue,
  gradingClassFilterValue,
  GRADING_PAGE_SIZE,
  groupSortNumber,
  isGroupGradingAttempt,
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

console.log("Case 2: tanpa nama/kelompok, urutan masuk dipertahankan (stabil, status tidak menggeser)");
const sorted = sortGradingAttempts(fixture);
check("urutan id hasil sortir sama dengan urutan masuk", JSON.stringify(sorted.map((a) => a.id)) === JSON.stringify([1, 2, 3, 4, 5, 6]), JSON.stringify(sorted.map((a) => a.id)));
check("array asal tidak berubah", JSON.stringify(fixture.map((a) => a.id)) === JSON.stringify([1, 2, 3, 4, 5, 6]));
const sortedAgain = sortGradingAttempts(sorted);
check("mengurutkan daftar yang sudah urut tidak menggeser apa pun", JSON.stringify(sortedAgain.map((a) => a.id)) === JSON.stringify([1, 2, 3, 4, 5, 6]));

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

console.log("Case 11: urutan kelompok — nomor menaik numerik, status tidak menggeser (v1.0.38)");
// Bentuk nyata payload API untuk attempt kelompok: student_name = nama kelompok.
const groupFixture = [
  { id: 31, status: "terkumpul", total_score: null, is_group: true, group_id: 103, group_name: "Kelompok 3", student_name: "Kelompok 3" },
  { id: 32, status: "dinilai", total_score: 90, is_group: true, group_id: 105, group_name: "Kelompok 5", student_name: "Kelompok 5" },
  { id: 33, status: "draf", total_score: null, is_group: true, group_id: 102, group_name: "Kelompok 2", student_name: "Kelompok 2" },
  { id: 34, status: "terkumpul", total_score: null, is_group: true, group_id: 110, group_name: "Kelompok 10", student_name: "Kelompok 10" },
  { id: 35, status: "terkumpul", total_score: null, is_group: true, group_id: 101, group_name: "Kelompok 1", student_name: "Kelompok 1" },
];
const groupSorted = sortGradingAttempts(groupFixture);
check(
  "kelompok 3,5,2,10,1 tampil 1,2,3,5,10",
  JSON.stringify(groupSorted.map((a) => a.group_name)) === JSON.stringify(["Kelompok 1", "Kelompok 2", "Kelompok 3", "Kelompok 5", "Kelompok 10"]),
  JSON.stringify(groupSorted.map((a) => a.group_name)),
);
check("Kelompok 10 sesudah Kelompok 5 (numerik, bukan leksikografis)", groupSorted[4].group_name === "Kelompok 10" && groupSorted[3].group_name === "Kelompok 5");
check("Kelompok 5 yang sudah dinilai tetap di posisi nomornya", groupSorted[3].id === 32 && groupSorted[3].status === "dinilai");
check("draf Kelompok 2 tetap di posisi nomornya", groupSorted[1].id === 33 && groupSorted[1].status === "draf");
check("array asal kelompok tidak berubah", JSON.stringify(groupFixture.map((a) => a.id)) === JSON.stringify([31, 32, 33, 34, 35]));

console.log("Case 12: groupSortNumber — parsing dan cadangan");
check("Kelompok 1 → 1", groupSortNumber(groupFixture[4]) === 1);
check("Kelompok 10 → 10 (bukan 1)", groupSortNumber(groupFixture[3]) === 10);
check("Kelompok 2 → 2", groupSortNumber(groupFixture[2]) === 2);
check(
  "group_name kosong: dibaca dari student_name",
  groupSortNumber({ id: 1, status: "terkumpul", total_score: null, is_group: true, group_id: 7, group_name: null, student_name: "Kelompok 7" }) === 7,
);
check(
  "terdeteksi kelompok lewat group_id saja",
  isGroupGradingAttempt({ id: 1, status: "terkumpul", total_score: null, group_id: 7 }) && !isGroupGradingAttempt({ id: 2, status: "terkumpul", total_score: null, group_id: null }),
);
check("attempt individu tidak punya nomor kelompok", groupSortNumber({ id: 1, status: "terkumpul", total_score: null, student_name: "Kelompok 7" }) === null);
check(
  "nama kelompok tanpa angka menghasilkan null",
  groupSortNumber({ id: 1, status: "terkumpul", total_score: null, is_group: true, group_id: 3, group_name: "Kelompok Biru", student_name: "Kelompok Biru" }) === null,
);
const unnumberedGroups = [
  { id: 61, status: "terkumpul", total_score: null, is_group: true, group_id: 209, group_name: "Kelompok Merah", student_name: "Kelompok Merah" },
  { id: 62, status: "terkumpul", total_score: null, is_group: true, group_id: 204, group_name: "Kelompok Biru", student_name: "Kelompok Biru" },
];
check(
  "tanpa nomor bernama: id kelompok menaik",
  JSON.stringify(sortGradingAttempts(unnumberedGroups).map((a) => a.id)) === JSON.stringify([62, 61]),
);
const anonymousGroups = [
  { id: 63, status: "terkumpul", total_score: null, is_group: true, group_id: null, group_name: null, student_name: "Kelompok" },
  { id: 64, status: "draf", total_score: null, is_group: true, group_id: null, group_name: null, student_name: "Kelompok" },
];
check(
  "tanpa nomor dan tanpa id: urutan masuk dipertahankan",
  JSON.stringify(sortGradingAttempts(anonymousGroups).map((a) => a.id)) === JSON.stringify([63, 64]),
);
check(
  "yang bernomor sebelum yang tidak bernomor",
  JSON.stringify(sortGradingAttempts([unnumberedGroups[0], groupFixture[4]]).map((a) => a.id)) === JSON.stringify([35, 61]),
);

console.log("Case 13: urutan individu — abjad nama A–Z (locale id), status tidak menggeser");
const nameFixture = [
  { id: 41, status: "dinilai", total_score: 88, student_name: "Siti Rahma" },
  { id: 42, status: "draf", total_score: null, student_name: "Andi Pratama" },
  { id: 43, status: "terkumpul", total_score: null, student_name: "Zahra Aulia" },
  { id: 44, status: "terkumpul", total_score: null, student_name: "Budi Santoso" },
  { id: 45, status: "dinilai", total_score: 70, student_name: "Dewi Lestari" },
];
const nameSorted = sortGradingAttempts(nameFixture);
check(
  "nama acak tampil A–Z",
  JSON.stringify(nameSorted.map((a) => a.student_name)) === JSON.stringify(["Andi Pratama", "Budi Santoso", "Dewi Lestari", "Siti Rahma", "Zahra Aulia"]),
  JSON.stringify(nameSorted.map((a) => a.student_name)),
);
check("yang sudah dinilai tidak tenggelam ke bawah", nameSorted[0].id === 42 && nameSorted[3].id === 41);

console.log("Case 14: daftar campuran — kelompok dulu menurut nomor, lalu individu menurut nama");
const mixedFixture = [
  { id: 71, status: "terkumpul", total_score: null, student_name: "Bima Arya" },
  { id: 72, status: "terkumpul", total_score: null, is_group: true, group_id: 302, group_name: "Kelompok 2", student_name: "Kelompok 2" },
  { id: 73, status: "terkumpul", total_score: null, student_name: "Alya Putri" },
  { id: 74, status: "dinilai", total_score: 95, is_group: true, group_id: 301, group_name: "Kelompok 1", student_name: "Kelompok 1" },
];
check(
  "urutan campuran: Kelompok 1, Kelompok 2, Alya, Bima",
  JSON.stringify(sortGradingAttempts(mixedFixture).map((a) => a.id)) === JSON.stringify([74, 72, 73, 71]),
  JSON.stringify(sortGradingAttempts(mixedFixture).map((a) => a.id)),
);

console.log("Case 15: nama sama stabil + lompatan Nilai Cepat mengikuti urutan baru");
const sameNameFixture = [
  { id: 52, status: "terkumpul", total_score: null, student_name: "Rina Marlina" },
  { id: 51, status: "terkumpul", total_score: null, student_name: "Rina Marlina" },
];
check(
  "nama sama: urutan masuk dipertahankan (bukan id)",
  JSON.stringify(sortGradingAttempts(sameNameFixture).map((a) => a.id)) === JSON.stringify([52, 51]),
);
// Simulasi Nilai Cepat: Kelompok 1 baru selesai dinilai; daftar tampil
// berasal dari urutan API (updated_at menurun: yang terakhir berubah dulu).
const afterGradingFixture = [
  { id: 83, status: "terkumpul", total_score: null, is_group: true, group_id: 403, group_name: "Kelompok 3", student_name: "Kelompok 3" },
  { id: 81, status: "dinilai", total_score: 80, is_group: true, group_id: 401, group_name: "Kelompok 1", student_name: "Kelompok 1" },
  { id: 82, status: "terkumpul", total_score: null, is_group: true, group_id: 402, group_name: "Kelompok 2", student_name: "Kelompok 2" },
];
const afterGradingDisplay = sortGradingAttempts(afterGradingFixture);
check("sesudah menilai Kelompok 1, lompatan ke Kelompok 2", pickNextUngradedAttempt(afterGradingDisplay, 81)?.id === 82);
check("sesudah Kelompok 2, lompatan ke Kelompok 3", pickNextUngradedAttempt(afterGradingDisplay, 82)?.id === 83);
check("draf di tengah dilewati lompatan tetapi tetap pada posisi nomornya", pickNextUngradedAttempt(groupSorted, null)?.id === 35 && groupSorted[1].status === "draf");

console.log("Case 16: hitungan dan saringan tidak tersentuh urutan baru");
check(
  "hitungan sama sebelum dan sesudah sortir kelompok",
  JSON.stringify(countGradingAttempts(sortGradingAttempts(groupFixture))) === JSON.stringify(countGradingAttempts(groupFixture)),
);
check(
  "saringan belum_dinilai pada urutan baru menyisakan nomor menaik",
  JSON.stringify(groupSorted.filter((a) => matchesGradingStatusFilter(a, "belum_dinilai")).map((a) => a.group_name)) === JSON.stringify(["Kelompok 1", "Kelompok 3", "Kelompok 10"]),
);
check(
  "saringan sudah_dinilai pada urutan abjad tetap bekerja",
  JSON.stringify(nameSorted.filter((a) => matchesGradingStatusFilter(a, "sudah_dinilai")).map((a) => a.student_name)) === JSON.stringify(["Dewi Lestari", "Siti Rahma"]),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
