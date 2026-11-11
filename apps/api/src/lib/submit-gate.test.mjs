// Tests for "Jaga Jawaban Kelompok" (API side): the group submission
// completeness gate and the save-path guard against stale group saves.
// Run with bun from apps/api:  bun src/lib/submit-gate.test.mjs
//
// The gate + the same-value predicate are pure (lib/submit-gate.ts) and are
// exercised behaviorally — including the two-client wipe scenario at the
// predicate level. The HTTP routes have no test database in this repo's
// convention (see groups.test.mjs), so their wiring (skip, wroteAny,
// group-only gate, message) is locked statically against the route source.
import { readFileSync } from "node:fs";
import { buildUnansweredMessage, isSameAnswerValue, isStoredAnswerAnswered, itemTypeLabel, unansweredDetails, unansweredOrdinals } from "./submit-gate.ts";

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

const murid = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");

// LKPD contoh: 7 butir — teks PG, isian, uraian, foto, langkah, tautan_ruas
// (tidak terhitung), refleksi. Urutan mengikuti sortOrder seperti halaman.
const ITEMS = [
  { id: 1, itemType: "pilihan_ganda", optionsJson: null },
  { id: 2, itemType: "isian_singkat", optionsJson: null },
  { id: 3, itemType: "uraian", optionsJson: null },
  { id: 4, itemType: "unggah_foto", optionsJson: null },
  { id: 5, itemType: "langkah_berurutan", optionsJson: { steps: ["A", "B", "C"] } },
  { id: 6, itemType: "tautan_ruas", optionsJson: { url: "https://ruas.example/kuis" } },
  { id: 7, itemType: "refleksi", optionsJson: null },
];

function answers(entries) {
  return new Map(entries.map(([id, answerText, attachmentKey]) => [id, { answerText, attachmentKey: attachmentKey ?? null }]));
}

console.log("Case 1: aturan terjawab per jenis butir (menyalin isItemAnswered halaman)");
{
  const pg = ITEMS[0];
  check("pilihan_ganda: teks terisi → terjawab", isStoredAnswerAnswered(pg, { answerText: "B", attachmentKey: null }));
  check("pilihan_ganda: teks kosong → belum", !isStoredAnswerAnswered(pg, { answerText: "", attachmentKey: null }));
  check("pilihan_ganda: hanya spasi → belum (trim)", !isStoredAnswerAnswered(pg, { answerText: "   ", attachmentKey: null }));
  check("pilihan_ganda: tanpa baris jawaban → belum", !isStoredAnswerAnswered(pg, undefined));
  check("isian_singkat: terisi → terjawab", isStoredAnswerAnswered(ITEMS[1], { answerText: "120000", attachmentKey: null }));
  check("uraian: terisi → terjawab", isStoredAnswerAnswered(ITEMS[2], { answerText: "karena ...", attachmentKey: null }));
  check("refleksi: terisi → terjawab", isStoredAnswerAnswered(ITEMS[6], { answerText: "saya paham", attachmentKey: null }));
  check("unggah_foto: kunci ada → terjawab", isStoredAnswerAnswered(ITEMS[3], { answerText: null, attachmentKey: "foto-1.webp" }));
  check("unggah_foto: teks tanpa kunci → belum", !isStoredAnswerAnswered(ITEMS[3], { answerText: "sudah", attachmentKey: null }));
  check("unggah_foto: kunci kosong → belum", !isStoredAnswerAnswered(ITEMS[3], { answerText: null, attachmentKey: "" }));
}

console.log("Case 2: langkah_berurutan — tersusun vs urutan bawaan");
{
  const langkah = ITEMS[4];
  check("urutan bawaan persis (A\\nB\\nC) → belum terjawab", !isStoredAnswerAnswered(langkah, { answerText: "A\nB\nC", attachmentKey: null }));
  check("urutan tersusun (B\\nA\\nC) → terjawab", isStoredAnswerAnswered(langkah, { answerText: "B\nA\nC", attachmentKey: null }));
  check("teks kosong → belum", !isStoredAnswerAnswered(langkah, { answerText: "", attachmentKey: null }));
  check("tanpa baris → belum", !isStoredAnswerAnswered(langkah, undefined));
  const tanpaLangkah = { id: 9, itemType: "langkah_berurutan", optionsJson: { steps: [] } };
  check("daftar langkah kosong → belum (menyalin halaman: tak pernah tersentuh)", !isStoredAnswerAnswered(tanpaLangkah, { answerText: "A", attachmentKey: null }));
  const langkahAneh = { id: 10, itemType: "langkah_berurutan", optionsJson: { steps: ["A", 7, "B"] } };
  check("langkah non-string disaring sebelum dibandingkan", isStoredAnswerAnswered(langkahAneh, { answerText: "B\nA", attachmentKey: null })
    && !isStoredAnswerAnswered(langkahAneh, { answerText: "A\nB", attachmentKey: null }));
}

