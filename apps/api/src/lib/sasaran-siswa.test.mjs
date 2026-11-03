// Tests for "Sasaran Siswa Tertentu" (v1.0.32): an assignment may target
// specific students (assignment_students) instead of whole classes, for
// remedial/enrichment. Individual work mode only.
// Run with bun from apps/api:  bun src/lib/sasaran-siswa.test.mjs
//
// There is no test database in this repo's convention, so: the pure target
// rule + shared zod schemas + the report's class-resolution rule are tested
// behaviorally, and the route wiring (eligibility helper at every murid
// surface, validation, guards, serializer) is locked statically against
// the route sources, the drizzle schema, and the 0011 migration SQL.
// Piece 0 (the 0009 constraint-name repair) is locked here too.
import { readFileSync, readdirSync } from "node:fs";
import { assignmentTargetRuleError } from "./assignment-target.ts";
import { resolveStudentClass } from "./student-class.ts";
import { createAssignmentSchema, updateAssignmentSchema } from "../../../../packages/shared/src/schemas.ts";

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
const migrationsDir = new URL("../../../../packages/db/migrations/", import.meta.url);

// ---------------------------------------------------------------------------
console.log("Case 1: piece 0 — nama constraint 0009 diperbaiki + semua identifier <= 64");
{
  const sql0009 = read("../../../../packages/db/migrations/0009_lkpd_kelompok_2.sql");
  const snap0009 = read("../../../../packages/db/migrations/meta/0009_snapshot.json");
  const snap0010 = read("../../../../packages/db/migrations/meta/0010_snapshot.json");
  const attemptsSchema = read("../../../../packages/db/src/schema/worksheet-attempts.ts");
  check("0009 memakai nama pendek wams_", sql0009.includes("`wams_attempt_id_worksheet_attempts_id_fk`"));
  check("nama 67 karakter hilang dari 0009 + snapshot", ![sql0009, snap0009, snap0010].some((text) => text.includes("worksheet_attempt_member_scores_attempt_id_worksheet_attempts_id_fk")));
  check("snapshot 0009/0010 memakai nama pendek", snap0009.includes("wams_attempt_id_worksheet_attempts_id_fk") && snap0010.includes("wams_attempt_id_worksheet_attempts_id_fk"));
  check("skema mematok nama FK pendek secara eksplisit", attemptsSchema.includes('name: "wams_attempt_id_worksheet_attempts_id_fk"'));

  let longest = 0;
  let offender = "";
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(new URL(file, migrationsDir), "utf8");
    for (const match of sql.matchAll(/`([^`]+)`/g)) {
      if (match[1].length > longest) { longest = match[1].length; offender = `${file}: ${match[1]}`; }
    }
  }
  check(`identifier terpanjang di semua migrasi <= 64 (terpanjang ${longest})`, longest <= 64, offender);
}

// ---------------------------------------------------------------------------
console.log("Case 2: skema drizzle + migrasi 0011");
{
  const schema = read("../../../../packages/db/src/schema/assignments.ts");
  const migration = read("../../../../packages/db/migrations/0011_sasaran_siswa.sql");
  const journal = JSON.parse(read("../../../../packages/db/migrations/meta/_journal.json"));
  check("assignments.targetType enum kelas/siswa default kelas", schema.includes('targetType: mysqlEnum("target_type", ["kelas", "siswa"]).notNull().default("kelas")'));
  check("tabel assignmentStudents terdefinisi", schema.includes('export const assignmentStudents = mysqlTable(\n  "assignment_students"'));
  check("unique (assignment_id, student_id)", schema.includes('uniqueIndex("assignment_students_pair_unique").on(t.assignmentId, t.studentId)'));
  check("index student_id", schema.includes('index("assignment_students_student_idx").on(t.studentId)'));
  check("migrasi 0011 membuat tabel", migration.includes("CREATE TABLE `assignment_students`"));
  check("migrasi 0011 menambah target_type", migration.includes("ALTER TABLE `assignments` ADD `target_type` enum('kelas','siswa') DEFAULT 'kelas' NOT NULL;"));
  check("migrasi 0011 FK assignment cascade", migration.includes("`assignment_students_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade"));
  check("migrasi 0011 FK student ke users", migration.includes("`assignment_students_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`)"));
  check("migrasi 0011 index student", migration.includes("CREATE INDEX `assignment_students_student_idx` ON `assignment_students` (`student_id`);"));
  const entry = journal.entries.find((e) => e.idx === 11);
  check("jurnal idx 11 = 0011_sasaran_siswa", entry?.tag === "0011_sasaran_siswa");
}

