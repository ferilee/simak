// Tests for "Lembar Nilai": the Step-5 grading detail (attemptDetail)
// moves out of the page flow below the "Pengumpulan LKPD" list into the
// shared Modal as a wide sheet with a sticky navigation footer, so the
// teacher grades a whole queue without scrolling up and down.
// Run with bun from apps/web:  bun lib/lembar-nilai.test.mjs
//
// What is locked here:
//  - The pure navigation helpers (lib/lembar-nilai.ts): neighborIndex,
//    nextUngradedIndex, progressLabel over { id, graded } entries.
//  - Hosting: the detail renders ONLY inside the sheet Modal (wide +
//    footer + subtitle); the in-page layout/review mount is gone; the
//    list card click opens the sheet through the shared opener.
//  - Footer: Sebelumnya/Berikutnya follow the visible list order and
//    are disabled at the ends; "Simpan penilaian" keeps the legacy
//    save; "Simpan & Berikutnya" saves first (dirty only), then jumps
//    to the next still-ungraded entry, and at the end of the queue it
//    closes the sheet with the exact toast copy.
//  - Close guard: the sheet reuses the Tahap-1 guarded close
//    (requestEditModalClose + the same confirm copy) driven by the
//    grading-dirty derivation; the three Tahap-1 modals pass neither
//    wide nor footer and are unaffected.
import { readFileSync } from "node:fs";
import { neighborIndex, nextUngradedIndex, progressLabel } from "./lembar-nilai.ts";

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
const modal = read("../components/Modal.tsx");
const css = read("../app/globals.css");
const count = (haystack, needle) => haystack.split(needle).length - 1;

// Extract the body of the first rule/block starting at `marker`
// (brace-matched, so @media blocks come out whole).
function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

// --- Pure helpers: neighborIndex ---
const entries = [
  { id: 11, graded: true },
  { id: 22, graded: false },
  { id: 33, graded: false },
  { id: 44, graded: true },
];
check("tetangga tengah: prev dari posisi 3 adalah indeks 1", neighborIndex(entries, 33, "prev") === 1);
check("tetangga tengah: next dari posisi 2 adalah indeks 2", neighborIndex(entries, 22, "next") === 2);
check("ujung awal: prev entri pertama null", neighborIndex(entries, 11, "prev") === null);
check("ujung akhir: next entri terakhir null", neighborIndex(entries, 44, "next") === null);
check("entri tak dikenal: prev/next sama-sama null", neighborIndex(entries, 99, "prev") === null && neighborIndex(entries, 99, "next") === null);
check("daftar satu entri: kedua arah null", neighborIndex([{ id: 7, graded: false }], 7, "next") === null && neighborIndex([{ id: 7, graded: false }], 7, "prev") === null);
check("daftar kosong: null", neighborIndex([], 7, "next") === null);

// --- Pure helpers: nextUngradedIndex ---
check("antrean berikutnya: dari awal melompat ke yang belum dinilai pertama sesudahnya", nextUngradedIndex(entries, 11) === 1);
check("antrean berikutnya: melewati yang sudah dinilai di antaranya", nextUngradedIndex(entries, 22) === 2);
check("antrean berikutnya: tidak ada lagi sesudah posisi terakhir yang antre", nextUngradedIndex(entries, 33) === -1);
check("antrean berikutnya: dari entri terakhir tidak ada", nextUngradedIndex(entries, 44) === -1);
check("antrean berikutnya: entri saat ini tak dikenal -> cari dari awal daftar", nextUngradedIndex(entries, 99) === 1);
check("antrean berikutnya: semua sudah dinilai -> -1", nextUngradedIndex([{ id: 1, graded: true }, { id: 2, graded: true }], 1) === -1);
check("antrean berikutnya: daftar kosong -> -1", nextUngradedIndex([], 1) === -1);
check("antrean berikutnya: yang antre hanya entri itu sendiri -> -1 (tidak mengulang diri)", nextUngradedIndex([{ id: 5, graded: false }], 5) === -1);

// --- Pure helpers: progressLabel ---
check(
  "label kemajuan: posisi 1-based + total tampil + sisa belum dinilai",
  progressLabel(entries, 33) === "Pengumpulan 3 dari 4 · 2 belum dinilai",
  progressLabel(entries, 33) ?? "(null)",
);
check(
  "label kemajuan: di entri pertama sisa dihitung dari seluruh daftar",
  progressLabel(entries, 11) === "Pengumpulan 1 dari 4 · 2 belum dinilai",
);
check(
  "label kemajuan: semua tuntas -> sisa nol tetap disebut",
  progressLabel([{ id: 1, graded: true }], 1) === "Pengumpulan 1 dari 1 · 0 belum dinilai",
);
check("label kemajuan: entri tak dikenal -> null", progressLabel(entries, 99) === null);
check("label kemajuan: daftar kosong -> null", progressLabel([], 1) === null);

