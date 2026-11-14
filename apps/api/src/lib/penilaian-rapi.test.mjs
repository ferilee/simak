// Tests for "Penilaian Rapi" (v1.0.34): incremental per-item grading,
// groups-only grading queue for group-mode assignments, and the progress
// markers that come with them.
// Run with bun from apps/api:  bun src/lib/penilaian-rapi.test.mjs
//
// There is no test database in this repo's convention, so: the pure rules
// (completion/progress computation, queue filtering, the shared zod
// schema) are tested behaviorally, and the route wiring (per-item upsert
// endpoint, recompute + status transition, list filters + progress fields,
// whole-save and member-scores routes untouched) is locked statically
// against the route sources. Jalur A is locked too: no new migration.
import { readFileSync, readdirSync } from "node:fs";
import { computeGradingProgress, countGradedByAttempt, gradingStatusAfterItemSave } from "./grading-progress.ts";
import { filterGradingQueueRows, groupOnlyWorksheetIds, isGradingQueueRowVisible } from "./grading-queue.ts";
import { gradeWorksheetItemSchema } from "../../../../packages/shared/src/schemas.ts";

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
const worksheetsRoute = read("../routes/worksheets.ts");
const gradingRoute = read("../routes/grading.ts");
const muridRoute = read("../routes/murid.ts");

// ---------------------------------------------------------------------------
console.log("Case 1: kemajuan penilaian cicilan (fungsi murni)");
{
  const items = [1, 2, 3, 4];
  const partial = computeGradingProgress(items, new Map([[1, 5], [2, 2.5], [4, null]]));
  check("2 dari 4 berskor (baris hilang + skor null = belum)", partial.gradedCount === 2 && partial.totalItems === 4, JSON.stringify(partial));
  check("sebagian → belum lengkap, total null", partial.complete === false && partial.totalScore === null);

  const withZero = computeGradingProgress(items, new Map([[1, 0], [2, 0], [3, 0]]));
  check("skor 0 tetap terhitung sudah dinilai", withZero.gradedCount === 3 && withZero.complete === false);

  const done = computeGradingProgress(items, new Map([[1, 5], [2, 2.5], [3, 10], [4, 0]]));
  check("lengkap → total = jumlah semua skor (identik simpan menyeluruh)", done.complete === true && done.totalScore === 17.5, JSON.stringify(done));

  const floats = computeGradingProgress([1, 2], new Map([[1, 0.1], [2, 0.2]]));
  check("total dibulatkan 2 desimal (0.1 + 0.2 = 0.3)", floats.totalScore === 0.3, JSON.stringify(floats));

  const empty = computeGradingProgress([], new Map());
  check("tanpa butir → tidak lengkap, total null", empty.complete === false && empty.totalScore === null && empty.totalItems === 0);

  const stray = computeGradingProgress([1], new Map([[1, 5], [99, 100]]));
  check("skor butir asing diabaikan", stray.gradedCount === 1 && stray.totalScore === 5);
}

// ---------------------------------------------------------------------------
console.log("Case 2: transisi status attempt sesudah simpan per butir");
{
  const partial = computeGradingProgress([1, 2], new Map([[1, 5]]));
  const complete = computeGradingProgress([1, 2], new Map([[1, 5], [2, 5]]));
  check("sebagian dari terkumpul → tetap terkumpul", gradingStatusAfterItemSave("terkumpul", partial) === "terkumpul");
  check("lengkap → dinilai", gradingStatusAfterItemSave("terkumpul", complete) === "dinilai");
  check("dinilai yang kehilangan kelengkapan → kembali terkumpul", gradingStatusAfterItemSave("dinilai", partial) === "terkumpul");
  check("sebagian dari draf → tetap draf", gradingStatusAfterItemSave("draf", partial) === "draf");
}

// ---------------------------------------------------------------------------
console.log("Case 3: hitungan butir berskor per attempt");
{
  const counts = countGradedByAttempt([{ attemptId: 7 }, { attemptId: 7 }, { attemptId: 9 }]);
  check("menghitung per attempt", counts.get(7) === 2 && counts.get(9) === 1 && counts.get(3) === undefined);
  check("daftar kosong → peta kosong", countGradedByAttempt([]).size === 0);
}

// ---------------------------------------------------------------------------
console.log("Case 4: skema zod simpan per butir");
{
  check("skor + catatan sah", gradeWorksheetItemSchema.safeParse({ itemId: 3, score: 4.5, teacherNote: "bagus" }).success);
  check("skor null (kosongkan) sah", gradeWorksheetItemSchema.safeParse({ itemId: 3, score: null }).success);
  check("tanpa catatan sah (catatan dibiarkan)", gradeWorksheetItemSchema.safeParse({ itemId: 3, score: 0 }).success);
  check("skor negatif ditolak", !gradeWorksheetItemSchema.safeParse({ itemId: 3, score: -1 }).success);
  check("itemId tidak positif ditolak", !gradeWorksheetItemSchema.safeParse({ itemId: 0, score: 1 }).success);
}

