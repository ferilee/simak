// Tests for "Nilai Saya" (v1.0.35): the student's own page listing every
// graded LKPD, newest first. Run with bun from apps/api:
//   bun src/lib/nilai-saya.test.mjs
//
// There is no test database in this repo's convention, so: the pure row
// rules (attempt choice mirroring the assignment detail, graded gate,
// effective/adjusted scores, graded-at resolution, sorting) are tested
// behaviorally, and the route wiring (own-data scoping, sasaran-siswa
// eligibility union, detail-identical resolution) is locked statically
// against the route source. Jalur A is locked too: no new migration.
import { readFileSync, readdirSync } from "node:fs";
import { buildStudentGradeRow, chooseGradeAttempt, isGradedAttempt, resolveGradedAt, sortGradeRows } from "./nilai-saya.ts";

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

const T = {
  earlier: new Date("2026-11-01T08:00:00.000Z"),
  mid: new Date("2026-11-02T08:00:00.000Z"),
  later: new Date("2026-11-03T08:00:00.000Z"),
};

function attempt(extra = {}) {
  return {
    id: 10,
    status: "dinilai",
    submittedAt: T.earlier,
    totalScore: "80.00",
    updatedAt: T.mid,
    ...extra,
  };
}

function row(extra = {}) {
  return buildStudentGradeRow({
    assignmentId: 5,
    assignmentTitle: "LKPD Bunga Tunggal",
    worksheetTitle: "LKPD ATP 2.1",
    subjectName: "Matematika",
    workMode: "individu",
    groupName: null,
    chosen: { attempt: attempt(), isGroup: false },
    override: null,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
console.log("Case 1: gerbang dinilai — hanya attempt dinilai bertotal yang lolos");
{
  check("dinilai + total → dinilai", isGradedAttempt(attempt()));
  check("terkumpul → belum", !isGradedAttempt(attempt({ status: "terkumpul" })));
  check("draf → belum", !isGradedAttempt(attempt({ status: "draf" })));
  check("dinilai tapi total null (penilaian cicilan) → belum", !isGradedAttempt(attempt({ totalScore: null })));
  check("tanpa attempt efektif → tidak ada baris", row({ chosen: null }) === null);
  check("attempt terkumpul → tidak ada baris", row({ chosen: { attempt: attempt({ status: "terkumpul" }), isGroup: false } }) === null);
}

// ---------------------------------------------------------------------------
console.log("Case 2: baris individu");
{
  const result = row();
  check("baris terbentuk", result !== null);
  check("score = total attempt sebagai angka", result?.score === 80);
  check("group_score null", result?.group_score === null);
  check("score_adjusted false", result?.score_adjusted === false);
  check("group_name null", result?.group_name === null);
  check("graded_at = updated_at attempt", result?.graded_at.getTime() === T.mid.getTime());
  check("identitas baris terbawa", result?.assignment_id === 5 && result?.worksheet_title === "LKPD ATP 2.1" && result?.subject_name === "Matematika" && result?.work_mode === "individu");
}

// ---------------------------------------------------------------------------
console.log("Case 3: pemilihan attempt efektif meniru detail penugasan");
{
  const individual = attempt({ id: 10 });
  const group = attempt({ id: 20 });
  check("hanya individu → individu", chooseGradeAttempt(individual, null)?.attempt.id === 10 && chooseGradeAttempt(individual, null)?.isGroup === false);
  check("hanya kelompok → kelompok", chooseGradeAttempt(null, group)?.attempt.id === 20 && chooseGradeAttempt(null, group)?.isGroup === true);
  check("keduanya kosong → null", chooseGradeAttempt(null, null) === null);
  const groupDraft = attempt({ id: 20, status: "draf", totalScore: null });
  check("individu dinilai vs kelompok draf → individu menang", chooseGradeAttempt(individual, groupDraft)?.attempt.id === 10);
  const individualSubmitted = attempt({ id: 10, status: "terkumpul", totalScore: null });
  check("individu terkumpul vs kelompok dinilai → kelompok menang", chooseGradeAttempt(individualSubmitted, group)?.attempt.id === 20);
  check("seri dinilai vs dinilai → kelompok menang", chooseGradeAttempt(individual, group)?.attempt.id === 20 && chooseGradeAttempt(individual, group)?.isGroup === true);
}

// ---------------------------------------------------------------------------
console.log("Case 4: baris kelompok tanpa penyesuaian");
{
  const result = row({
    workMode: "kelompok",
    groupName: "Kelompok 1",
    chosen: { attempt: attempt({ id: 20, totalScore: "75.50" }), isGroup: true },
  });
  check("score = total kelompok", result?.score === 75.5);
  check("group_score = total kelompok", result?.group_score === 75.5);
  check("score_adjusted false", result?.score_adjusted === false);
  check("group_name terbawa", result?.group_name === "Kelompok 1");
  check("graded_at = updated_at attempt", result?.graded_at.getTime() === T.mid.getTime());
}

// ---------------------------------------------------------------------------
console.log("Case 5: baris kelompok dengan penyesuaian guru");
{
  const result = row({
    workMode: "kelompok",
    groupName: "Kelompok 1",
    chosen: { attempt: attempt({ id: 20, totalScore: "75.50" }), isGroup: true },
    override: { score: "60.00", updatedAt: T.later },
  });
  check("score = nilai penyesuaian (efektif)", result?.score === 60);
  check("group_score tetap total kelompok", result?.group_score === 75.5);
  check("score_adjusted true", result?.score_adjusted === true);
  check("graded_at bergeser ke updated_at penyesuaian yang lebih baru", result?.graded_at.getTime() === T.later.getTime());

  const olderOverride = row({
    workMode: "kelompok",
    groupName: "Kelompok 1",
    chosen: { attempt: attempt({ id: 20, totalScore: "75.50" }), isGroup: true },
    override: { score: "60.00", updatedAt: T.earlier },
  });
  check("penyesuaian lebih lama → graded_at tetap updated_at attempt", olderOverride?.graded_at.getTime() === T.mid.getTime());
  check("resolveGradedAt memilih yang lebih baru", resolveGradedAt(T.mid, T.later).getTime() === T.later.getTime() && resolveGradedAt(T.mid, T.earlier).getTime() === T.mid.getTime() && resolveGradedAt(T.mid, null).getTime() === T.mid.getTime());
}

// ---------------------------------------------------------------------------
console.log("Case 6: mode kelompok tetapi attempt efektifnya individu (keadaan lama)");
{
  const result = row({
    workMode: "kelompok",
    groupName: "Kelompok 1",
    chosen: { attempt: attempt({ id: 10 }), isGroup: false },
    override: { score: "60.00", updatedAt: T.later },
  });
  check("baris bergaya individu: score = total attempt individu", result?.score === 80);
  check("group_score null dan tanpa penyesuaian (penyesuaian attempt kelompok tidak bocor)", result?.group_score === null && result?.score_adjusted === false);
  check("group_name null seperti label individu di detail", result?.group_name === null);
}

// ---------------------------------------------------------------------------
console.log("Case 7: urutan terbaru lebih dulu");
{
  const rows = [
    { ...row(), assignment_id: 1, graded_at: T.earlier },
    { ...row(), assignment_id: 2, graded_at: T.later },
    { ...row(), assignment_id: 3, graded_at: T.mid },
  ];
  const sorted = sortGradeRows(rows);
  check("urut graded_at menurun", sorted.map((entry) => entry.assignment_id).join(",") === "2,3,1");
  check("masukan tidak diubah", rows.map((entry) => entry.assignment_id).join(",") === "1,2,3");
}

// ---------------------------------------------------------------------------
console.log("Case 8: kabel route — kepemilikan data + kelayakan sasaran");
{
  const source = read("../routes/murid.ts");
  const nilaiStart = source.indexOf('muridRoutes.get("/nilai"');
  const nilaiEnd = source.indexOf('muridRoutes.get("/assignments/:id"', nilaiStart);
  check("endpoint GET /nilai terdaftar", nilaiStart >= 0);
  const handler = source.slice(nilaiStart, nilaiEnd);
  check("sasaran via kelas tujuan (assignmentClasses)", handler.includes("assignmentClasses"));
  check("sasaran langsung siswa tertentu (assignmentStudents)", handler.includes("assignmentStudents"));
  check("hanya penugasan terbit", handler.includes('eq(assignments.status, "terbit")'));
  check("attempt individu terlingkup murid yang meminta", handler.includes("eq(worksheetAttempts.studentId, user.userId)"));
  check("kelompok dimuat untuk murid yang meminta", handler.includes("loadStudentGroup(assignment.id, user.userId)"));
  check("attempt kelompok terlingkup kelompok murid itu", handler.includes("eq(worksheetAttempts.groupId, group.id)"));
  check("penyesuaian nilai terlingkup murid yang meminta", handler.includes("eq(worksheetAttemptMemberScores.studentId, user.userId)"));
  check("pemilihan attempt memakai helper bersama detail", handler.includes("chooseGradeAttempt") && handler.includes("buildStudentGradeRow"));
  check("hasil diurutkan terbaru lebih dulu", handler.includes("sortGradeRows"));
  check("bentuk respons { ok, data: { grades } }", handler.includes("data: { grades:"));
}

// ---------------------------------------------------------------------------
console.log("Case 9: Jalur — tidak ada migrasi melampaui 0013 (Persetujuan Berbagi)");
{
  const files = readdirSync(new URL("../../../../packages/db/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
  check("tidak ada berkas migrasi 0018+", !files.some((name) => /^001[8-9]|^002/.test(name)), files.join(","));
  const journal = JSON.parse(read("../../../../packages/db/migrations/meta/_journal.json"));
  check("jurnal 18 entri (idx terakhir 17, 0017 avatar-murid)", journal.entries.length === 18 && journal.entries[journal.entries.length - 1].idx === 17);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
