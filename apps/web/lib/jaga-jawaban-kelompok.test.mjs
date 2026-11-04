// Tests for "Jaga Jawaban Kelompok" (web side): the diff-only answers
// payload on the murid worksheet page, the group submission completeness
// gate modal, and the Step 4 class filter on the guru page.
// Run with bun from apps/web:  bun lib/jaga-jawaban-kelompok.test.mjs
import { readFileSync } from "node:fs";
import { advanceSavedSnapshot, diffAnswersPayload } from "./live-kelompok.ts";

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

const page = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
const guru = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");

// Potret tersimpan: soal 1 terisi, soal 2 jawaban teman, soal 3 foto lama.
const SAVED = [
  { itemId: 1, answerText: "jawaban satu" },
  { itemId: 2, answerText: "jawaban teman" },
  { itemId: 3, answerText: "", attachmentKey: "foto-lama.webp" },
];

console.log("Case 1: diffAnswersPayload — hanya yang berubah yang terkirim");
{
  const identik = SAVED.map((entry) => ({ ...entry }));
  check("tanpa perubahan → payload kosong", diffAnswersPayload(identik, SAVED).length === 0);

  const diubah = [
    { itemId: 1, answerText: "jawaban satu suntingan" },
    { itemId: 2, answerText: "jawaban teman" },
    { itemId: 3, answerText: "", attachmentKey: "foto-lama.webp" },
  ];
  const diff = diffAnswersPayload(diubah, SAVED);
  check("satu butir berubah → diff hanya butir itu", diff.length === 1 && diff[0].itemId === 1);

  // Skenario penimpaan yang dilaporkan murid: A membuka halaman (soal 2 di
  // potretnya masih kosong), B menjawab soal 2 dan menyimpan lebih dulu.
  // Potret tersimpan A kini memuat jawaban B (lewat muat/polling), dan A
  // hanya menyunting soal 1 — soal 2 TIDAK boleh ikut terkirim oleh A.
  const potretA = [
    { itemId: 1, answerText: "ketikan A" },
    { itemId: 2, answerText: "jawaban teman" },
    { itemId: 3, answerText: "", attachmentKey: "foto-lama.webp" },
  ];
  const diffA = diffAnswersPayload(potretA, SAVED);
  check("skenario dua klien: soal 2 tidak ikut terkirim oleh A", !diffA.some((entry) => entry.itemId === 2) && diffA.length === 1 && diffA[0].itemId === 1);
}

console.log("Case 2: diffAnswersPayload — pengosongan dan foto adalah perubahan");
{
  const dikosongkan = [
    { itemId: 1, answerText: "" },
    { itemId: 2, answerText: "jawaban teman" },
    { itemId: 3, answerText: "", attachmentKey: "foto-lama.webp" },
  ];
  const diffClear = diffAnswersPayload(dikosongkan, SAVED);
  check("mengosongkan teks → perubahan (tetap terkirim)", diffClear.length === 1 && diffClear[0].itemId === 1 && diffClear[0].answerText === "");

  const fotoBaru = [
    { itemId: 1, answerText: "jawaban satu" },
    { itemId: 2, answerText: "jawaban teman" },
    { itemId: 3, answerText: "", attachmentKey: "foto-baru.webp" },
  ];
  const diffFoto = diffAnswersPayload(fotoBaru, SAVED);
  check("kunci foto berubah → perubahan", diffFoto.length === 1 && diffFoto[0].itemId === 3 && diffFoto[0].attachmentKey === "foto-baru.webp");

  const fotoHilang = [
    { itemId: 1, answerText: "jawaban satu" },
    { itemId: 2, answerText: "jawaban teman" },
    { itemId: 3, answerText: "" },
  ];
  const diffHilang = diffAnswersPayload(fotoHilang, SAVED);
  check("kunci foto hilang → perubahan", diffHilang.length === 1 && diffHilang[0].itemId === 3);

  const butirBaru = [...SAVED.map((entry) => ({ ...entry })), { itemId: 4, answerText: "baru" }];
  check("butir tanpa entri snapshot → terkirim", diffAnswersPayload(butirBaru, SAVED).some((entry) => entry.itemId === 4));
}

console.log("Case 3: advanceSavedSnapshot — snapshot hanya maju pada yang terkirim");
{
  const current = [
    { itemId: 1, answerText: "ketikan A" },
    { itemId: 2, answerText: "jawaban teman" },
    { itemId: 3, answerText: "", attachmentKey: "foto-lama.webp" },
  ];
  const next = advanceSavedSnapshot(SAVED, current, new Set([1]));
  check("butir terkirim maju ke nilai current", next.find((entry) => entry.itemId === 1)?.answerText === "ketikan A");
  check("butir tak terkirim tetap entri snapshot lama", next.find((entry) => entry.itemId === 2)?.answerText === "jawaban teman");
  check("urutan snapshot mengikuti urutan current", JSON.stringify(next.map((entry) => entry.itemId)) === JSON.stringify([1, 2, 3]));
  check("sesudah maju, diff terhadap current kosong", diffAnswersPayload(current, next).length === 0);

  const nextNone = advanceSavedSnapshot(SAVED, current, new Set());
  check("tanpa kiriman → snapshot tidak berubah dari saved", JSON.stringify(nextNone) === JSON.stringify(SAVED));
}