// ---------------------------------------------------------------------------
console.log("Case 5: saringan antrean khusus kelompok (fungsi murni)");
{
  const groupOnly = groupOnlyWorksheetIds([
    { worksheetId: 10, workMode: "kelompok", status: "terbit" },
    { worksheetId: 11, workMode: "kelompok", status: "draf" },
    { worksheetId: 12, workMode: "kelompok", status: "terbit" },
    { worksheetId: 12, workMode: "individu", status: "terbit" },
    { worksheetId: 13, workMode: "individu", status: "terbit" },
    { worksheetId: 14, workMode: "kelompok", status: "ditutup" },
    { worksheetId: null, workMode: "kelompok", status: "terbit" },
  ]);
  check("kelompok terbit → khusus kelompok", groupOnly.has(10));
  check("kelompok masih draf → bukan khusus kelompok", !groupOnly.has(11));
  check("dipakai kelompok + individu → bukan khusus kelompok", !groupOnly.has(12));
  check("individu saja → bukan khusus kelompok", !groupOnly.has(13));
  check("kelompok ditutup → khusus kelompok", groupOnly.has(14));

  const rows = [
    { id: 1, worksheetId: 10, groupId: 100 }, // attempt kelompok pada LKPD kelompok
    { id: 2, worksheetId: 10, groupId: null }, // individu: duplikat anggota / pengerjaan sendiri
    { id: 3, worksheetId: 13, groupId: null }, // individu pada LKPD individu
    { id: 4, worksheetId: 12, groupId: null }, // individu pada LKPD campuran
    { id: 5, worksheetId: 12, groupId: 120 }, // kelompok pada LKPD campuran
  ];
  const visible = filterGradingQueueRows(rows, groupOnly).map((row) => row.id);
  check("antrean LKPD kelompok: hanya kartu kelompok", JSON.stringify(visible) === JSON.stringify([1, 3, 4, 5]), JSON.stringify(visible));
  check("predikat per baris sejalan", isGradingQueueRowVisible(rows[0], groupOnly) && !isGradingQueueRowVisible(rows[1], groupOnly) && isGradingQueueRowVisible(rows[2], groupOnly));
}

// ---------------------------------------------------------------------------
console.log("Case 6: pengawatan route simpan per butir (statis)");
{
  check("endpoint PATCH per butir terdaftar", worksheetsRoute.includes('"/:id/attempts/:attemptId/items"'));
  check("memakai gradeWorksheetItemSchema", worksheetsRoute.includes('zValidator("json", gradeWorksheetItemSchema)'));
  check("kelengkapan dihitung dari skor tersimpan semua butir", worksheetsRoute.includes("computeGradingProgress(items.map((item) => item.id), scoresByItem)"));
  check("transisi status memakai aturan bersama", worksheetsRoute.includes("gradingStatusAfterItemSave(attempt.status, progress)"));
  check("lengkap → total diisi seperti simpan menyeluruh", worksheetsRoute.includes("totalScore: progress.totalScore!.toFixed(2)"));
  check("batas poin butir ditegakkan", worksheetsRoute.includes('input.score !== null && input.score > pointsByItem.get(input.itemId)!'));
  check("baris jawaban yang hilang dibuat (upsert)", worksheetsRoute.includes("await db.insert(worksheetAnswers).values({\n        attemptId,\n        worksheetItemId: input.itemId,"));
  check("skor null mengosongkan skor butir", worksheetsRoute.includes("const scoreValue = input.score === null ? null : input.score.toFixed(2);"));
}

// ---------------------------------------------------------------------------
console.log("Case 7: daftar + rincian membawa kemajuan; saringan di kedua daftar (statis)");
{
  check("daftar per-LKPD menyaring antrean kelompok", worksheetsRoute.includes("filterGradingQueueRows(") && worksheetsRoute.includes("groupOnlyWorksheetIds(assignmentRows)"));
  check("daftar gabungan menyaring antrean kelompok", gradingRoute.includes("filterGradingQueueRows(rawRows, groupOnlyWorksheetIds(assignmentRows))"));
  check("daftar per-LKPD membawa graded_count + total_items", worksheetsRoute.includes("graded_count: gradedByAttempt.get(row.id) ?? 0") && worksheetsRoute.includes("total_items: totalItems,"));
  check("daftar gabungan membawa graded_count + total_items", gradingRoute.includes("graded_count: gradedByAttempt.get(row.id) ?? 0") && gradingRoute.includes("total_items: totalItemsByWorksheet.get(row.worksheetId) ?? 0"));
  check("rincian attempt membawa graded_count + total_items", worksheetsRoute.includes("graded_count: answers.filter((answer) => answer.score !== null).length") && worksheetsRoute.includes("total_items: items.length,"));
  check("hitungan berskor memakai countGradedByAttempt", worksheetsRoute.includes("countGradedByAttempt(gradedRows)") && gradingRoute.includes("countGradedByAttempt(gradedRows)"));
}

// ---------------------------------------------------------------------------
console.log("Case 8: jalur lama tidak berubah (statis)");
{
  check("simpan menyeluruh tetap ada dengan gradeWorksheetSchema", worksheetsRoute.includes('zValidator("json", gradeWorksheetSchema)') && worksheetsRoute.includes('status: "dinilai",\n      totalScore: totalScore.toFixed(2),'));
  check("penyesuaian nilai anggota tidak disentuh", gradingRoute.includes('"/attempts/:attemptId/member-scores"') && gradingRoute.includes("worksheetAttemptMemberScores"));
  check("serializer murid tidak menerima penanda kemajuan guru", !muridRoute.includes("graded_count"));
}

// ---------------------------------------------------------------------------
console.log("Case 9: Jalur — tidak ada migrasi melampaui 0013 (Persetujuan Berbagi)");
{
  const migrationsDir = new URL("../../../../packages/db/migrations/", import.meta.url);
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  check("tidak ada berkas migrasi 0019+", !files.some((name) => /^0019|^002/.test(name)), files.join(","));
  const journal = JSON.parse(read("../../../../packages/db/migrations/meta/_journal.json"));
  check("jurnal 19 entri (idx terakhir 18, 0018 blok-interaktif)", journal.entries.length === 19 && journal.entries[journal.entries.length - 1].idx === 18);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
