// Tests for Pemilih Cepat Penugasan (lib/pemilih-cepat.ts +
// components/PemilihCepat.tsx + wiring di app/guru/page.tsx).
// Run with bun from apps/web:  bun lib/pemilih-cepat.test.mjs
//
// Yang dikunci di sini:
//  - Pencarian: token bebas urutan atas judul ternormalisasi
//    (huruf kecil + diakritik dilipat); query kosong meloloskan semua.
//  - Pengelompokan modul: urutan kurikulum (sumber yang sama dengan
//    chip Materi saya) lebih dulu, grup tak dikenal abjad, modul
//    tanpa kelompok selalu terakhir sebagai "Lainnya & arsip lama"
//    yang terlipat secara bawaan; di dalam grup urut judul menaik.
//  - highlightParts: semua kemunculan token ditandai, tumpang tindih
//    digabung, diakritik pada judul asli tetap memetakan segmen benar.
//  - parseAtpCode + orderWorksheetsForPairing: pasangan ATP dari pola
//    judul modul "(ATP x.y)" dan LKPD "LKPD ATP x.y"; tanpa kode /
//    tanpa pasangan → satu grup datar; nilai terpilih tak pernah
//    diubah (fungsi murni pengurutan saja).
//  - Wiring: formulir penugasan (fungsi bersama buat + edit di Modal)
//    memakai PemilihCepat untuk Modul dan LKPD, select bawaan untuk
//    keduanya hilang dari badan formulir, grup LKPD dibangun dari
//    judul modul terpilih, dan komponen memuat pola papan ketik +
//    lipatan yang dibuka paksa oleh pencarian.
import { readFileSync } from "node:fs";
import {
  filterPickerOptions,
  groupModulesForPicker,
  highlightParts,
  normalizeText,
  orderWorksheetsForPairing,
  parseAtpCode,
  PICKER_LAINNYA_LABEL,
} from "./pemilih-cepat.ts";

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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const page = read("../app/guru/page.tsx");
const component = read("../components/PemilihCepat.tsx");
const css = read("../app/globals.css");

// ---------- normalizeText ----------
check("normalizeText melipat huruf besar", normalizeText("Bunga MAJEMUK") === "bunga majemuk");
check("normalizeText melipat diakritik", normalizeText("Café Übung") === "cafe ubung");
check("normalizeText mempertahankan angka & titik", normalizeText("ATP 2.4") === "atp 2.4");

// ---------- filterPickerOptions ----------
const OPTIONS = [
  { id: 1, title: "Nilai Sekarang Suatu Pinjaman — Matematika Keuangan (ATP 2.4)" },
  { id: 2, title: "Bunga Majemuk — Matematika Keuangan (ATP 2.2)" },
  { id: 3, title: "Pangkat Pecahan sebagai Bentuk Akar — Eksponen (ATP 1.1)" },
];
check("query kosong meloloskan semua", filterPickerOptions(OPTIONS, "").length === 3);
check("query spasi saja meloloskan semua", filterPickerOptions(OPTIONS, "   ").length === 3);
check("satu token menyaring substring", filterPickerOptions(OPTIONS, "majemuk").map((o) => o.id).join(",") === "2");
check("multi token bebas urutan", filterPickerOptions(OPTIONS, "pinjaman nilai").map((o) => o.id).join(",") === "1");
check("token yang hilang menggugurkan opsi", filterPickerOptions(OPTIONS, "nilai trigonometri").length === 0);
check("pencarian tak peka huruf & diakritik", filterPickerOptions([{ id: 9, title: "Café Société (ATP 1.1)" }], "cafe societe").length === 1);