// ---------------------------------------------------------------------------
console.log("Case 3: aturan kombinasi sasaran (fungsi murni)");
{
  check("kelas + >=1 kelas → sah", assignmentTargetRuleError({ targetType: "kelas", workMode: "kelompok", classIds: [1] }) === null);
  check("kelas tanpa kelas → pesan kelas", assignmentTargetRuleError({ targetType: "kelas", workMode: "individu", classIds: [] }) === "Pilih minimal satu kelas tujuan.");
  check("siswa + individu + >=1 murid → sah", assignmentTargetRuleError({ targetType: "siswa", workMode: "individu", studentIds: [7] }) === null);
  check("siswa tanpa murid → pesan murid", assignmentTargetRuleError({ targetType: "siswa", workMode: "individu", studentIds: [] }) === "Pilih minimal satu murid sasaran.");
  check("siswa + kelompok → pesan mode individu", assignmentTargetRuleError({ targetType: "siswa", workMode: "kelompok", studentIds: [7] }) === "Penugasan untuk siswa tertentu hanya tersedia untuk mode individu.");
}

// ---------------------------------------------------------------------------
console.log("Case 4: skema zod bersama — validasi buat/ubah");
{
  const base = { title: "Remedial", moduleId: 1, opensAt: "2026-11-04T01:00:00.000Z", dueAt: "2026-11-05T01:00:00.000Z" };
  check("kelas valid", createAssignmentSchema.safeParse({ ...base, classIds: [10] }).success === true);
  check("kelas tanpa classIds ditolak", createAssignmentSchema.safeParse({ ...base }).success === false);
  check("siswa valid", createAssignmentSchema.safeParse({ ...base, targetType: "siswa", studentIds: [7, 8] }).success === true);
  check("siswa dengan studentIds kosong ditolak", createAssignmentSchema.safeParse({ ...base, targetType: "siswa", studentIds: [] }).success === false);
  check("siswa tanpa studentIds ditolak", createAssignmentSchema.safeParse({ ...base, targetType: "siswa" }).success === false);
  const siswaKelompok = createAssignmentSchema.safeParse({ ...base, targetType: "siswa", workMode: "kelompok", studentIds: [7] });
  check("siswa + kelompok ditolak", siswaKelompok.success === false);
  check("pesan mode individu persis", !siswaKelompok.success && JSON.stringify(siswaKelompok.error.issues).includes("Penugasan untuk siswa tertentu hanya tersedia untuk mode individu."));
  check("studentIds duplikat ditolak", createAssignmentSchema.safeParse({ ...base, targetType: "siswa", studentIds: [7, 7] }).success === false);
  check("PATCH siswa+kelompok dalam satu payload ditolak", updateAssignmentSchema.safeParse({ targetType: "siswa", workMode: "kelompok" }).success === false);
  check("PATCH siswa dengan studentIds kosong ditolak", updateAssignmentSchema.safeParse({ targetType: "siswa", studentIds: [] }).success === false);
  check("PATCH biasa (judul saja) tetap sah", updateAssignmentSchema.safeParse({ title: "Baru" }).success === true);
}

// ---------------------------------------------------------------------------
console.log("Case 5: route penugasan guru — validasi, serializer, pagar sasaran");
{
  const routes = read("../routes/assignments.ts");
  check("POST menegakkan aturan kombinasi", routes.includes("assignmentTargetRuleError({\n    targetType: input.targetType,"));
  check("POST memvalidasi murid sasaran milik guru", routes.includes("validateTeacherStudents(user.userId, input.studentIds ?? [])"));
  check("pesan murid asing persis", routes.includes("Ada murid sasaran yang bukan anggota kelas yang Anda kelola."));
  check("POST menyimpan targetType", routes.includes("targetType: input.targetType,"));
  check("POST mengisi assignmentStudents untuk sasaran siswa", routes.includes("await tx.insert(assignmentStudents).values((input.studentIds ?? []).map((studentId) => ({ assignmentId, studentId })))"));
  check("serializer memuat target_type", routes.includes("target_type: assignment.targetType,"));
  check("serializer memuat students", routes.includes("students: linkedStudents,"));
  check("PATCH: kunci ditutup mencakup targetType + studentIds", routes.includes('"classIds", "targetType", "studentIds"]'));
  check("PATCH: perubahan sasaran terdeteksi", routes.includes("const studentsChanged = input.studentIds !== undefined"));
  check("PATCH: pesan kunci sasaran persis", routes.includes("Sasaran penugasan tidak dapat diubah karena sudah ada murid yang mengerjakan penugasan ini."));
  check("PATCH: aturan kombinasi atas keadaan efektif", routes.includes("const effectiveRuleError = assignmentTargetRuleError({"));
  check("PATCH: daftar jenis yang ditinggalkan dikosongkan", routes.includes("if (targetTypeChanged) {\n        await tx.delete(assignmentStudents)") && routes.includes("if (targetTypeChanged) {\n        await tx.delete(assignmentClasses)"));
  check("predikat aktivitas menyertakan murid sasaran langsung", routes.includes("directRows") && routes.includes("assignmentHasStudentActivity"));
  check("endpoint kelompok tetap menolak non-kelompok", routes.includes('if (assignment.workMode !== "kelompok") {\n    return c.json({ ok: false, message: "Penugasan ini bukan penugasan kelompok." }, 400);'));
}