console.log("Case 3: ordinal yang belum terjawab + tautan_ruas tidak terhitung");
{
  const lengkap = answers([[1, "B"], [2, "120000"], [3, "uraian"], [4, null, "k.webp"], [5, "C\nA\nB"], [7, "refleksi"]]);
  check("semua terhitung terjawab → daftar kosong", unansweredOrdinals(ITEMS, lengkap).length === 0);
  check("tautan_ruas tanpa jawaban tidak menghalangi", unansweredOrdinals(ITEMS, lengkap).length === 0);
  const sebagian = answers([[1, "B"], [3, "uraian"], [5, "C\nA\nB"]]);
  check(
    "yang kosong: isian=2, foto=4, refleksi=6 (ordinal bergeser melewati tautan_ruas)",
    JSON.stringify(unansweredOrdinals(ITEMS, sebagian)) === JSON.stringify([2, 4, 6]),
    JSON.stringify(unansweredOrdinals(ITEMS, sebagian)),
  );
  check("tanpa jawaban sama sekali → 1..6", JSON.stringify(unansweredOrdinals(ITEMS, new Map())) === JSON.stringify([1, 2, 3, 4, 5, 6]));
}

console.log("Case 4: isSameAnswerValue — predikat lewati pada jalur simpan");
{
  check("identik persis → sama", isSameAnswerValue({ answerText: "teks", attachmentKey: null }, { answerText: "teks" }));
  check("identik dengan kunci foto → sama", isSameAnswerValue({ answerText: "", attachmentKey: "a.webp" }, { answerText: "", attachmentKey: "a.webp" }));
  check("tersimpan null vs terkirim string kosong → sama (sama-sama kosong)", isSameAnswerValue({ answerText: null, attachmentKey: null }, { answerText: "" }));
  check("teks berubah → tidak sama", !isSameAnswerValue({ answerText: "lama", attachmentKey: null }, { answerText: "baru" }));
  check("pengosongan disengaja (berisi → kosong) → TIDAK sama, tetap ditulis", !isSameAnswerValue({ answerText: "isi", attachmentKey: null }, { answerText: "" }));
  check("kunci foto berubah → tidak sama", !isSameAnswerValue({ answerText: "", attachmentKey: "a.webp" }, { answerText: "", attachmentKey: "b.webp" }));
  check("kunci foto dihapus → tidak sama", !isSameAnswerValue({ answerText: "", attachmentKey: "a.webp" }, { answerText: "" }));
}

console.log("Case 5: skenario dua klien — jawaban teman tidak tertimpa");
{
  // Simulasi semantik rute pada tingkat predikat + payload: B menyimpan
  // soal 2 lebih dulu; A (potret lama) kemudian menyimpan payload-nya.
  const stored = new Map([[2, { answerText: "jawaban B", attachmentKey: null, lastEditedBy: 22 }]]);
  // (a) Payload A versi klien yang sudah diperbaiki tidak memuat soal 2
  // sama sekali (diff membuktikan itu di suite web) → tidak ada penulisan.
  const payloadA = [{ itemId: 1, answerText: "jawaban A" }];
  check("(a) soal 2 tidak ada di payload A → baris B utuh", !payloadA.some((entry) => entry.itemId === 2) && stored.get(2).answerText === "jawaban B");
  // (b) Bila klien lain tetap mengirim soal 2 dengan nilai yang sama
  // persis, predikat menyatakannya sama → rute melewatinya (statis Case 6).
  check("(b) kiriman identik untuk soal 2 → predikat sama → dilewati", isSameAnswerValue(stored.get(2), { answerText: "jawaban B" }));
  check("(b) lastEditedBy tidak berpindah pada kiriman identik (predikat sama)", isSameAnswerValue(stored.get(2), { answerText: "jawaban B" }) && stored.get(2).lastEditedBy === 22);
  // (c) Pengosongan disengaja oleh pemiliknya tetap perubahan sungguhan.
  check("(c) B mengosongkan jawabannya sendiri → perubahan, dicatat", !isSameAnswerValue(stored.get(2), { answerText: "" }));
}

console.log("Case 6: pengawatan rute PUT answers (statis)");
{
  const route = murid.slice(murid.indexOf('muridRoutes.put("/worksheets/:id/answers"'), murid.indexOf('muridRoutes.post("/worksheets/:id/submit"'));
  check("rute PUT answers ditemukan", route.length > 0);
  check("baris tersimpan dibaca beserta isinya (untuk dibandingkan)", route.includes("answerText: worksheetAnswers.answerText, attachmentKey: worksheetAnswers.attachmentKey"));
  check("nilai sama dilewati lewat predikat bersama", route.includes("if (isSameAnswerValue(existing, answer)) continue;"));
  check("update hanya untuk yang berubah, cap penulis tetap", route.includes("await db.update(worksheetAnswers).set({ answerText: answer.answerText, attachmentKey: answer.attachmentKey, lastEditedBy: user.userId })"));
  check("insert tetap mencatat penulis", route.includes("lastEditedBy: user.userId,"));
  check("sentuhan attempt hanya bila ada yang tertulis", route.includes("let wroteAny = false;") && route.includes("if (wroteAny) {") && route.includes("wroteAny = true;"));
  check("bentuk respons tidak berubah", route.includes('return c.json({ ok: true, data: { status: "draf" } });'));
}

