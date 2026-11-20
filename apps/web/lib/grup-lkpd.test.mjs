// Tests for the Step-5 "Pengumpulan LKPD" LKPD picker helpers (Paket A:
// saringan kelas bertingkat + dropdown berkelompok + arsip terpisah).
// Run with bun from apps/web:  bun lib/grup-lkpd.test.mjs
import {
  filterWorksheetsByIds,
  groupLkpdOptions,
  isArchivedLkpd,
  lkpdAtpNumber,
  lkpdGroupLabel,
  parseAtpNumber,
  resolveGradingSource,
  worksheetIdsForClassFilter,
} from "./grup-lkpd.ts";

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- parseAtpNumber ---
check("parseAtpNumber membaca pola judul LKPD baku", same(parseAtpNumber("LKPD ATP 2.4 — Nilai Sekarang Pinjaman dan Anuitas"), { major: 2, minor: 4 }));
check("parseAtpNumber membaca pola judul modul '(ATP x.y)'", same(parseAtpNumber("Sifat Eksponen — Eksponen (ATP 1.2)"), { major: 1, minor: 2 }));
check("parseAtpNumber membaca dua digit minor (ATP 1.10)", same(parseAtpNumber("LKPD ATP 1.10 — Lanjutan"), { major: 1, minor: 10 }));
check("parseAtpNumber tanpa pola menghasilkan null", parseAtpNumber("LKPD A — Matematika Keuangan") === null && parseAtpNumber(null) === null && parseAtpNumber("") === null);

// --- Modul & LKPD contoh (meniru keadaan live: tiga mapel, nomor ATP bertabrakan) ---
const modules = [
  { id: 101, title: "Eksponen — (ATP 1.1)", subject: "Matematika", topic_group: "Eksponen", status: "terbit" },
  { id: 102, title: "Matematika Keuangan — (ATP 2.1)", subject: "Matematika", topic_group: "Matematika Keuangan", status: "terbit" },
  { id: 103, title: "Berpikir Komputasional — (ATP 1.1)", subject: "KKA", topic_group: "Berpikir Komputasional", status: "terbit" },
  { id: 104, title: "Informatika — (ATP 1.1)", subject: "Informatika", topic_group: "Berpikir Komputasional", status: "terbit" },
  { id: 105, title: "Matematika Keuangan lama", subject: "Matematika", topic_group: "Matematika Keuangan", status: "arsip" },
  { id: 106, title: "Matematika Keuangan — Pengayaan", subject: "Matematika", topic_group: "Matematika Keuangan", status: "terbit" },
];

const worksheets = [
  { id: 1, title: "LKPD ATP 1.6 — Menyelesaikan Masalah Pangkat Pecahan", module_id: 101, status: "terbit" },
  { id: 2, title: "LKPD ATP 1.2 — Sifat Eksponen dengan Pangkat Rasional", module_id: 101, status: "terbit" },
  { id: 3, title: "LKPD ATP 1.10 — Pengayaan Eksponen", module_id: 101, status: "terbit" },
  { id: 4, title: "LKPD ATP 1.1 — Pangkat Pecahan sebagai Bentuk Akar", module_id: 101, status: "terbit" },
  { id: 5, title: "LKPD ATP 2.4 — Nilai Sekarang Pinjaman dan Anuitas", module_id: 102, status: "terbit" },
  { id: 6, title: "LKPD ATP 2.1 — Bunga Tunggal", module_id: 102, status: "terbit" },
  { id: 7, title: "LKPD Pengayaan — Diskusi Bunga", module_id: 106, status: "terbit" },
  { id: 8, title: "LKPD ATP 1.1 — Masalah Sederhana dan Masalah Kompleks", module_id: 103, status: "terbit" },
  { id: 9, title: "LKPD ATP 1.1 — Struktur Data Standar", module_id: 104, status: "terbit" },
  { id: 10, title: "LKPD A — Matematika Keuangan (Arsip Lama)", module_id: 102, status: "terbit" },
  { id: 11, title: "LKPD E — Matematika Keuangan", module_id: 105, status: "terbit" },
  { id: 12, title: "LKPD Bebas — Tanpa Modul", module_id: null, status: "terbit" },
  { id: 13, title: "LKPD Bebas — Modul Hilang", module_id: 999, status: "terbit" },
];