// --- Hosting: detail hanya tinggal di dalam lembar ---
check("rincian diekstrak ke renderAttemptReview", page.includes("function renderAttemptReview()"));
check("akar rincian teacher-attempt-review muncul tepat sekali di halaman", count(page, 'className="teacher-attempt-review"') === 1);
check("tata letak dua kolom lama hilang dari halaman", !page.includes("teacher-attempt-layout"));
check("renderAttemptReview mengembalikan null tanpa rincian", page.includes("if (!attemptDetail) return null;"));
check(
  "isi rincian dirender dari dalam Modal lembar",
  page.includes("{attemptDetail ? renderAttemptReview() :"),
);
check("pemuatan rincian di dalam lembar punya teks tunggu", page.includes("Memuat rincian pengumpulan…"));

// --- Modal lembar: props + penjaga tutup ---
const sheetStart = page.indexOf("open={gradingSheetOpen}");
check("modal lembar ada dan dibuka oleh gradingSheetOpen", sheetStart >= 0);
const sheetBlock = sheetStart >= 0 ? page.slice(sheetStart, page.indexOf("</Modal>", sheetStart)) : "";
check("lembar memakai varian wide", sheetBlock.includes("\n        wide\n"));
check("lembar memakai footer bilah navigasi", sheetBlock.includes("footer={renderGradingSheetFooter()}"));
check("judul lembar = identitas pengumpulan", sheetBlock.includes("title={gradingSheetTitle}"));
check("subjudul lembar = nama LKPD", sheetBlock.includes("subtitle={gradingSheetSubtitle}"));
check(
  "judul diturunkan dari rincian, cadangan dari baris daftar",
  page.includes('const gradingSheetTitle = attemptDetail?.attempt.student_name ?? gradingSheetEntry?.student_name ?? "Penilaian";'),
);
check(
  "tutup lembar lewat penjaga Tahap 1 yang sama dengan penanda kotor penilaian",
  sheetBlock.includes("onClose={() => void requestEditModalClose(gradingDirty, closeGradingSheet)}"),
);
check(
  "baris kemajuan antrean tampil di kepala isi lembar",
  sheetBlock.includes("{gradingSheetProgress ? <p style={styles.muted}>{gradingSheetProgress}</p> : null}"),
);
check(
  "kemajuan dihitung dari daftar tampil lewat progressLabel",
  page.includes("progressLabel(gradingSheetEntries, selectedAttemptId)"),
);
check(
  "entri lembar memakai kebalikan isUngradedAttempt (semantik 'Belum dinilai' panel)",
  page.includes("gradingSheetEntries = visibleGradingAttempts.map((attempt) => ({ id: attempt.id, graded: !isUngradedAttempt(attempt) }))"),
);

// --- Buka dari daftar ---
check(
  "klik kartu daftar membuka lewat pembuka bersama lalu menaikkan lembar",
  page.includes("openGradingAttempt(attempt);\n                      setGradingSheetOpen(true);"),
);
check(
  "pembuka bersama meniru pilihan gabungan lama (gradingPickRef + worksheet + attempt)",
  page.includes("gradingPickRef.current = true;")
    && page.includes("setSelectedWorksheetId(attempt.worksheet_id);")
    && page.includes("setSelectedAttemptId(attempt.id);"),
);
check(
  "menutup lembar mengosongkan pilihan + rincian, daftar tak disentuh",
  page.includes("function closeGradingSheet()")
    && page.includes("setGradingSheetOpen(false);")
    && page.includes("setAttemptDetail(null);"),
);
check(
  "lembar tidak pernah membuka sendiri: bendera hanya dinyalakan klik kartu",
  count(page, "setGradingSheetOpen(true)") === 1 && count(page, "setGradingSheetOpen(false)") === 1,
);

// --- Footer navigasi ---
check("footer dirender oleh renderGradingSheetFooter", page.includes("function renderGradingSheetFooter()"));
check("tombol Sebelumnya ada", page.includes(">‹ Sebelumnya</button>"));
check("tombol Berikutnya ada", page.includes(">Berikutnya ›</button>"));
check("tombol Simpan penilaian polos ada di footer", page.includes(">Simpan penilaian</button>"));
check("tombol utama Simpan & Berikutnya ada", page.includes("Simpan &amp; Berikutnya ›"));
check(
  "Sebelumnya nonaktif di ujung awal daftar",
  page.includes("disabled={gradingPrevIndex === null}"),
);
check(
  "Berikutnya nonaktif di ujung akhir daftar",
  page.includes("disabled={gradingNextIndex === null}"),
);
check(
  "indeks tetangga footer diturunkan lewat neighborIndex atas daftar tampil",
  page.includes('neighborIndex(gradingSheetEntries, selectedAttemptId, "prev")')
    && page.includes('neighborIndex(gradingSheetEntries, selectedAttemptId, "next")'),
);
check(
  "footer tanpa ikon action-icon (hitungan ikon guru tetap terkunci suite ikon)",
  !page.slice(page.indexOf("function renderGradingSheetFooter()"), page.indexOf("function renderAssignmentForm()")).includes("action-icon"),
);