// ---------- groupModulesForPicker ----------
const MODULES = [
  { id: 1, title: "Nilai Sekarang — Matematika Keuangan (ATP 2.4)", topic_group: "Matematika Keuangan" },
  { id: 2, title: "Bunga Tunggal — Matematika Keuangan (ATP 2.1)", topic_group: "Matematika Keuangan" },
  { id: 3, title: "Pangkat Pecahan — Eksponen (ATP 1.1)", topic_group: "Eksponen" },
  { id: 4, title: "Modul Percobaan", topic_group: null },
  { id: 5, title: "Materi Zeta", topic_group: "Zeta" },
  { id: 6, title: "Materi Alfa", topic_group: "Alfa" },
  { id: 7, title: "Kelompok Spasi", topic_group: "   " },
];
const grouped = groupModulesForPicker(MODULES, ["Eksponen", "Matematika Keuangan", "Berpikir Komputasional"]);
check(
  "urutan grup: kurikulum dulu, tak dikenal abjad, tanpa kelompok terakhir",
  grouped.map((g) => g.label).join("|") === `Eksponen|Matematika Keuangan|Alfa|Zeta|${PICKER_LAINNYA_LABEL}`,
  grouped.map((g) => g.label).join("|"),
);
check("grup kurikulum tanpa isi tidak tampil", !grouped.some((g) => g.label === "Berpikir Komputasional"));
check("label grup tanpa kelompok persis", grouped[grouped.length - 1].label === "Lainnya & arsip lama");
check("grup tanpa kelompok terlipat secara bawaan", grouped[grouped.length - 1].collapsedByDefault === true);
check("grup ber-kelompok tidak terlipat", grouped[0].collapsedByDefault !== true);
check(
  "topic_group spasi saja dihitung tanpa kelompok",
  grouped[grouped.length - 1].options.map((o) => o.id).sort().join(",") === "4,7",
);
check(
  "di dalam grup butir urut judul menaik",
  grouped[1].options.map((o) => o.id).join(",") === "2,1",
);
check("opsi membawa nama kelompoknya", grouped[0].options[0].group === "Eksponen" && grouped[grouped.length - 1].options[0].group === null);

// ---------- highlightParts ----------
const joined = (parts) => parts.map((p) => p.text).join("");
const matched = (parts) => parts.filter((p) => p.match).map((p) => p.text).join("|");
check("tanpa query satu segmen tak cocok", (() => { const p = highlightParts("Bunga Majemuk", ""); return p.length === 1 && p[0].match === false && p[0].text === "Bunga Majemuk"; })());
check("segmen selalu menyusun judul utuh", joined(highlightParts("Nilai Sekarang Suatu Pinjaman", "sekarang pinjaman")) === "Nilai Sekarang Suatu Pinjaman");
check("multi token tersorot", matched(highlightParts("Nilai Sekarang Suatu Pinjaman", "pinjaman nilai")) === "Nilai|Pinjaman");
check("semua kemunculan token tersorot", matched(highlightParts("Bunga dan Bunga", "bunga")) === "Bunga|Bunga");
check("tanpa kecocokan satu segmen", (() => { const p = highlightParts("Eksponen", "trigonometri"); return p.length === 1 && p[0].match === false; })());
check("token tumpang tindih digabung", matched(highlightParts("Matematika Keuangan", "matematika mate")) === "Matematika");
check("judul berdiakritik tersorot pada posisi benar", (() => { const p = highlightParts("Café Société", "societe"); return joined(p) === "Café Société" && matched(p) === "Société"; })());

// ---------- parseAtpCode ----------
check("kode dari pola modul '(ATP 2.4)'", parseAtpCode("Nilai Sekarang Suatu Pinjaman — Matematika Keuangan (ATP 2.4)") === "2.4");
check("kode dari pola LKPD 'LKPD ATP 1.1'", parseAtpCode("LKPD ATP 1.1 — Berpikir Komputasional") === "1.1");
check("kode di tengah kalimat terbaca", parseAtpCode("Latihan ATP 3.2 untuk kelas X") === "3.2");
check("tanpa ATP → null", parseAtpCode("Modul Percobaan") === null);
check("kata mirip tanpa angka → null", parseAtpCode("Materi ATP dan Kaidah") === null);

