import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { resolveStudentClass, type ClassMembership } from "./student-class";

// Sasaran penugasan "siswa tertentu" (v1.0.32): penugasan dapat ditujukan
// ke murid tertentu (assignment_students) alih-alih ke seluruh kelas —
// untuk remedial/pengayaan. Modul ini adalah satu-satunya tempat aturan
// kelayakan sasaran didefinisikan; semua permukaan murid yang sebelumnya
// memeriksa keanggotaan kelas tujuan kini memeriksa lewat helper di sini.
//
// Aturan kombinasi (fungsi murni, ditegakkan route buat/ubah):
// - sasaran "siswa" wajib mode individu dan minimal satu murid;
// - sasaran "kelas" wajib minimal satu kelas tujuan.

const { assignmentClasses, assignmentStudents, assignments, classMembers, classes, modules, users, worksheets } = schema;

export type AssignmentTargetType = "kelas" | "siswa";
export type AssignmentWorkMode = "individu" | "kelompok";

export function assignmentTargetRuleError(input: {
  targetType: AssignmentTargetType;
  workMode: AssignmentWorkMode;
  classIds?: readonly number[];
  studentIds?: readonly number[];
}): string | null {
  if (input.targetType === "siswa") {
    if (input.workMode !== "individu") {
      return "Penugasan untuk siswa tertentu hanya tersedia untuk mode individu.";
    }
    if (!input.studentIds || input.studentIds.length === 0) {
      return "Pilih minimal satu murid sasaran.";
    }
    return null;
  }
  if (!input.classIds || input.classIds.length === 0) {
    return "Pilih minimal satu kelas tujuan.";
  }
  return null;
}

/**
 * Apakah murid ini sasaran penugasan tersebut? Benar bila ia anggota salah
 * satu kelas tujuan (kelas tidak diarsipkan) ATAU tercatat langsung di
 * assignment_students. Untuk penugasan "kelas" baris assignment_students
 * tidak pernah ada, jadi perilakunya identik dengan pemeriksaan lama.
 */
export async function studentIsAssignmentTarget(assignmentId: number, studentId: number): Promise<boolean> {
  const [direct] = await db
    .select({ id: assignmentStudents.id })
    .from(assignmentStudents)
    .where(and(eq(assignmentStudents.assignmentId, assignmentId), eq(assignmentStudents.studentId, studentId)))
    .limit(1);
  if (direct) return true;
  const [viaClass] = await db
    .select({ id: classMembers.id })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .where(and(
      eq(assignmentClasses.assignmentId, assignmentId),
      eq(classMembers.studentId, studentId),
      eq(classes.isArchived, false),
    ))
    .limit(1);
  return Boolean(viaClass);
}

// ---------------------------------------------------------------------------
// Keterlihatan materi (modul) bagi murid — aturan berbasis penugasan
// (v1.0.36). Sebuah modul terbit hanya terlihat oleh murid bila modul itu
// tertaut (assignments.moduleId) dari penugasan yang menjadi sasarannya —
// lewat kelas tujuan yang tidak diarsipkan ATAU catatan sasaran langsung —
// dan penugasan itu berstatus "terbit" atau "ditutup" (materi tetap bisa
// dibaca sesudah tugas ditutup; penugasan draf tidak memberi akses apa
// pun). Waktu buka penugasan (opensAt) tidak memengaruhi keterlihatan
// materi. Modul terbit tanpa penugasan yang memenuhi syarat tidak terlihat
// oleh murid mana pun. Aturan ini dinyatakan SATU kali di sini dan dipakai
// daftar materi beranda, halaman baca materi, dan pencatatan tuntas baca.
// (Aturan lama — guru kelas + kecocokan mapel — tidak bisa membedakan
// jenjang kelas dalam satu mapel dari guru yang sama, sehingga materi
// kelas X bocor ke murid kelas XI.)

/** Status penugasan yang memberi keterlihatan materi tertautnya. */
export const MODULE_VISIBLE_ASSIGNMENT_STATUSES: readonly string[] = ["terbit", "ditutup"];