// --- Simpan-dulu + Simpan & Berikutnya ---
check(
  "inti simpan terpisah: saveGradesCore mengembalikan boolean keberhasilan",
  page.includes("async function saveGradesCore(): Promise<boolean>"),
);
check(
  "saveGrades lama tetap memajukan antrean sesudah inti berhasil",
  page.includes("if (await saveGradesCore()) {\n      await advanceAfterGrading(savedWorksheetId, savedAttemptId);\n    }"),
);
check(
  "navigasi dan Simpan & Berikutnya sama-sama simpan-dulu bila kotor, batal bila gagal",
  count(page, "if (gradingDirty && !(await saveGradesCore())) return;") === 2,
);
check("footer Simpan penilaian memanggil saveGrades yang lama", page.includes("onClick={() => void saveGrades()}>Simpan penilaian</button>"));
check(
  "Simpan & Berikutnya menyegarkan kedua sumber daftar seperti lompatan lama",
  page.includes("const freshAttempts = await loadAttempts(worksheetId);")
    && page.includes("const freshAllAttempts = gradingCombined ? await loadAllAttempts() : null;"),
);
check(
  "tujuan Simpan & Berikutnya dipilih nextUngradedIndex atas daftar segar",
  page.includes("const targetIndex = nextUngradedIndex(freshEntries, currentId);"),
);
check(
  "habis antrean: lembar ditutup + toast persis",
  page.includes('closeGradingSheet();\n      setMessage("Semua pengumpulan pada daftar ini sudah dinilai.");'),
);
check(
  "target di luar lipatan tampilan memperluas daftar (mekanisme tampil-bertahap panel)",
  page.includes("if (targetIndex >= gradingRevealedCount) {\n      setGradingRevealedCount(revealedCountForIndex(targetIndex));\n    }"),
);

// --- Penanda kotor penilaian ---
check(
  "kotor per butir membandingkan draf dengan potret savedGradeRef",
  page.includes("const gradingItemDirty = attemptDetail ? attemptDetail.items.some((item) => {")
    && page.includes("const saved = savedGradeRef.current[item.id];"),
);
check(
  "kotor komentar umum membandingkan dengan rincian termuat",
  page.includes('teacherComment !== (attemptDetail.attempt.teacher_comment ?? "")'),
);
check("kotor nilai khusus anggota ikut dihitung", page.includes("const gradingMemberDirty = attemptDetail?.attempt.members"));
check(
  "gradingDirty hanya hidup saat rincian terbuka",
  page.includes("const gradingDirty = attemptDetail !== null"),
);

// --- Komponen Modal: prop wide/footer/subtitle + CSS ---
check("Modal menerima prop wide opsional", modal.includes("wide?: boolean;"));
check("Modal menerima prop footer opsional", modal.includes("footer?: ReactNode;"));
check("Modal menerima prop subtitle opsional", modal.includes("subtitle?: ReactNode;"));
check("varian wide ditandai atribut data-wide pada panel", modal.includes("data-wide={wide ? true : undefined}"));
check("footer dirender sebagai bilah modal-footer", modal.includes('className="modal-footer"'));
check("subtitle dirender sebagai modal-subtitle", modal.includes('className="modal-subtitle"'));
check(
  "CSS: panel wide dibatasi min(920px, 96vw)",
  blockAfter(css, '.modal-panel[data-wide="true"]').includes("width: min(920px, 96vw)"),
);
check(
  "CSS: lembar ≤720px tetap layar penuh untuk varian wide",
  blockAfter(css, "@media (max-width: 720px)").includes('.modal-panel[data-wide="true"]')
    && blockAfter(css, "@media (max-width: 720px)").includes("width: 100%"),
);
check("CSS: modal-footer adalah bilah berbatas atas", blockAfter(css, ".modal-footer").includes("border-top"));
check(
  "ketiga modal Tahap 1 tidak memakai wide/footer (tidak terpengaruh)",
  count(page, "footer={") === 1 && count(page, "\n        wide\n") === 1,
);

console.log(`\nlembar-nilai (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