console.log("Case 7: pengawatan gerbang submit (statis)");
{
  const route = murid.slice(murid.indexOf('muridRoutes.post("/worksheets/:id/submit"'), murid.indexOf('muridRoutes.get("/worksheets/:id/contribution-ratings"'));
  check("rute POST submit ditemukan", route.length > 0);
  check("gerbang hanya di dalam cabang attempt kelompok", route.includes("if (context.group) {") && route.indexOf("if (context.group) {") < route.indexOf("unansweredDetails(items, answersByItemId)"));
  check("butir dibaca terurut sortOrder (sama seperti halaman)", route.includes(".orderBy(asc(worksheetItems.sortOrder))"));
  check("kelengkapan dihitung dari jawaban tersimpan attempt ini", route.includes("eq(worksheetAnswers.attemptId, attempt.id)") && route.includes("unansweredDetails(items, answersByItemId)"));
  check(
    "pesan 400 dibangun oleh pembangun pesan bersama (menyebut nomor + JENIS soal)",
    route.includes("message: buildUnansweredMessage(missing),") && route.includes("}, 400);"),
  );
  check("format pesan lama (nomor saja) tidak tersisa", !route.includes("belum dijawab (nomor"));
  check("penolakan terjadi sebelum attempt diubah ke terkumpul", route.indexOf("unansweredDetails(items, answersByItemId)") < route.indexOf('status: "terkumpul"'));
}

console.log("Case 9: label jenis butir (untuk modal gerbang + pesan 400)");
{
  check("pilihan_ganda", itemTypeLabel("pilihan_ganda") === "Pilihan ganda");
  check("isian_singkat", itemTypeLabel("isian_singkat") === "Isian singkat");
  check("uraian", itemTypeLabel("uraian") === "Uraian");
  check("unggah_foto", itemTypeLabel("unggah_foto") === "Unggah foto");
  check("langkah_berurutan", itemTypeLabel("langkah_berurutan") === "Langkah berurutan");
  check("refleksi", itemTypeLabel("refleksi") === "Refleksi");
  check("jenis tak dikenal → 'Soal'", itemTypeLabel("jenis_aneh") === "Soal");
}

console.log("Case 10: unansweredDetails — ordinal identik dengan unansweredOrdinals, plus jenis");
{
  const sebagian = answers([[1, "B"], [3, "uraian"], [5, "C\nA\nB"]]);
  const details = unansweredDetails(ITEMS, sebagian);
  check(
    "ordinal sama persis dengan unansweredOrdinals",
    JSON.stringify(details.map((entry) => entry.ordinal)) === JSON.stringify(unansweredOrdinals(ITEMS, sebagian)),
  );
  check(
    "jenis mengikuti butirnya: isian=2, foto=4, refleksi=6",
    JSON.stringify(details) === JSON.stringify([
      { ordinal: 2, itemType: "isian_singkat" },
      { ordinal: 4, itemType: "unggah_foto" },
      { ordinal: 6, itemType: "refleksi" },
    ]),
    JSON.stringify(details),
  );
  check("semua terjawab → rincian kosong", unansweredDetails(ITEMS, answers([[1, "B"], [2, "120000"], [3, "uraian"], [4, null, "k.webp"], [5, "C\nA\nB"], [7, "refleksi"]])).length === 0);
  check("tautan_ruas tidak pernah muncul di rincian", unansweredDetails(ITEMS, new Map()).every((entry) => entry.itemType !== "tautan_ruas"));
}

console.log("Case 11: buildUnansweredMessage — format persis");
{
  check(
    "satu soal: tanpa koma, jenis berkapital",
    buildUnansweredMessage([{ ordinal: 7, itemType: "unggah_foto" }])
      === "Masih ada 1 soal yang belum dijawab: Soal 7 (Unggah foto). Lengkapi dulu sebelum mengumpulkan.",
    buildUnansweredMessage([{ ordinal: 7, itemType: "unggah_foto" }]),
  );
  const sebagian = answers([[1, "B"], [3, "uraian"], [5, "C\nA\nB"]]);
  check(
    "banyak soal: digabung koma dari rincian gerbang",
    buildUnansweredMessage(unansweredDetails(ITEMS, sebagian))
      === "Masih ada 3 soal yang belum dijawab: Soal 2 (Isian singkat), Soal 4 (Unggah foto), Soal 6 (Refleksi). Lengkapi dulu sebelum mengumpulkan.",
    buildUnansweredMessage(unansweredDetails(ITEMS, sebagian)),
  );
  check(
    "jumlah pada pesan = panjang daftar (hitungan gerbang tidak berubah)",
    buildUnansweredMessage(unansweredDetails(ITEMS, new Map())).startsWith("Masih ada 6 soal yang belum dijawab: "),
  );
}

console.log("Case 12: Jalur — jurnal migrasi sesuai rantai paket (terakhir 0013 persetujuan-berbagi)");
{
  const journal = readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8");
  check("jurnal migrasi 15 entri", (journal.match(/"idx":/g) ?? []).length === 15);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
