import { and, eq } from "drizzle-orm";
import { db, schema } from "@simak/db";

// Penentuan kelas murid untuk panel penilaian guru (Pengumpulan LKPD):
// kelas milik guru yang memuat murid itu sebagai anggota. Aturannya
// deterministik dan tanpa perubahan skema — satu kueri keanggotaan untuk
// semua murid si guru, lalu dicocokkan di memori (bukan N+1).
//
// Urutan keputusan (mapel LKPD berasal dari modul induknya):
// 1. Bila tepat satu kelas anggota yang mapelnya cocok → kelas itu.
// 2. Bila ada beberapa yang cocok → id kelas terkecil di antara yang cocok
//    (preferensi mapel tetap dijaga).
// 3. Bila tidak ada yang cocok dan murid hanya anggota satu kelas guru →
//    kelas itu.
// 4. Selain itu → id kelas terkecil di antara semua keanggotaan.
// 5. Bukan anggota kelas mana pun (yang tidak diarsipkan) → null.

const { classMembers, classes } = schema;

export type ClassMembership = {
  studentId: number;
  classId: number;
  className: string;
  classSubject: string;
};

export type ResolvedStudentClass = { id: number; name: string };

export function resolveStudentClass(
  memberships: ClassMembership[],
  subject: string | null,
): ResolvedStudentClass | null {
  if (memberships.length === 0) return null;
  const byClassId = [...memberships].sort((a, b) => a.classId - b.classId);
  const matches = subject === null ? [] : byClassId.filter((membership) => membership.classSubject === subject);
  const picked = matches.length > 0 ? matches[0]! : byClassId[0]!;
  return { id: picked.classId, name: picked.className };
}

/**
 * Satu kueri untuk seluruh keanggotaan kelas milik guru (kelas arsip
 * dikecualikan, meniru endpoint penilaian penugasan), dikelompokkan per
 * id murid.
 */
export async function loadTeacherClassMemberships(teacherId: number): Promise<Map<number, ClassMembership[]>> {
  const rows = await db
    .select({
      studentId: classMembers.studentId,
      classId: classes.id,
      className: classes.name,
      classSubject: classes.subject,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classes.teacherId, teacherId), eq(classes.isArchived, false)));

  const byStudent = new Map<number, ClassMembership[]>();
  for (const row of rows) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row);
    byStudent.set(row.studentId, list);
  }
  return byStudent;
}
