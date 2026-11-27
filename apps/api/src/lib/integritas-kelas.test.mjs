// Tests for "Saringan Kelas Indikasi Integritas" (calon v1.0.89): panel
// Indikasi integritas di Langkah Hasil kini bisa disaring per kelas.
// Run with bun from apps/api:
//   bun src/lib/integritas-kelas.test.mjs
//
// There is no test database in this repo's convention, so the route
// wiring is locked statically against the route source: GET
// /integrity/alerts menempelkan class_id/class_name pada setiap baris
// memakai aturan lib/student-class yang sama seperti panel penilaian
// (keanggotaan kelas guru + preferensi mapel penugasan), sementara
// agregasi sinyal, ambang risiko, dan batas 500 kejadian TIDAK berubah.
// Jalur tanpa migrasi juga dikunci.
import { readFileSync, readdirSync } from "node:fs";

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

// ---------------------------------------------------------------------------
console.log("Case 1: kabel route — kelas ditempelkan per baris alert");
{
  const source = read("../routes/integrity.ts");
  const alertsStart = source.indexOf('integrityRoutes.get("/alerts"');
  check("endpoint GET /alerts terdaftar", alertsStart >= 0);
  const handler = source.slice(alertsStart);
  check(
    "memakai ulang pemuat keanggotaan + penyelesai kelas lib/student-class",
    source.includes('import { loadTeacherClassMemberships, resolveStudentClass } from "../lib/student-class"')
      && handler.includes("loadTeacherClassMemberships(user.userId)"),
  );
  check(
    "mapel pembanding dari modul LKPD penugasan (loadAssignmentSubject)",
    source.includes("loadAssignmentSubject") && handler.includes("loadAssignmentSubject(ref)"),
  );
  check(
    "kueri memuat moduleId/worksheetId penugasan untuk penentuan mapel",
    handler.includes("assignment_module_id: assignments.moduleId") && handler.includes("assignment_worksheet_id: assignments.worksheetId"),
  );
  check(
    "kelas diselesaikan per (murid, mapel penugasan asal sinyal)",
    handler.includes("resolveStudentClass(") && handler.includes("membershipsByStudent.get(alert.student_id)") && handler.includes("subjectByAssignment.get(alert.assignment_id)"),
  );
  check(
    "baris respons membawa class_id/class_name, tak terlarutkan menjadi null",
    handler.includes("class_id: studentClass?.id ?? null") && handler.includes("class_name: studentClass?.name ?? null"),
  );
}

// ---------------------------------------------------------------------------
console.log("Case 2: agregasi sinyal, ambang risiko, dan batas tidak berubah");
{
  const source = read("../routes/integrity.ts");
  const handler = source.slice(source.indexOf('integrityRoutes.get("/alerts"'));
  check("pengelompokan tetap per (assignment_id, student_id)", handler.includes("`${row.assignment_id}:${row.student_id}`"));
  check("ambang peringatan tetap total >= 6 atau clipboard >= 3", handler.includes('total >= 6 || clipboard >= 3 ? "peringatan"'));
  check("ambang perlu_ditinjau tetap total >= 3", handler.includes('total >= 3 ? "perlu_ditinjau" : "info"'));
  check("batas kueri tetap 500 kejadian", handler.includes(".limit(500)"));
  check("cakupan tetap penugasan milik guru yang meminta", handler.includes("eq(assignments.teacherId, user.userId)"));
}

// ---------------------------------------------------------------------------
console.log("Case 3: Jalur — tidak ada migrasi baru");
{
  const files = readdirSync(new URL("../../../../packages/db/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
  check("tidak ada berkas migrasi 0025+", !files.some((name) => /^002[5-9]/.test(name)), files.join(","));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
