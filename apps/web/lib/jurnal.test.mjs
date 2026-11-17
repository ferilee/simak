// Tests for Hub Murid Tahap 3 — Jurnal Belajar di sisi web:
// label tanggal + pengelompokan riwayat (lib/jurnal.ts), label kelas
// guru + saringan kelas — MURNI — plus pengkabelan halaman murid
// (bagian Jurnal di beranda + halaman /murid/jurnal) dan panel guru.
// Diperluas untuk Tanggapan Guru + Penanda Ditinjau: label tanggal-jam
// tanggapan, lencana belum-ditinjau, dan editor tanggapan panel guru.
// Run with bun from apps/web:  bun lib/jurnal.test.mjs
//
// Yang dikunci di sini:
//  - Label tanggal "YYYY-MM-DD" tampil sebagai tanggal Indonesia
//    lengkap dengan hari (ditambatkan tengah hari UTC agar tidak
//    bergeser); string rusak diteruskan apa adanya.
//  - Riwayat dikelompokkan per tanggal dengan labelnya; urutan
//    kelompok mengikuti kemunculan pertama tanggal.
//  - Panel guru: SATU-SATUNYA metode tulis adalah PUT tanggapan per
//    entri (jarum statis atas sumber panel); halaman guru memasang
//    tampilan "jurnal" seperti panel malas lainnya. Halaman murid
//    menampilkan tanggapan guru TANPA jalur balas apa pun.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterGuruJournalClasses, groupEntriesByDate, guruJournalClassLabel, journalDateLabel, journalDateTimeLabel } from "./jurnal.ts";

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
check("label tanggal-jam tanggapan: ISO → tanggal + 'pukul HH.mm' WIB",
  journalDateTimeLabel("2026-11-17T04:12:00.000Z") === "17 November 2026 pukul 11.12", journalDateTimeLabel("2026-11-17T04:12:00.000Z"));
check("label tanggal-jam tanggapan: null → kosong; string rusak diteruskan",
  journalDateTimeLabel(null) === "" && journalDateTimeLabel("bukan-tanggal") === "bukan-tanggal");

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
check("halaman jurnal: blok Tanggapan guru tampil di bawah entri bila ada (nama + waktu + isi)",
  jurnalPage.includes("entry.teacher_response") && jurnalPage.includes("💬 Tanggapan guru") &&
  jurnalPage.includes("entry.teacher_responded_by_name") && jurnalPage.includes("journalDateTimeLabel(entry.teacher_response_at)"));
check("halaman jurnal: TANPA jalur balas tanggapan (tidak menyentuh endpoint tanggapan)",
  !jurnalPage.includes("/tanggapan"));

// --- Pengkabelan sisi guru --------------------------------------------------------------------------------
check("halaman guru: tampilan jurnal terpasang seperti panel malas lain",
  guruPage.includes('useState<"langkah" | "perpustakaan" | "kurikulum" | "jurnal">') &&
  guruPage.includes("openJournalView") && guruPage.includes('guruView === "jurnal"') &&
  guruPage.includes("<JurnalGuruPanel />"));
check("panel guru: membaca ringkasan + entri dari /guru/jurnal*",
  guruPanel.includes('"/guru/jurnal"') && guruPanel.includes("/guru/jurnal/entries?studentId="));
check("panel guru: SATU-SATUNYA metode tulis adalah PUT tanggapan per entri",
  guruPanel.includes('method: "PUT"') && guruPanel.includes("/guru/jurnal/entries/${entry.id}/tanggapan") &&
  !/method: "(POST|PATCH|DELETE)"/.test(guruPanel));
check("panel guru: editor tanggapan (simpan/sunting/hapus + batas 500 karakter)",
  guruPanel.includes("Simpan tanggapan") && guruPanel.includes("Sunting tanggapan") && guruPanel.includes("Hapus tanggapan") &&
  guruPanel.includes("maxLength={500}"));
check("panel guru: lencana kepala 'perlu ditinjau' dari unreviewed_total + hitungan per murid",
  guruPanel.includes("overview.unreviewed_total") && guruPanel.includes("perlu ditinjau") &&
  guruPanel.includes("student.unreviewed_count") && guruPanel.includes("belum ditinjau"));
check("panel guru: chip 'Belum ditinjau' pada entri yang reviewed_at-nya kosong",
  guruPanel.includes("entry.reviewed_at === null") && guruPanel.includes("Belum ditinjau"));
check("panel guru: kembali ke daftar memuat ulang ringkasan (hitungan ditinjau terbarui)",
  guruPanel.includes("void loadOverview()") && guruPanel.includes("onClick={backToList}"));
check("panel guru: tanggapan tersimpan tampil dengan nama penanggap + waktu",
  guruPanel.includes("entry.teacher_responded_by_name") && guruPanel.includes("journalDateTimeLabel(entry.teacher_response_at)"));
check("panel guru: tanpa bahasa penilaian (tidak ada kata nilai/skor untuk jurnal)",
  !guruPanel.includes("Nilai jurnal") && !guruPanel.includes("Skor jurnal") && guruPanel.includes("bukan tugas yang dinilai"));
check("panel guru: gaya panel + tanggapan terdaftar di globals.css",
  globalsCss.includes(".jurnal-guru-panel") && globalsCss.includes(".jurnal-guru-review-badge") &&
  globalsCss.includes(".jurnal-guru-response") && globalsCss.includes(".jurnal-guru-unreviewed"));

console.log(`\nWeb jurnal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
