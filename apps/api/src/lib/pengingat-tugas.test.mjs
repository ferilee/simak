// Tests for pengingat tugas murid (sisi API): dua field checklist pada
// /murid/today dan field material pada GET attempt LKPD.
// Run with bun from apps/api:  bun src/lib/pengingat-tugas.test.mjs
//
// Yang dikunci di sini:
//  - /today menghitung ketuntasan materi + exit ticket dengan SATU
//    query himpunan per sinyal untuk seluruh daftar penugasan (bukan
//    per penugasan), mengikuti pola gagal-aman beranda (try/catch →
//    himpunan kosong), dan mengirim keduanya sebagai field
//    material_completed + exit_ticket_submitted pada serializer daftar.
//  - Predikat tuntasnya sama dengan GET /murid/modules/:id
//    (baca_materi_tuntas per murid per modul); predikat exit ticket
//    sama dengan halaman detail penugasan (baris exit_tickets).
//  - GET attempt membawa material { module_id, completed } | null yang
//    dibangun dari konteks penugasan attempt (parameter ATAU hasil
//    pemulihan — context.assignmentId yang sama dengan assignment_id
//    pada respons); null tanpa konteks / tanpa modul / query gagal.
//  - Paket ini TANPA migrasi: jurnal tetap 18 entri berakhir di 0017.
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

const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");

// Potong wilayah handler /today dan GET attempt agar kunci tidak
// tertukar dengan pemakaian predikat yang sama di handler lain.
const todayStart = muridRoute.indexOf('muridRoutes.get("/today"');
const todayEnd = muridRoute.indexOf('muridRoutes.post("/welcome/seen"');
const today = muridRoute.slice(todayStart, todayEnd);
const attemptStart = muridRoute.indexOf('muridRoutes.get("/worksheets/:id/attempt"');
const attemptEnd = muridRoute.indexOf('muridRoutes.post("/worksheets/:id/presence"');
const attempt = muridRoute.slice(attemptStart, attemptEnd);

console.log("Kasus A: /today — query himpunan checklist");
check("wilayah /today ditemukan", todayStart >= 0 && todayEnd > todayStart);
check(
  "himpunan modul penugasan dibangun dari moduleId non-null daftar",
  today.includes("assignmentModuleIds") && today.includes("assignment.moduleId === null ? [] : [assignment.moduleId]"),
);
check(
  "ketuntasan materi: satu query activity_logs baca_materi_tuntas dengan inArray moduleId",
  today.includes('eq(activityLogs.event, "baca_materi_tuntas"), inArray(activityLogs.moduleId, assignmentModuleIds)'),
);
check(
  "ketuntasan materi terikat murid yang meminta",
  today.includes("eq(activityLogs.studentId, user.userId), eq(activityLogs.event, \"baca_materi_tuntas\")"),
);
check(
  "exit ticket: satu query exit_tickets dengan inArray assignmentId daftar",
  today.includes("inArray(exitTickets.assignmentId, uniqueAssignments.map((assignment) => assignment.id))"),
);
check(
  "exit ticket terikat murid yang meminta",
  today.includes("eq(exitTickets.studentId, user.userId), inArray(exitTickets.assignmentId"),
);
check(
  "kedua himpunan berawal kosong (gagal-aman)",
  today.includes("let completedMaterialModuleIds = new Set<number>();") &&
    today.includes("let submittedExitTicketAssignmentIds = new Set<number>();"),
);
check(
  "kedua query himpunan dibungkus try/catch (beranda tidak pernah gagal karenanya)",
  (today.match(/try \{/g) ?? []).length >= 4 && today.includes("langkah materi tampil sebagai belum tuntas") && today.includes("langkah exit ticket tampil sebagai belum diisi"),
);

console.log("Kasus B: /today — field pada serializer daftar");
check(
  "material_completed: false tanpa modul, selain itu dari himpunan tuntas",
  today.includes("material_completed: assignment.moduleId !== null && completedMaterialModuleIds.has(assignment.moduleId)"),
);
check(
  "exit_ticket_submitted: dari himpunan exit ticket",
  today.includes("exit_ticket_submitted: submittedExitTicketAssignmentIds.has(assignment.id)"),
);
check(
  "field ditambahkan pada map daftar /today (serializer bersama tidak berubah bentuk dasarnya)",
  today.includes("...serializeAssignmentForStudent("),
);

console.log("Kasus C: GET attempt — field material dari konteks penugasan");
check("wilayah GET attempt ditemukan", attemptStart >= 0 && attemptEnd > attemptStart);
check(
  "material berawal null",
  attempt.includes("let material: { module_id: number; completed: boolean } | null = null;"),
);
check(
  "konteks yang dipakai adalah context.assignmentId hasil resolusi (parameter atau pulihan)",
  attempt.includes("if (context.assignmentId !== null) {") && attempt.includes("eq(assignments.id, context.assignmentId)"),
);
check(
  "modul diambil dari baris penugasan konteks",
  attempt.includes(".select({ moduleId: assignments.moduleId })"),
);
check(
  "penugasan tanpa modul → material tetap null",
  attempt.includes("if (contextAssignment?.moduleId != null) {"),
);
check(
  "ketuntasan memakai predikat baca_materi_tuntas murid untuk modul itu",
  attempt.includes('eq(activityLogs.event, "baca_materi_tuntas")') && attempt.includes("eq(activityLogs.moduleId, moduleId)"),
);
check(
  "material dibangun sebagai { module_id, completed }",
  attempt.includes("material = { module_id: moduleId, completed: Boolean(completedRow) };"),
);
check(
  "kegagalan query mengembalikan material ke null (attempt tidak pernah gagal)",
  attempt.includes("} catch {\n      material = null;\n    }"),
);
check(
  "material terkirim pada respons attempt",
  attempt.includes("material,\n      status: attempt.status,"),
);
check(
  "respons ungrouped tidak berubah (tanpa attempt, tanpa material)",
  attempt.includes('data: { ungrouped: true, assignment_id: context.assignmentId, status: null, submitted_at: null, answers: [], group: null }'),
);

console.log("Kasus D: paket tanpa migrasi");
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
check(
  "jurnal migrasi tetap 18 entri dan berakhir di 0017_avatar_murid",
  journal.entries.length === 18 && journal.entries[journal.entries.length - 1].tag === "0017_avatar_murid",
  `entries=${journal.entries.length}, last=${journal.entries[journal.entries.length - 1]?.tag}`,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