const moduleById = new Map(modules.map((module) => [module.id, module]));
const wsById = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet]));

// --- lkpdAtpNumber: judul LKPD didahulukan, judul modul cadangan ---
check(
  "nomor ATP dari judul LKPD menang atas judul modul",
  same(lkpdAtpNumber(wsById.get(2), moduleById.get(101)), { major: 1, minor: 2 }),
);
check(
  "nomor ATP jatuh ke judul modul bila judul LKPD tanpa pola",
  same(lkpdAtpNumber(wsById.get(7), moduleById.get(102)), { major: 2, minor: 1 }),
);
check(
  "LKPD tanpa modul dan tanpa pola judul tidak bernomor ATP",
  lkpdAtpNumber(wsById.get(12), null) === null,
);

// --- isArchivedLkpd ---
check("arsip karena judul mengandung 'Arsip'", isArchivedLkpd(wsById.get(10), moduleById.get(102)) === true);
check("arsip karena modul pasangan terarsip", isArchivedLkpd(wsById.get(11), moduleById.get(105)) === true);
check("arsip karena status LKPD sendiri arsip", isArchivedLkpd({ id: 90, title: "LKPD Biasa", module_id: 101, status: "arsip" }, moduleById.get(101)) === true);
check("LKPD aktif bermodul aktif bukan arsip", isArchivedLkpd(wsById.get(6), moduleById.get(102)) === false);

// --- lkpdGroupLabel ---
check("label kelompok 'Mapel — Kelompok Materi'", lkpdGroupLabel(moduleById.get(101)) === "Matematika — Eksponen");
check("label kelompok tanpa kelompok materi = mapel saja", lkpdGroupLabel({ id: 1, title: "X", subject: "KKA", topic_group: null, status: "terbit" }) === "KKA");
check("label kelompok tanpa modul = Lainnya", lkpdGroupLabel(null) === "Lainnya");

// --- groupLkpdOptions ---
const groups = groupLkpdOptions(worksheets, modules);
const labels = groups.map((group) => group.label);
check(
  "kelompok terurut abjad dan Arsip Lama selalu terakhir",
  same(labels, [
    "Informatika — Berpikir Komputasional",
    "KKA — Berpikir Komputasional",
    "Lainnya",
    "Matematika — Eksponen",
    "Matematika — Matematika Keuangan",
    "Arsip Lama",
  ]),
  labels.join(" | "),
);
const eksponenGroup = groups.find((group) => group.label === "Matematika — Eksponen");
check(
  "di dalam kelompok: nomor ATP menaik numerik (1.1, 1.2, 1.6, 1.10)",
  same(eksponenGroup.worksheets.map((worksheet) => worksheet.id), [4, 2, 1, 3]),
);
const matkeuGroup = groups.find((group) => group.label === "Matematika — Matematika Keuangan");
check(
  "LKPD bernomor dari judul modul ikut urutan ATP, sebelum yang tanpa nomor",
  same(matkeuGroup.worksheets.map((worksheet) => worksheet.id), [6, 5, 7]),
);
const arsipGroup = groups.find((group) => group.label === "Arsip Lama");
check(
  "kelompok Arsip Lama memuat arsip judul + arsip modul, lintas mapel",
  same(arsipGroup.worksheets.map((worksheet) => worksheet.id), [10, 11]),
);
const lainnyaGroup = groups.find((group) => group.label === "Lainnya");
check(
  "LKPD tanpa modul dan bermodul hilang masuk Lainnya, terurut abjad judul",
  same(lainnyaGroup.worksheets.map((worksheet) => worksheet.id), [13, 12]),
);
check(
  "ATP 1.1 dari tiga mapel terpisah ke kelompok mapel masing-masing",
  groups.find((group) => group.label === "KKA — Berpikir Komputasional").worksheets[0].id === 8
    && groups.find((group) => group.label === "Informatika — Berpikir Komputasional").worksheets[0].id === 9,
);
check("pengelompokan tidak mengubah array asal", worksheets[0].id === 1 && groups.flatMap((group) => group.worksheets).length === worksheets.length);

