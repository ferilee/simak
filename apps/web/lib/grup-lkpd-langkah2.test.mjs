// Tests for the Step-2 "Siapkan LKPD" grouped worksheet list and the
// grouped "Semua modul" filter dropdown (calon v1.0.84). The grouping
// rules are the shared Paket A rules from lib/grup-lkpd: label
// "Mapel — Kelompok Materi" from the paired module, archive always the
// last group "Arsip Lama", empty groups dropped after filtering.
// Run with bun from apps/web:  bun lib/grup-lkpd-langkah2.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LKPD_ARCHIVE_GROUP_LABEL,
  groupLkpdListSections,
  groupModulesForFilter,
  isArchivedModule,
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

// --- Modul contoh: tiga mapel, ATP bertabrakan antar mapel, arsip dua jalur ---
const modules = [
  { id: 101, title: "Pengantar Eksponen — Eksponen (ATP 1.1)", subject: "Matematika", topic_group: "Eksponen", status: "terbit" },
  { id: 102, title: "Sifat Eksponen — Eksponen (ATP 1.2)", subject: "Matematika", topic_group: "Eksponen", status: "terbit" },
  { id: 103, title: "Pangkat Pecahan — Eksponen (ATP 1.6)", subject: "Matematika", topic_group: "Eksponen", status: "terbit" },
  { id: 104, title: "Pengayaan Eksponen — Eksponen (ATP 1.10)", subject: "Matematika", topic_group: "Eksponen", status: "terbit" },
  { id: 105, title: "Bunga Tunggal — Matematika Keuangan (ATP 2.1)", subject: "Matematika", topic_group: "Matematika Keuangan", status: "terbit" },
  { id: 106, title: "Materi Bebas Tanpa Kelompok", subject: "Matematika", topic_group: null, status: "terbit" },
  { id: 107, title: "Berpikir Komputasional — (ATP 1.1)", subject: "KKA", topic_group: "Berpikir Komputasional", status: "terbit" },
  { id: 108, title: "Matematika Keuangan — Bunga dan Anuitas (Arsip lama)", subject: "Matematika", topic_group: "Matematika Keuangan", status: "terbit" },
  { id: 109, title: "Modul Lama Terarsip", subject: "Matematika", topic_group: "Matematika Keuangan", status: "arsip" },
  { id: 110, title: "Tanpa Mapel", subject: "", topic_group: null, status: "draf" },
];

// --- isArchivedModule ---
check("modul arsip karena status", isArchivedModule(modules[8]) === true);
check("modul arsip karena judul mengandung 'Arsip'", isArchivedModule(modules[7]) === true);
check("modul aktif bukan arsip", isArchivedModule(modules[0]) === false);

// --- groupModulesForFilter (dropdown "Semua modul") ---
const moduleGroups = groupModulesForFilter(modules);
check(
  "kelompok modul terurut abjad label, Arsip Lama terakhir",
  same(moduleGroups.map((group) => group.label), [
    "KKA — Berpikir Komputasional",
    "Lainnya",
    "Matematika",
    "Matematika — Eksponen",
    "Matematika — Matematika Keuangan",
    "Arsip Lama",
  ]),
  moduleGroups.map((group) => group.label).join(" | "),
);
check(
  "di dalam kelompok modul: ATP menaik numerik (1.1, 1.2, 1.6, 1.10)",
  same(moduleGroups.find((group) => group.label === "Matematika — Eksponen").modules.map((module) => module.id), [101, 102, 103, 104]),
);
check(
  "modul arsip status + arsip judul sama-sama ke Arsip Lama, lintas kelompok asal",
  same(moduleGroups.find((group) => group.label === LKPD_ARCHIVE_GROUP_LABEL).modules.map((module) => module.id), [108, 109]),
);
check(
  "modul tanpa kelompok materi berlabel mapel saja; tanpa mapel masuk Lainnya",
  moduleGroups.find((group) => group.label === "Matematika").modules[0].id === 106
    && moduleGroups.find((group) => group.label === "Lainnya").modules[0].id === 110,
);
check("daftar modul kosong menghasilkan kelompok kosong", same(groupModulesForFilter([]), []));
check("pengelompokan modul tidak mengubah array asal", modules.length === 10 && moduleGroups.flatMap((group) => group.modules).length === 10);

// --- groupLkpdListSections (daftar kartu Langkah 2) ---
const worksheets = [
  { id: 1, title: "LKPD ATP 1.2 — Sifat Eksponen", module_id: 102, status: "terbit", started_count: 5, updated_at: "2026-11-10T08:00:00.000Z" },
  { id: 2, title: "LKPD ATP 1.1 — Pengantar Eksponen", module_id: 101, status: "terbit", started_count: 9, updated_at: "2026-11-12T08:00:00.000Z" },
  { id: 3, title: "LKPD ATP 1.6 — Pangkat Pecahan", module_id: 103, status: "draf", started_count: 0, updated_at: "2026-11-12T08:00:00.000Z" },
  { id: 4, title: "LKPD ATP 2.1 — Bunga Tunggal", module_id: 105, status: "terbit", started_count: 3, updated_at: "2026-11-11T08:00:00.000Z" },
  { id: 5, title: "LKPD ATP 1.1 — Masalah Sederhana", module_id: 107, status: "terbit", started_count: 7, updated_at: "2026-11-09T08:00:00.000Z" },
  { id: 6, title: "LKPD A — Matematika Keuangan (Arsip Lama)", module_id: 105, status: "terbit", started_count: 1, updated_at: "2026-11-08T08:00:00.000Z" },
  { id: 7, title: "LKPD Lama — Modul Terarsip", module_id: 109, status: "terbit", started_count: 2, updated_at: "2026-11-07T08:00:00.000Z" },
  { id: 8, title: "LKPD Bebas — Tanpa Modul", module_id: null, status: "draf", started_count: 0, updated_at: "2026-11-06T08:00:00.000Z" },
];

