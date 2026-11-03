// Tests for "Penilaian Rapi" (v1.0.34) on the teacher + student pages.
// Run with bun from apps/web:  bun lib/penilaian-rapi.test.mjs
//
// Five approved pieces: (1) incremental per-item grading (autosave) with a
// "Dinilai X dari Y butir" progress marker, (2) groups-only queue for
// group-mode assignments (API-side; the panel counts derive from the same
// list — locked on the API suite), (3) quick-score chip colors, (4) the
// groups panel desktop layout + a clearly-active "Salin daftar" button,
// (5) member chips on the student's assignment detail card.
//
// The pure helpers are tested behaviorally; the page wiring is locked
// statically against the sources, following this repo's convention.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { activeQuickScoreChip, gradingProgressLabel } from "./grading-helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const guru = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");
const muridDetail = readFileSync(join(here, "../app/murid/assignments/[id]/page.tsx"), "utf8");
const muridWorksheet = readFileSync(join(here, "../app/murid/worksheets/[id]/page.tsx"), "utf8");

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

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------------
console.log("Case 1: warna chip nilai cepat (fungsi murni)");
{
  check("skor 0 → chip nol", activeQuickScoreChip(0, 10) === "zero");
  check("skor setengah → chip ½", activeQuickScoreChip(5, 10) === "half");
  check("skor penuh → chip Penuh", activeQuickScoreChip(10, 10) === "full");
  check("setengah dari 7 adalah 3.5", activeQuickScoreChip(3.5, 7) === "half");
  check("setengah dari 2.5 adalah 1.25", activeQuickScoreChip(1.25, 2.5) === "half");
  check("skor manual di luar chip → tidak ada chip aktif", activeQuickScoreChip(7, 10) === null && activeQuickScoreChip(3.33, 10) === null);
  check("belum ada skor → tidak ada chip aktif", activeQuickScoreChip(null, 10) === null);
  check("poin 0 → tidak ada chip aktif", activeQuickScoreChip(0, 0) === null);
  check("skor bukan angka → tidak ada chip aktif", activeQuickScoreChip(Number.NaN, 10) === null);
}

// ---------------------------------------------------------------------------
console.log("Case 2: label kemajuan penilaian cicilan (fungsi murni)");
{
  check("3 dari 11", gradingProgressLabel(3, 11) === "Dinilai 3 dari 11 butir");
  check("belum ada yang dinilai → null", gradingProgressLabel(0, 11) === null);
  check("jumlah butir tidak diketahui → null", gradingProgressLabel(3, 0) === null);
}

// ---------------------------------------------------------------------------
console.log("Case 3: autosave per butir di halaman guru (statis)");
{
  check("helper chip + label diimpor", guru.includes("activeQuickScoreChip") && guru.includes("gradingProgressLabel"));
  check("fungsi commitGradeItem tersedia", guru.includes("async function commitGradeItem("));
  check("autosave memanggil endpoint per butir", guru.includes("attempts/${attemptId}/items`"));
  check("klik chip cepat langsung menyimpan", count(guru, "void commitGradeItem(item, value, noteDrafts[item.id] ?? \"\")") === 3);
  check("komitmen kolom nilai + catatan menyimpan", count(guru, "onBlur={() => void commitGradeItem(item, scoreDrafts[item.id] ?? \"\", noteDrafts[item.id] ?? \"\")}") === 2);
  check("nilai tak berubah tidak dikirim ulang (potret tersimpan)", guru.includes("savedGradeRef") && guru.includes("saved.score === score && saved.note === note"));
  check("penanda Tersimpan ✓ per butir", guru.includes("Tersimpan ✓") && guru.includes('itemSaveStates[item.id] === "saved"'));
  check("penanda Menyimpan… per butir", guru.includes("Menyimpan nilai…"));
  check("tuntas autosave → antrean lanjut seperti simpan menyeluruh", guru.includes("if (response.data.complete) {\n        await advanceAfterGrading(worksheetId, attemptId);"));
  check("simpan menyeluruh tetap memakai alur lanjut yang sama", guru.includes("await advanceAfterGrading(savedWorksheetId, savedAttemptId);"));
  check("tombol Simpan penilaian tetap ada", guru.includes(">Simpan penilaian</button>"));
}