// --- worksheetIdsForClassFilter ---
const classes = [
  { id: 11, name: "XI TKJ A" },
  { id: 12, name: "XI DPIB" },
];
const assignments = [
  { worksheet_id: 201, classes: [{ id: 11, name: "XI TKJ A" }], students: [] },
  { worksheet_id: 202, classes: [{ id: 12, name: "XI DPIB" }], students: [] },
  { worksheet_id: 203, classes: [], students: [{ class_name: "XI TKJ A" }] },
  { worksheet_id: null, classes: [{ id: 11, name: "XI TKJ A" }], students: [] },
];
const attempts = [
  { worksheet_id: 204, class_id: 11 },
  { worksheet_id: 205, class_id: 12 },
  { worksheet_id: 206, class_id: null },
  { worksheet_id: 201, class_id: 12 },
];
const sortedIds = (set) => (set === null ? null : [...set].sort((a, b) => a - b));
check("saringan 'semua' tidak menyaring (null)", worksheetIdsForClassFilter("semua", assignments, attempts, classes) === null);
check(
  "kelas 11: gabungan penugasan kelas + penugasan siswa sekelas + pengumpulan kelas itu",
  same(sortedIds(worksheetIdsForClassFilter("11", assignments, attempts, classes)), [201, 203, 204]),
);
check(
  "kelas 12: penugasan kelasnya + pengumpulannya (termasuk LKPD milik kelas lain yang dikumpulkan muridnya)",
  same(sortedIds(worksheetIdsForClassFilter("12", assignments, attempts, classes)), [201, 202, 205]),
);
check(
  "'tanpa_kelas' hanya dari pengumpulan tanpa kelas",
  same(sortedIds(worksheetIdsForClassFilter("tanpa_kelas", assignments, attempts, classes)), [206]),
);
check("nilai saringan tidak dikenal tidak menyaring (null)", worksheetIdsForClassFilter("aneh", assignments, attempts, classes) === null);
check(
  "penugasan tanpa worksheet_id tidak menyumbang apa pun",
  !worksheetIdsForClassFilter("11", assignments, attempts, classes).has(null),
);

// --- filterWorksheetsByIds ---
check("filter ids null mengembalikan semua", filterWorksheetsByIds(worksheets, null).length === worksheets.length);
check(
  "filter ids menyisakan himpunan tersaring saja",
  same(filterWorksheetsByIds(worksheets, new Set([2, 6])).map((worksheet) => worksheet.id), [2, 6]),
);
check(
  "gabungan saringan kelas + pengelompokan: hanya LKPD kelas itu yang berkelompok",
  same(
    groupLkpdOptions(filterWorksheetsByIds(
      [
        { id: 201, title: "LKPD ATP 2.1 — Bunga Tunggal", module_id: 102, status: "terbit" },
        { id: 204, title: "LKPD ATP 1.2 — Sifat Eksponen", module_id: 101, status: "terbit" },
        { id: 205, title: "LKPD ATP 1.1 — Struktur Data", module_id: 104, status: "terbit" },
      ],
      worksheetIdsForClassFilter("11", assignments, attempts, classes),
    ), modules).map((group) => group.label),
    ["Matematika — Eksponen", "Matematika — Matematika Keuangan"],
  ),
);

// --- resolveGradingSource (reset pilihan) ---
check("sumber terpilih yang masih tersaring bertahan", resolveGradingSource(201, new Set([201, 203])) === 201);
check("sumber terpilih yang tersaring keluar kembali ke 'semua'", resolveGradingSource(202, new Set([201, 203])) === "semua");
check("sumber 'semua' tidak berubah oleh saringan", resolveGradingSource("semua", new Set([201])) === "semua");
check("tanpa saringan (null) sumber tidak berubah", resolveGradingSource(202, null) === 202);
check("himpunan tersaring kosong menggugurkan pilihan apa pun", resolveGradingSource(201, new Set()) === "semua");

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
