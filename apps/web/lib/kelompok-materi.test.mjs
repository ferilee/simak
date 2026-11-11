// Tests for saringan kelompok materi di web (lib/kelompok-materi.ts +
// wiring-nya di app/guru/page.tsx).
// Run with bun from apps/web:  bun lib/kelompok-materi.test.mjs
//
// Yang dikunci di sini:
//  - Chip saringan hanya memuat kelompok yang benar-benar terisi pada
//    modul guru itu (dengan hitungan), berurutan kurikulum lebih dulu,
//    dan "Lainnya" (topic_group NULL) selalu paling akhir.
//  - Pencocokan saringan: "semua" meloloskan semua; "Lainnya" hanya
//    yang belum dikelompokkan; nama kelompok cocok persis.
//  - Pengurai judul HANYA untuk saran di formulir edit: pola
//    "… — <Kelompok> (ATP x.y)" terbaca, judul di luar pola → null.
//  - Wiring: saringan ikut rantai visibleModules + reset, formulir buat
//    & edit mengirim topicGroup, dan dropdown kelompok mengambil
//    daftarnya dari /kurikulum/groups.
import { readFileSync } from "node:fs";
import {
  canonicalTopicOrder,
  groupsForSubject,
  matchesTopicFilter,
  parseTopicGroupFromTitle,
  planTopicChips,
  TOPIC_FILTER_LAINNYA,
  TOPIC_FILTER_SEMUA,
} from "./kelompok-materi.ts";

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

const MODULES = [
  { topic_group: "Matematika Keuangan" },
  { topic_group: "Eksponen" },
  { topic_group: "Eksponen" },
  { topic_group: null },
  { topic_group: "Berpikir Komputasional" },
  { topic_group: "  " },
  { topic_group: "Kelompok Bebas" },
];
const ORDER = ["Eksponen", "Matematika Keuangan", "Berpikir Komputasional"];
const chips = planTopicChips(MODULES, ORDER);
check(
  "chip berurutan kurikulum → alfabetis → Lainnya, dengan hitungan",
  JSON.stringify(chips) === JSON.stringify([
    { key: "Eksponen", label: "Eksponen", count: 2 },
    { key: "Matematika Keuangan", label: "Matematika Keuangan", count: 1 },
    { key: "Berpikir Komputasional", label: "Berpikir Komputasional", count: 1 },
    { key: "Kelompok Bebas", label: "Kelompok Bebas", count: 1 },
    { key: TOPIC_FILTER_LAINNYA, label: "Lainnya", count: 2 },
  ]),
  JSON.stringify(chips),
);
check("tanpa modul kosong → chip Lainnya tidak tampil", planTopicChips([{ topic_group: "Eksponen" }], ORDER).length === 1);

check("saringan semua meloloskan apa pun", matchesTopicFilter(null, TOPIC_FILTER_SEMUA) && matchesTopicFilter("Eksponen", TOPIC_FILTER_SEMUA));
check("saringan Lainnya hanya untuk yang belum dikelompokkan", matchesTopicFilter(null, TOPIC_FILTER_LAINNYA) && matchesTopicFilter("  ", TOPIC_FILTER_LAINNYA) && !matchesTopicFilter("Eksponen", TOPIC_FILTER_LAINNYA));
check("saringan kelompok cocok persis (sesudah pangkas)", matchesTopicFilter(" Eksponen ", "Eksponen") && !matchesTopicFilter("Eksponen", "Matematika Keuangan"));

check(
  "judul berpola terbaca kelompoknya",
  parseTopicGroupFromTitle("Nilai Sekarang Suatu Pinjaman — Matematika Keuangan (ATP 2.4)") === "Matematika Keuangan" &&
    parseTopicGroupFromTitle("Persamaan Eksponen Sederhana — Eksponen (ATP 1.4)") === "Eksponen",
);
check("judul tanpa pola ATP → tidak ada saran", parseTopicGroupFromTitle("Paket Daring SPtLDV Kelas X") === null);
check("judul dengan (ATP tapi tanpa pemisah — → tidak ada saran", parseTopicGroupFromTitle("Modul Eksponen (ATP 1.1)") === null);

const LISTS = [
  { subject: "Matematika", groups: ["Eksponen", "Matematika Keuangan"] },
  { subject: "KKA", groups: ["Berpikir Komputasional"] },
];
check(
  "dropdown cocok untuk mapel bebas berketerangan kurung",
  JSON.stringify(groupsForSubject(LISTS, "Koding dan Kecerdasan Artifisial (KKA)")) === JSON.stringify(["Berpikir Komputasional"]),
);
check("mapel tak dikenal → dropdown kosong (hanya Lainnya)", groupsForSubject(LISTS, "Bahasa Indonesia").length === 0);
check("urutan kanonis menggabungkan semua mapel", JSON.stringify(canonicalTopicOrder(LISTS)) === JSON.stringify(["Eksponen", "Matematika Keuangan", "Berpikir Komputasional"]));

// --- Wiring halaman guru ------------------------------------------------------
const page = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");
check("rantai visibleModules menyaring kelompok", page.includes("matchesTopicFilter(module.topic_group, moduleTopicFilter)"));
check("atur ulang saringan mengembalikan kelompok ke semua", page.includes("setModuleTopicFilter(TOPIC_FILTER_SEMUA)"));
check("chip kelompok dirender dari planTopicChips", page.includes("planTopicChips(modules, canonicalTopicOrder(topicGroups))"));
check("daftar kelompok dimuat dari /kurikulum/groups", page.includes('"/kurikulum/groups"'));
check("formulir buat mengirim topicGroup", page.includes("topicGroup: topicGroup || null"));
check("formulir edit mengirim topicGroup", page.includes("topicGroup: editModuleTopicGroup || null"));
check("penanda kotor metadata ikut membandingkan kelompok", page.includes("editModuleTopicGroup !== moduleMetaBase.topicGroup"));
check("tombol saran dari judul ada di formulir edit", page.includes("Saran dari judul:"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