// ---------- orderWorksheetsForPairing ----------
const WORKSHEETS = [
  { id: 11, title: "LKPD ATP 2.1 — Bunga Tunggal" },
  { id: 12, title: "LKPD ATP 2.4 — Nilai Sekarang Pinjaman dan Anuitas" },
  { id: 13, title: "LKPD ATP 2.4 — Latihan Tambahan" },
  { id: 14, title: "LKPD Pengayaan Umum" },
];
const paired = orderWorksheetsForPairing(WORKSHEETS, "Nilai Sekarang Suatu Pinjaman — Matematika Keuangan (ATP 2.4)");
check("grup pasangan lebih dulu berlabel kode", paired[0].label === "Pasangan ATP 2.4" && paired[0].paired === true);
check("grup pasangan berlencana pada butir", paired[0].badge === "Pasangan ATP 2.4");
check("banyak pasangan terkumpul", paired[0].options.map((o) => o.id).join(",") === "12,13");
check("sisa LKPD di grup lainnya", paired[1].label === "LKPD lainnya" && paired[1].options.map((o) => o.id).join(",") === "11,14");
const onePair = orderWorksheetsForPairing(WORKSHEETS.slice(0, 2), "Bunga Tunggal (ATP 2.1)");
check("satu pasangan terbaca", onePair[0].options.map((o) => o.id).join(",") === "11" && onePair.length === 2);
check("modul tanpa kode → satu grup datar", (() => { const g = orderWorksheetsForPairing(WORKSHEETS, "Modul Percobaan"); return g.length === 1 && g[0].label === null && g[0].options.length === 4; })());
check("modul null → satu grup datar", (() => { const g = orderWorksheetsForPairing(WORKSHEETS, null); return g.length === 1 && g[0].label === null && g[0].options.length === 4; })());
check("kode tanpa pasangan cocok → satu grup datar", (() => { const g = orderWorksheetsForPairing(WORKSHEETS, "Trigonometri (ATP 9.9)"); return g.length === 1 && g[0].label === null && g[0].options.length === 4; })());
check("semua berpasangan → tanpa grup lainnya", (() => { const g = orderWorksheetsForPairing(WORKSHEETS.slice(1, 3), "Modul (ATP 2.4)"); return g.length === 1 && g[0].label === "Pasangan ATP 2.4"; })());

// ---------- Wiring: halaman guru ----------
const formStart = page.indexOf("function renderAssignmentForm()");
const formEnd = page.indexOf("if (loading) return", formStart);
const formBody = page.slice(formStart, formEnd);
check("badan formulir penugasan ditemukan", formStart !== -1 && formEnd > formStart);
check("formulir memakai PemilihCepat untuk Modul", formBody.includes('<PemilihCepat label="Modul"'));
check("formulir memakai PemilihCepat untuk LKPD", formBody.includes('<PemilihCepat label="LKPD"'));
check("grup modul dibangun dari groupModulesForPicker + urutan kurikulum chip", formBody.includes("groupModulesForPicker(modules, canonicalTopicOrder(topicGroups))"));
check("grup LKPD dibangun dari judul modul terpilih", formBody.includes("orderWorksheetsForPairing(worksheets, selectedModuleTitle)"));
check("select bawaan Modul hilang dari formulir", !formBody.includes('<option value="">Pilih modul</option>') && !formBody.includes("value={selectedId ?? \"\"}"));
check("select bawaan LKPD hilang dari formulir", !formBody.includes('<option value="">Pilih LKPD</option>') && !formBody.includes("value={selectedWorksheetId ?? \"\"}"));
check("pilihan modul terikat ke setSelectedId", formBody.includes("value={selectedId} onChange={setSelectedId}"));
check("pilihan LKPD terikat ke setSelectedWorksheetId", formBody.includes("value={selectedWorksheetId} onChange={setSelectedWorksheetId}"));
check("formulir bersama tetap dipasang dua kali (buat + modal edit)", (page.match(/renderAssignmentForm\(\)/g) ?? []).length === 3);
check("halaman mengimpor komponen + lib pemilih cepat", page.includes('from "../../components/PemilihCepat"') && page.includes('from "../../lib/pemilih-cepat"'));

// ---------- Wiring: komponen ----------
check("komponen memakai role listbox + option", component.includes('role="listbox"') && component.includes('role="option"'));
check("komponen memakai combobox + activedescendant", component.includes('role="combobox"') && component.includes("aria-activedescendant"));
check("papan ketik: panah/Enter/Escape/Tab tertangani", ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].every((key) => component.includes(`"${key}"`)));
check("klik luar menutup lewat pointerdown dokumen", component.includes('addEventListener("pointerdown"'));
check("lipatan dibuka paksa saat mencari", component.includes("searching") && component.includes("collapsedByDefault"));
check("butir tersorot memakai mark", component.includes("<mark") && component.includes("highlightParts"));
check("lencana grup digambar dari prop grup", component.includes("group.badge"));
check("keadaan kosong berbunyi tidak ada yang cocok", component.includes("Tidak ada yang cocok dengan"));
check("tombol bersihkan berada di balik allowClear", component.includes("allowClear") && component.includes("onChange(null)"));

// ---------- Wiring: CSS ----------
check("CSS panel pemilih cepat ada", css.includes(".pemilih-cepat-panel"));
check("CSS keadaan aktif + lencana ada", css.includes(".pemilih-cepat-option.is-active") && css.includes(".pemilih-cepat-badge"));
check("CSS sorotan kata ada", css.includes(".pemilih-cepat-mark"));

console.log(`\npemilih-cepat (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