// ---------------------------------------------------------------------------
console.log("Case 6: kelayakan murid — helper terpusat di semua permukaan murid");
{
  const lib = read("./assignment-target.ts");
  const murid = read("../routes/murid.ts");
  const activity = read("../routes/activity.ts");
  const integrity = read("../routes/integrity.ts");
  check("helper memeriksa sasaran langsung", lib.includes("eq(assignmentStudents.studentId, studentId)"));
  check("helper memeriksa keanggotaan kelas tak-terarsip", lib.includes("eq(classes.isArchived, false)") && lib.includes("assignmentClasses.classId"));
  const accessible = murid.slice(murid.indexOf("async function accessibleAssignment"), murid.indexOf("function assignmentProgress"));
  check("accessibleAssignment memakai helper kelayakan", accessible.includes("studentIsAssignmentTarget(assignmentId, studentId)"));
  check("accessibleAssignment tidak lagi bergabung ke kelas secara langsung", !accessible.includes("innerJoin(assignmentClasses"));
  check("beranda /today menyertakan penugasan sasaran langsung", murid.includes("innerJoin(assignmentStudents, eq(assignmentStudents.assignmentId, assignments.id))") && murid.includes("eq(assignmentStudents.studentId, user.userId)"));
  check("pencatatan aktivitas memakai helper kelayakan", activity.includes("studentIsAssignmentTarget(assignment.id, user.userId)"));
  check("sinyal integritas memakai helper kelayakan", integrity.includes("studentIsAssignmentTarget(assignment.id, user.userId)"));
}

// ---------------------------------------------------------------------------
console.log("Case 7: laporan — murid sasaran laporan untuk penugasan siswa");
{
  const reports = read("../routes/reports.ts");
  const branch = reports.slice(reports.indexOf("async function getTargetStudents"), reports.indexOf("async function loadSessionReportData"));
  check("getTargetStudents bercabang pada targetType siswa", branch.includes('assignment.targetType === "siswa"'));
  check("cabang siswa membaca assignment_students", branch.includes(".from(assignmentStudents)"));
  check("cabang siswa memakai aturan kelas student-class", branch.includes("resolveStudentClass(membershipsByStudent.get(row.id) ?? [], subject)"));
  check("kelas tak teratasi → classId 0 / className kosong", branch.includes('classId: resolved?.id ?? 0, className: resolved?.name ?? ""'));
  check("cabang kelas lama utuh", branch.includes(".from(assignmentClasses)") && branch.includes("eq(classes.isArchived, false)"));
  check("kedua pemanggil memakai objek penugasan", reports.includes("getTargetStudents(assignment)") && reports.includes("getTargetStudents(importAssignment)"));

  // Skenario perilaku aturan resolusi kelas yang dipakai cabang siswa:
  // dua murid sasaran dari kelas berbeda + satu murid tanpa keanggotaan.
  const membershipsA = [
    { studentId: 1, classId: 9, className: "KKA A", classSubject: "KKA" },
    { studentId: 1, classId: 5, className: "XI DPIB", classSubject: "Matematika" },
  ];
  const membershipsB = [{ studentId: 2, classId: 3, className: "X TKJ A", classSubject: "Matematika" }];
  check("murid A teratasi ke kelas mapel yang cocok", resolveStudentClass(membershipsA, "Matematika")?.name === "XI DPIB");
  check("murid B teratasi ke kelasnya", resolveStudentClass(membershipsB, "Matematika")?.name === "X TKJ A");
  check("murid tanpa keanggotaan → null (laporan: 0/\"\")", resolveStudentClass([], "Matematika") === null);
}

// ---------------------------------------------------------------------------
console.log("Case 8: panel penilaian per penugasan + daftar kelas beranggota");
{
  const grading = read("../routes/grading.ts");
  check("penilaian per penugasan bercabang sasaran siswa", grading.includes('assignment.targetType === "siswa"') && grading.includes(".from(assignmentStudents)"));
  const classes = read("../routes/classes.ts");
  check("GET /classes menyertakan anggota per kelas", classes.includes("members: membersByClass.get(kelas.id) ?? []"));
}

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