console.log("Case 4: pengawatan persistDraft + submit halaman murid (statis)");
{
  const persist = page.slice(page.indexOf("async function persistDraft"), page.indexOf("async function goToPage"));
  check("persistDraft ditemukan", persist.length > 0);
  check("persistDraft menghitung diff dari snapshot", persist.includes("const changed = diffAnswersPayload(current, saved);"));
  check("payload PUT hanya butir berubah", persist.includes("body: JSON.stringify({ answers: changed })"));
  check("tanpa perubahan → tanpa permintaan, tetap berhasil", persist.includes("if (changed.length === 0) {"));
  check("snapshot maju hanya pada yang terkirim", persist.includes("advanceSavedSnapshot(saved, current, new Set(changed.map((entry) => entry.itemId)))"));

  const submit = page.slice(page.indexOf("async function submitWorksheet"), page.indexOf("async function loadContributionRatings"));
  check("submit tidak lagi PUT payload penuh sendiri", !submit.includes("JSON.stringify({ answers: buildAnswersPayload() })"));
  check("submit menyimpan lewat persistDraft sebelum mengumpulkan", submit.includes("const persisted = await persistDraft();") && submit.indexOf("await persistDraft()") < submit.indexOf("/submit${attemptQuery}"));
  check("kegagalan persist membatalkan pengumpulan", submit.includes("if (!persisted) {"));
  check(
    "dialog peringatan lama untuk individu utuh",
    submit.includes("Baru ${answered} dari ${total} soal terjawab. Soal yang belum dijawab akan terkumpul kosong, dan setelah terkumpul jawaban tidak dapat diubah. Kumpulkan sekarang?"),
  );
}

console.log("Case 5: gerbang kelengkapan kelompok (statis)");
{
  const submit = page.slice(page.indexOf("async function submitWorksheet"), page.indexOf("async function loadContributionRatings"));
  check("gerbang hanya untuk attempt kelompok", submit.includes("if (groupInfo) {") && submit.includes("const missing = unansweredQuestions();"));
  check("gerbang berjalan SEBELUM dialog konfirmasi", submit.indexOf("setIncompleteGate(missing);") < submit.indexOf("confirmDialog(confirmText"));
  check("soal kosong dihitung dengan definisi halaman (ordinalOf + isItemAnswered)", page.includes("if (ordinal !== null && !isItemAnswered(item)) missing.push({ ordinal, index });"));
  check("judul modal pemblokir", page.includes("Masih ada soal yang belum terjawab"));
  check("modal menyebut LKPD kelompok hanya bisa dikumpulkan bila semua terjawab", page.includes("LKPD kelompok hanya bisa dikumpulkan bila semua soal sudah dijawab bersama."));
  check("nomor soal bisa diklik untuk lompat", page.includes("Soal {missing.ordinal}") && page.includes("void goToPage(missing.index);"));
  check("satu-satunya aksi modal: Kembali mengerjakan", page.includes(">Kembali mengerjakan</button>"));
  const modalStart = page.indexOf("incompleteGate ? (");
  const modal = page.slice(modalStart, page.indexOf("</main>", modalStart));
  check("modal tidak memuat tombol/langkah mengumpulkan apa pun", modal.length > 0 && !modal.includes("submitWorksheet") && !modal.includes("Kumpulkan sekarang") && !modal.includes("/submit"));
  check("mengklik latar menutup modal (batal, bukan mengumpulkan)", page.includes('onClick={() => setIncompleteGate(null)}'));
}

console.log("Case 6: saringan kelas Langkah 4 guru (statis)");
{
  check("state saringan kelas ada", guru.includes('const [assignmentClassFilter, setAssignmentClassFilter] = useState<string>("semua");'));
  check("select saringan kelas di samping chip status", guru.includes('aria-label="Saring kelas penugasan"') && guru.includes('<option value="semua">Semua kelas</option>'));
  check("opsi per kelas dari daftar kelas guru", guru.includes("{classes.map((kelas) => <option key={kelas.id} value={String(kelas.id)}>{kelas.name}</option>)}"));
  check("opsi Siswa tertentu ada", guru.includes('<option value="siswa">Siswa tertentu</option>'));
  check("kelas terpilih menyaring lewat classes penugasan", guru.includes("assignment.classes.some((kelas) => kelas.id === Number(assignmentClassFilter))"));
  check("opsi siswa menyaring lewat target_type", guru.includes('assignmentClassFilter === "siswa"\n      ? assignment.target_type === "siswa"'));
  check("kedua saringan berkomposisi (kelas dulu, lalu status)", guru.includes("const visibleAssignments = assignmentStatusFilter === \"semua\"\n    ? classFilteredAssignments\n    : classFilteredAssignments.filter((assignment) => assignment.status === assignmentStatusFilter);"));
  check("ringkasan kepala konsisten dengan saringan gabungan", guru.includes("assignmentFiltersActive ? `Menampilkan ${visibleAssignments.length} dari ${assignments.length} penugasan`"));
  check("pesan kosong untuk saringan kelas", guru.includes("Tidak ada penugasan yang cocok dengan saringan kelas dan status saat ini."));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