/**
 * Gerbang murni keterlihatan materi: dari baris penugasan kandidat yang
 * SUDAH terlingkup pada sasaran murid tertentu (jalur kelas atau jalur
 * langsung), kembalikan id modul yang terlihat — hanya penugasan berstatus
 * terbit/ditutup dengan modul tertaut, tanpa duplikat.
 */
export function qualifyingModuleIds(
  candidateAssignments: readonly { moduleId: number | null; status: string }[],
): number[] {
  const seen = new Set<number>();
  for (const assignment of candidateAssignments) {
    if (assignment.moduleId === null) continue;
    if (!MODULE_VISIBLE_ASSIGNMENT_STATUSES.includes(assignment.status)) continue;
    seen.add(assignment.moduleId);
  }
  return [...seen];
}

async function targetedModuleAssignments(studentId: number): Promise<{ moduleId: number | null; status: string }[]> {
  const viaClass = await db
    .select({ moduleId: assignments.moduleId, status: assignments.status })
    .from(assignments)
    .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .where(and(
      eq(classMembers.studentId, studentId),
      eq(classes.isArchived, false),
      isNotNull(assignments.moduleId),
    ));
  const viaDirect = await db
    .select({ moduleId: assignments.moduleId, status: assignments.status })
    .from(assignments)
    .innerJoin(assignmentStudents, eq(assignmentStudents.assignmentId, assignments.id))
    .where(and(
      eq(assignmentStudents.studentId, studentId),
      isNotNull(assignments.moduleId),
    ));
  return [...viaClass, ...viaDirect];
}

/** Id semua modul yang terlihat oleh murid ini menurut aturan penugasan. */
export async function listVisibleModuleIds(studentId: number): Promise<number[]> {
  return qualifyingModuleIds(await targetedModuleAssignments(studentId));
}

/** Apakah modul ini terlihat oleh murid ini menurut aturan penugasan? */
export async function studentCanAccessModule(studentId: number, moduleId: number): Promise<boolean> {
  return (await listVisibleModuleIds(studentId)).includes(moduleId);
}

/** Mapel penugasan untuk aturan kelas murid: dari modul tertaut, atau dari modul induk LKPD tertaut. */
export async function loadAssignmentSubject(assignment: { moduleId: number | null; worksheetId: number | null }): Promise<string | null> {
  if (assignment.moduleId !== null) {
    const [module] = await db.select({ subject: modules.subject }).from(modules).where(eq(modules.id, assignment.moduleId)).limit(1);
    return module?.subject ?? null;
  }
  if (assignment.worksheetId !== null) {
    const [row] = await db
      .select({ subject: modules.subject })
      .from(worksheets)
      .innerJoin(modules, eq(modules.id, worksheets.moduleId))
      .where(eq(worksheets.id, assignment.worksheetId))
      .limit(1);
    return row?.subject ?? null;
  }
  return null;
}

export type AssignmentStudentView = { id: number; name: string; username: string; class_name: string };

/**
 * Daftar murid sasaran langsung satu penugasan untuk serializer guru,
 * lengkap dengan nama kelas hasil aturan lib/student-class.ts (kelas
 * berpreferensi mapel penugasan; tak teratasi → "").
 */
export async function loadAssignmentStudentsView(
  assignment: { id: number; moduleId: number | null; worksheetId: number | null },
  membershipsByStudent: Map<number, ClassMembership[]>,
): Promise<AssignmentStudentView[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(assignmentStudents)
    .innerJoin(users, eq(users.id, assignmentStudents.studentId))
    .where(eq(assignmentStudents.assignmentId, assignment.id))
    .orderBy(asc(users.name));
  if (rows.length === 0) return [];
  const subject = await loadAssignmentSubject(assignment);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    username: row.username,
    class_name: resolveStudentClass(membershipsByStudent.get(row.id) ?? [], subject)?.name ?? "",
  }));
}
