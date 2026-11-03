// Tests for per-answer authorship (LKPD Kelompok Tahap 3 mini): every murid
// answer save stamps worksheet_answers.last_edited_by, and the teacher
// grading detail exposes it as last_editor_name.
// Run with bun from apps/api:  bun src/lib/answers-authorship.test.mjs
//
// There is no test database in this repo's convention (see groups.test.mjs),
// so the write/read paths are locked statically against the route sources,
// the drizzle schema, and the 0010 migration SQL.
import { readFileSync } from "node:fs";

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

const schema = readFileSync(new URL("../../../../packages/db/src/schema/worksheet-attempts.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../../packages/db/migrations/0010_lkpd_kelompok_3.sql", import.meta.url), "utf8");
const murid = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
const worksheets = readFileSync(new URL("../routes/worksheets.ts", import.meta.url), "utf8");

console.log("Case 1: skema + migrasi 0010");
{
  const answersTable = schema.slice(schema.indexOf("export const worksheetAnswers"));
  check("worksheetAnswers mempunyai kolom lastEditedBy", answersTable.includes('lastEditedBy: bigint("last_edited_by"'));
  check("migrasi 0010 menambahkan kolom last_edited_by", migration.includes("ALTER TABLE `worksheet_answers` ADD `last_edited_by` bigint;"));
  check("migrasi 0010 menambahkan FK ke users", migration.includes("`worksheet_answers_last_edited_by_users_id_fk` FOREIGN KEY (`last_edited_by`) REFERENCES `users`(`id`)"));
}

console.log("Case 2: simpan jawaban murid mencatat penulis (buat + ubah)");
{
  const answersRoute = murid.slice(murid.indexOf('muridRoutes.put("/worksheets/:id/answers"'), murid.indexOf('muridRoutes.post("/worksheets/:id/submit"'));
  check("rute PUT answers ditemukan", answersRoute.length > 0);
  check(
    "jalur ubah (update) mengisi lastEditedBy penulis saat ini",
    answersRoute.includes("await db.update(worksheetAnswers).set({ answerText: answer.answerText, attachmentKey: answer.attachmentKey, lastEditedBy: user.userId })"),
  );
  check(
    "jalur buat (insert) mengisi lastEditedBy penulis saat ini",
    answersRoute.includes("attachmentKey: answer.attachmentKey,\n        lastEditedBy: user.userId,"),
  );
  // Jawaban foto tidak mempunyai rute simpan sendiri: kuncinya (attachmentKey)
  // disimpan lewat PUT yang sama, jadi cap penulis di atas mencakupnya.
  check(
    "jawaban foto berbagi jalur simpan yang sama (attachmentKey ikut ter-update)",
    answersRoute.includes("attachmentKey: answer.attachmentKey, lastEditedBy: user.userId"),
  );
}

console.log("Case 3: detail penilaian guru membuka last_editor_name");
{
  const detailRoute = worksheets.slice(worksheets.indexOf('worksheetRoutes.get("/:id/attempts/:attemptId"'), worksheets.indexOf('worksheetRoutes.patch(\n  "/:id/attempts/:attemptId"'));
  check("rute detail attempt ditemukan", detailRoute.length > 0);
  check("nama editor dicari dari tabel users", detailRoute.includes("editorNameById") && detailRoute.includes(".from(users)"));
  check(
    "butir membawa last_editor_name (null bila belum pernah tercatat)",
    detailRoute.includes("last_editor_name: answer?.lastEditedBy ? (editorNameById.get(answer.lastEditedBy) ?? null) : null"),
  );
  check("butir membawa answer_updated_at untuk waktu ubah terakhir", detailRoute.includes("answer_updated_at: answer?.updatedAt ?? null"));
}

console.log("Case 4: penilaian guru TIDAK menimpa jejak penulis");
{
  const gradeRoute = worksheets.slice(worksheets.indexOf('worksheetRoutes.patch(\n  "/:id/attempts/:attemptId"'), worksheets.indexOf('worksheetRoutes.patch(\n  "/:id",'));
  check("rute nilai ditemukan", gradeRoute.length > 0);
  check("simpan nilai guru tidak menyentuh lastEditedBy", !gradeRoute.includes("lastEditedBy"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