for (const sort of ["terbaru", "judul", "dikerjakan"]) {
  const sections = groupLkpdListSections(worksheets, modules, sort);
  check(
    `seksi (${sort}): label abjad dan Arsip Lama terakhir`,
    same(sections.map((section) => section.label), [
      "KKA — Berpikir Komputasional",
      "Lainnya",
      "Matematika — Eksponen",
      "Matematika — Matematika Keuangan",
      "Arsip Lama",
    ]),
    sections.map((section) => section.label).join(" | "),
  );
  check(
    `seksi (${sort}): Arsip Lama memuat arsip judul + LKPD bermodul arsip`,
    same(
      sections.find((section) => section.label === LKPD_ARCHIVE_GROUP_LABEL).worksheets.map((worksheet) => worksheet.id).sort((a, b) => a - b),
      [6, 7],
    ),
  );
}

const eksponenTerbaru = groupLkpdListSections(worksheets, modules, "terbaru")
  .find((section) => section.label === "Matematika — Eksponen");
check(
  "mode 'terbaru': updated_at menurun di dalam seksi, seri kembali ke urutan ATP kanonis",
  same(eksponenTerbaru.worksheets.map((worksheet) => worksheet.id), [2, 3, 1]),
);
const eksponenJudul = groupLkpdListSections(worksheets, modules, "judul")
  .find((section) => section.label === "Matematika — Eksponen");
check(
  "mode 'judul': abjad judul di dalam seksi",
  same(eksponenJudul.worksheets.map((worksheet) => worksheet.id), [2, 1, 3]),
);
const eksponenDikerjakan = groupLkpdListSections(worksheets, modules, "dikerjakan")
  .find((section) => section.label === "Matematika — Eksponen");
check(
  "mode 'dikerjakan': started_count menurun di dalam seksi",
  same(eksponenDikerjakan.worksheets.map((worksheet) => worksheet.id), [2, 1, 3]),
);
check(
  "kelompok yang kosong sesudah penyaringan tidak dirender",
  same(
    groupLkpdListSections(worksheets.filter((worksheet) => worksheet.module_id === 102), modules, "terbaru")
      .map((section) => section.label),
    ["Matematika — Eksponen"],
  ),
);
check(
  "himpunan tersaring kosong menghasilkan seksi kosong",
  same(groupLkpdListSections([], modules, "terbaru"), []),
);
check("pengelompokan seksi tidak mengubah array asal", worksheets[0].id === 1);

// --- Kunci wiring statis pada halaman guru ---
const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");

check(
  "halaman mengimpor helper Langkah 2 dari lib/grup-lkpd",
  page.includes("groupLkpdListSections") && page.includes("groupModulesForFilter") && page.includes("LKPD_ARCHIVE_GROUP_LABEL"),
);
check(
  "seksi diturunkan dari himpunan tersaring + mode urutan aktif",
  page.includes("groupLkpdListSections(filteredWorksheets, modules, worksheetSort)"),
);
check(
  "daftar dirender per seksi dengan kepala label + jumlah",
  page.includes("worksheetSections.map((section)") && page.includes("{section.label} ({section.worksheets.length})"),
);
const filterStart = page.indexOf('aria-label="Saring modul LKPD"');
const filterSegment = filterStart >= 0 ? page.slice(filterStart, page.indexOf("</select>", filterStart)) : "";
check("segmen saringan modul LKPD ditemukan", filterSegment.length > 0);
check(
  "dropdown modul: 'Semua modul' tetap paling atas, sebelum optgroup pertama",
  filterSegment.includes('<option value="semua">Semua modul</option>')
    && filterSegment.indexOf("Semua modul") < filterSegment.indexOf("<optgroup"),
);
check(
  "dropdown modul dirender sebagai optgroup berkelompok dari worksheetModuleGroups",
  filterSegment.includes("worksheetModuleGroups.map") && filterSegment.includes("<optgroup key={group.label} label={group.label}>"),
);
check(
  "pemilih Langkah 5 tetap memakai groupLkpdOptions (tidak ikut berubah)",
  page.includes("groupLkpdOptions(filterWorksheetsByIds(worksheets, gradingWorksheetIds), modules)"),
);
check(
  "CSS kepala seksi LKPD tersedia",
  css.includes(".lkpd-group-toggle") && css.includes(".lkpd-group-list"),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