// ---------------------------------------------------------------------------
console.log("Case 4: penanda kemajuan di kartu daftar + kepala rincian (statis)");
{
  check("kartu daftar menampilkan label kemajuan saat total kosong", guru.includes('gradingProgressLabel(attempt.graded_count ?? 0, attempt.total_items ?? 0) ?? "Belum dinilai"'));
  check("kepala rincian menampilkan label kemajuan", guru.includes("gradingProgressText") && guru.includes("nilai tampil ke murid sesudah semua butir selesai dinilai"));
  check("tipe daftar membawa graded_count + total_items", guru.includes("graded_count?: number;") && guru.includes("total_items?: number;"));
}

// ---------------------------------------------------------------------------
console.log("Case 5: warna chip aktif di halaman guru (statis)");
{
  check("chip 0 aktif: putih bertepi tegas", guru.includes('scoreChipZeroActive: { border: "2px solid #344054"') && guru.includes('background: "#ffffff"'));
  check("chip ½ aktif: gradasi putih ke biru", guru.includes("scoreChipHalfActive") && guru.includes("linear-gradient(90deg, #ffffff 0%, #84adff 100%)"));
  check("chip Penuh aktif: hijau", guru.includes("scoreChipFullActive") && guru.includes('background: "#067647"'));
  check("keaktifan chip ditentukan activeQuickScoreChip dari draf", count(guru, "activeQuickScoreChip(scoreDrafts[item.id]?.trim()") === 3);
  check("label chip tidak berubah", guru.includes(">0</button>") && guru.includes(">½</button>") && guru.includes(">Penuh</button>"));
}

// ---------------------------------------------------------------------------
console.log("Case 6: panel Kelompok — susunan desktop + tombol Salin daftar (statis)");
{
  check("kartu kelompok memakai struktur group-card", guru.includes('className="group-card"'));
  check("baris kepala terpisah dari baris chip", guru.includes('className="group-card-header"') && guru.includes('className="group-card-members"'));
  check("kepala memuat nama + jumlah anggota + lencana progres", guru.includes('className="group-card-title"') && guru.includes('className="group-card-count"') && guru.includes("groupProgressChip(group.attempt_status)"));
  check("chip anggota tetap member-chip dengan tombol keluarkan", guru.includes('className="member-chip"') && guru.includes('className="member-chip-remove"'));
  check("CSS group-card satu kolom tersedia", css.includes(".group-card {") && css.includes(".group-card-header {") && css.includes(".group-card-members {"));
  check("tombol Salin daftar memakai gaya tombol aktif khusus", guru.includes('className="copy-list-button"'));
  check("CSS copy-list-button mengikuti token utama + hover", css.includes(".copy-list-button {") && css.includes("background: #175cd3;") && css.includes(".copy-list-button:hover"));
  check("teks tombol tetap Salin daftar / Tersalin ✓", guru.includes('"Salin daftar"') && guru.includes('"Tersalin ✓"'));
}

// ---------------------------------------------------------------------------
console.log("Case 7: kartu kelompok murid — anggota sebagai chip (statis)");
{
  check("detail penugasan merender chip per anggota", muridDetail.includes('{data.assignment.group.members.map((member) => <span key={member.id} className="member-chip">{member.name}</span>)}'));
  check("daftar koma lama hilang dari kartu detail", !muridDetail.includes('members.map((member) => member.name).join(", ")'));
  check("gaya chip sama dengan halaman LKPD murid (member-chip bersama)", muridWorksheet.includes('className="member-chip"') && css.includes(".member-chip {"));
  check("wadah chip membungkus seperti halaman LKPD", muridDetail.includes("groupMembers: { display: \"flex\", gap: 6, flexWrap: \"wrap\" as const }"));
  check("sisa kartu tidak berubah (judul + penjelasan kelompok)", muridDetail.includes("Penugasan ini dikerjakan berkelompok — LKPD dikerjakan bersama dan dikumpulkan atas nama kelompok."));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
