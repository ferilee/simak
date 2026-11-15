// Tests for Hub Murid Tahap 3 — Jurnal Belajar di sisi web:
// label tanggal + pengelompokan riwayat (lib/jurnal.ts), label kelas
// guru + saringan kelas — MURNI — plus pengkabelan halaman murid
// (bagian Jurnal di beranda + halaman /murid/jurnal) dan panel guru.
// Run with bun from apps/web:  bun lib/jurnal.test.mjs
//
// Yang dikunci di sini:
//  - Label tanggal "YYYY-MM-DD" tampil sebagai tanggal Indonesia
//    lengkap dengan hari (ditambatkan tengah hari UTC agar tidak
//    bergeser); string rusak diteruskan apa adanya.
//  - Riwayat dikelompokkan per tanggal dengan labelnya; urutan
//    kelompok mengikuti kemunculan pertama tanggal.
//  - Panel guru MURNI BACA: komponennya tidak mengirim metode tulis
//    apa pun (jarum statis atas sumber panel) dan halaman guru
//    memasang tampilan "jurnal" seperti panel malas lainnya.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterGuruJournalClasses, groupEntriesByDate, guruJournalClassLabel, journalDateLabel } from "./jurnal.ts";

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
const muridPage = readFileSync(join(here, "../app/murid/page.tsx"), "utf8");
const jurnalPage = readFileSync(join(here, "../app/murid/jurnal/page.tsx"), "utf8");
const guruPage = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const guruPanel = readFileSync(join(here, "../components/JurnalGuruPanel.tsx"), "utf8");
const globalsCss = readFileSync(join(here, "../app/globals.css"), "utf8");

// --- Label tanggal ---------------------------------------------------------------------
check("label tanggal: Minggu, 15 November 2026", journalDateLabel("2026-11-15") === "Minggu, 15 November 2026", journalDateLabel("2026-11-15"));
check("label tanggal: Sabtu, 14 November 2026", journalDateLabel("2026-11-14") === "Sabtu, 14 November 2026", journalDateLabel("2026-11-14"));
check("label tanggal: Kamis, 1 Januari 2026", journalDateLabel("2026-01-01") === "Kamis, 1 Januari 2026", journalDateLabel("2026-01-01"));
check("label tanggal: string rusak diteruskan apa adanya", journalDateLabel("bukan-tanggal") === "bukan-tanggal");

// --- Pengelompokan riwayat -----------------------------------------------------------------
const entri = (id, entry_date, body) => ({
  id, entry_date, body,
  prompt_key: null, prompt_text: null, mood: null, mood_label: null, mood_emoji: null,
  linked_module_id: null, linked_module_title: null, created_at: "", updated_at: "",
});
const groups = groupEntriesByDate([entri(4, "2026-11-15", "b"), entri(3, "2026-11-15", "a"), entri(2, "2026-11-14", "c"), entri(1, "2026-11-10", "d")]);
check("kelompok riwayat: 3 tanggal, urutan kemunculan pertama",
  groups.length === 3 && groups[0].date === "2026-11-15" && groups[0].entries.length === 2 && groups[1].date === "2026-11-14" && groups[2].date === "2026-11-10",
  JSON.stringify(groups.map((group) => group.date)));
check("kelompok riwayat: label tanggal menempel pada kelompok", groups[0].label === "Minggu, 15 November 2026");
check("kelompok riwayat: kosong → kosong", groupEntriesByDate([]).length === 0);

// --- Label + saringan kelas guru ---------------------------------------------------------------
check("label kelas guru: nama kosong (id 0) → 'Tanpa kelas'",
  guruJournalClassLabel({ id: 0, name: "" }) === "Tanpa kelas" && guruJournalClassLabel({ id: 7, name: "X TKJ A" }) === "X TKJ A");
const kelasContoh = [
  { id: 1, name: "X TKJ A", students: [] },
  { id: 2, name: "X RPL", students: [] },
];
check("saringan kelas: null → semua; id → hanya kelas itu",
  filterGuruJournalClasses(kelasContoh, null).length === 2 &&
  JSON.stringify(filterGuruJournalClasses(kelasContoh, 2).map((kelas) => kelas.id)) === JSON.stringify([2]));

// --- Pengkabelan beranda murid ----------------------------------------------------------------------
check("beranda murid: bagian Jurnal belajar sejajar Progres/Asesmen di langkah Kelas saya",
  muridPage.includes("<h3>Jurnal belajar</h3>") && muridPage.includes('href="/murid/jurnal"'));
check("beranda murid: ringkasan jurnal dimuat gagal-lembut dari /murid/jurnal?limit=1",
  muridPage.includes('"/murid/jurnal?limit=1"') && muridPage.includes("journalDateLabel(journal.latest.entry_date)"));

// --- Pengkabelan halaman jurnal murid ------------------------------------------------------------------
check("halaman jurnal: formulir simpan entri baru + sunting lewat POST/PATCH",
  jurnalPage.includes('method: "POST"') && jurnalPage.includes('method: "PATCH"') && jurnalPage.includes("Simpan entri"));
check("halaman jurnal: hapus memakai konfirmasi bersama + DELETE",
  jurnalPage.includes("useConfirm") && jurnalPage.includes('method: "DELETE"') && jurnalPage.includes("Hapus entri jurnal"));
check("halaman jurnal: chip prompt + mood dari katalog server (bukan salinan lokal)",
  jurnalPage.includes("data.prompts") && jurnalPage.includes("data.moods") && jurnalPage.includes("prompt_key: promptKey"));
check("halaman jurnal: riwayat berkelompok tanggal dari lib",
  jurnalPage.includes("groupEntriesByDate(entries)") && jurnalPage.includes("group.label"));
check("halaman jurnal: keadaan kosong ramah",
  jurnalPage.includes("Belum ada entri jurnal") && jurnalPage.includes("Refleksi pertamamu bisa sesingkat dua kalimat"));
check("halaman jurnal: dinyatakan tidak dinilai di hero",
  jurnalPage.includes("Jurnal ini tidak dinilai"));

// --- Pengkabelan sisi guru --------------------------------------------------------------------------------
check("halaman guru: tampilan jurnal terpasang seperti panel malas lain",
  guruPage.includes('useState<"langkah" | "perpustakaan" | "kurikulum" | "jurnal">') &&
  guruPage.includes("openJournalView") && guruPage.includes('guruView === "jurnal"') &&
  guruPage.includes("<JurnalGuruPanel />"));
check("panel guru: membaca ringkasan + entri dari /guru/jurnal*",
  guruPanel.includes('"/guru/jurnal"') && guruPanel.includes("/guru/jurnal/entries?studentId="));
check("panel guru: MURNI BACA — tidak ada metode tulis pada panel",
  !/method: "(POST|PATCH|PUT|DELETE)"/.test(guruPanel));
check("panel guru: tanpa bahasa penilaian (tidak ada kata nilai/skor untuk jurnal)",
  !guruPanel.includes("Nilai jurnal") && !guruPanel.includes("Skor jurnal") && guruPanel.includes("bukan tugas yang dinilai"));
check("panel guru: gaya panel terdaftar di globals.css", globalsCss.includes(".jurnal-guru-panel"));

console.log(`\nWeb jurnal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
