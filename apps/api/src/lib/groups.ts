import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";

// Kelompok pengerjaan LKPD (Tahap 1): kelompok dibentuk OTOMATIS ACAK oleh
// sistem per kelas tujuan saat penugasan bermode "kelompok" diterbitkan.
//
// Berkas ini memisahkan logika murni (perencanaan ukuran, pengacakan
// Fisher–Yates dengan RNG yang bisa disuntikkan, penggabungan attempt
// kelompok ke murid untuk laporan) dari operasi basis data, supaya aturan
// mainnya terkunci oleh tes unit (groups.test.mjs).

const { assignmentClasses, assignmentGroupMembers, assignmentGroups, classMembers, classes, users, worksheetAnswers, worksheetAttempts } = schema;

export const DEFAULT_GROUP_SIZE = 4;

/**
 * Rencana ukuran kelompok untuk n murid dengan target `size` anggota per
 * kelompok: jumlah kelompok = clamp(round(n / size), 1, n); ukuran antar
 * kelompok berselisih paling banyak 1 dan kelompok yang lebih besar
 * didahulukan. n = 0 menghasilkan daftar kosong.
 * Contoh: n=33, size=4 → 8 kelompok [5,4,4,4,4,4,4,4].
 */
export function planGroupSizes(n: number, size: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const target = Number.isInteger(size) && size >= 1 ? size : DEFAULT_GROUP_SIZE;
  const groupCount = Math.min(n, Math.max(1, Math.round(n / target)));
  const base = Math.floor(n / groupCount);
  const remainder = n % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Fisher–Yates dengan RNG yang disuntikkan (0 <= rng() < 1); tidak mengubah masukan. */
export function shuffleIds<T>(ids: readonly T[], rng: () => number): T[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = result[index]!;
    result[index] = result[swapIndex]!;
    result[swapIndex] = current;
  }
  return result;
}

/** Acak daftar murid lalu potong menjadi kelompok sesuai planGroupSizes. */
export function splitIntoGroups(studentIds: readonly number[], size: number, rng: () => number): number[][] {
  const shuffled = shuffleIds(studentIds, rng);
  const groups: number[][] = [];
  let offset = 0;
  for (const groupSize of planGroupSizes(studentIds.length, size)) {
    groups.push(shuffled.slice(offset, offset + groupSize));
    offset += groupSize;
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Penggabungan attempt kelompok ke laporan per murid.
// ---------------------------------------------------------------------------

export type AttemptSnapshot = {
  status: "draf" | "terkumpul" | "dinilai";
  submittedAt: Date | null;
  totalScore: string | null;
};

const STATUS_RANK: Record<AttemptSnapshot["status"], number> = { draf: 1, terkumpul: 2, dinilai: 3 };

export function attemptStatusRank(status: AttemptSnapshot["status"]): number {
  return STATUS_RANK[status] ?? 0;
}

/**
 * Petakan attempt kelompok ke setiap anggotanya: studentId → attempt
 * kelompoknya. Murid tanpa kelompok tidak muncul di peta.
 */
export function mapGroupAttemptsToStudents(
  members: readonly { studentId: number; groupId: number }[],
  attemptsByGroupId: ReadonlyMap<number, AttemptSnapshot>,
): Map<number, AttemptSnapshot> {
  const byStudent = new Map<number, AttemptSnapshot>();
  for (const member of members) {
    const attempt = attemptsByGroupId.get(member.groupId);
    if (attempt) byStudent.set(member.studentId, attempt);
  }
  return byStudent;
}

/**
 * Attempt efektif seorang murid untuk laporan penugasan: yang peringkat
 * statusnya lebih tinggi menang (draf < terkumpul < dinilai); seri →
 * attempt kelompok, karena attempt kelompok adalah produk kerja penugasan.
 */
export function pickEffectiveAttempt(
  individual: AttemptSnapshot | undefined,
  group: AttemptSnapshot | undefined,
): AttemptSnapshot | undefined {
  if (!individual) return group;
  if (!group) return individual;
  return attemptStatusRank(group.status) >= attemptStatusRank(individual.status) ? group : individual;
}

// ---------------------------------------------------------------------------
// Operasi basis data.
// ---------------------------------------------------------------------------

type AssignmentRow = typeof schema.assignments.$inferSelect;

/** Kelas tujuan penugasan yang tidak diarsipkan, urut id. */
async function targetClasses(assignmentId: number) {
  return db
    .select({ id: classes.id, name: classes.name })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .where(and(eq(assignmentClasses.assignmentId, assignmentId), eq(classes.isArchived, false)))
    .orderBy(classes.id);
}

/** Bentuk kelompok untuk satu kelas (di dalam transaksi yang diberikan). */
async function generateGroupsForClass(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  assignment: AssignmentRow,
  classId: number,
) {
  const memberRows = await tx
    .select({ studentId: classMembers.studentId })
    .from(classMembers)
    .where(eq(classMembers.classId, classId))
    .orderBy(classMembers.studentId);
  const chunks = splitIntoGroups(memberRows.map((row) => row.studentId), assignment.groupSize ?? DEFAULT_GROUP_SIZE, Math.random);
  for (const [index, chunk] of chunks.entries()) {
    const [group] = await tx
      .insert(assignmentGroups)
      .values({ assignmentId: assignment.id, classId, name: `Kelompok ${index + 1}` })
      .$returningId();
    await tx.insert(assignmentGroupMembers).values(
      chunk.map((studentId) => ({ groupId: group!.id, assignmentId: assignment.id, studentId })),
    );
  }
  return chunks.length;
}

/**
 * Pastikan setiap kelas tujuan penugasan kelompok sudah mempunyai kelompok;
 * kelas yang sudah punya dilewati (idempoten). Mengembalikan jumlah kelas
 * yang baru dibentukkan kelompok.
 */
export async function ensureGroupsForAssignment(assignment: AssignmentRow): Promise<number> {
  if (assignment.workMode !== "kelompok") return 0;
  const kelasList = await targetClasses(assignment.id);
  let created = 0;
  for (const kelas of kelasList) {
    const [existing] = await db
      .select({ id: assignmentGroups.id })
      .from(assignmentGroups)
      .where(and(eq(assignmentGroups.assignmentId, assignment.id), eq(assignmentGroups.classId, kelas.id)))
      .limit(1);
    if (existing) continue;
    await db.transaction(async (tx) => {
      await generateGroupsForClass(tx, assignment, kelas.id);
    });
    created += 1;
  }
  return created;
}

/**
 * Kunci acak ulang per (penugasan, kelas): terkunci bila ada attempt milik
 * kelompok kelas itu pada LKPD penugasan yang berstatus bukan draf ATAU
 * sudah mempunyai jawaban apa pun.
 */
export async function classShuffleLocked(assignment: AssignmentRow, classId: number): Promise<boolean> {
  if (assignment.worksheetId === null) return false;
  const groupRows = await db
    .select({ id: assignmentGroups.id })
    .from(assignmentGroups)
    .where(and(eq(assignmentGroups.assignmentId, assignment.id), eq(assignmentGroups.classId, classId)));
  if (groupRows.length === 0) return false;
  const groupIds = groupRows.map((row) => row.id);
  const attempts = await db
    .select({ id: worksheetAttempts.id, status: worksheetAttempts.status })
    .from(worksheetAttempts)
    .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.groupId, groupIds)));
  if (attempts.some((attempt) => attempt.status !== "draf")) return true;
  if (attempts.length === 0) return false;
  const [answer] = await db
    .select({ id: worksheetAnswers.id })
    .from(worksheetAnswers)
    .where(inArray(worksheetAnswers.attemptId, attempts.map((attempt) => attempt.id)))
    .limit(1);
  return Boolean(answer);
}

/**
 * Apakah sudah ada kerja kelompok pada penugasan ini (di kelas mana pun) —
 * predikat kunci mode/ukuran pada PATCH penugasan terbit, dimodelkan pada
 * assignmentHasStudentActivity (routes/assignments.ts) tetapi terlingkup
 * pada attempt kelompok: attempt kelompok yang sudah punya jawaban atau
 * berstatus bukan draf.
 */
export async function assignmentHasGroupWork(assignment: AssignmentRow): Promise<boolean> {
  const kelasList = await targetClasses(assignment.id);
  for (const kelas of kelasList) {
    if (await classShuffleLocked(assignment, kelas.id)) return true;
  }
  return false;
}

/**
 * Hapus kelompok satu kelas lalu bentuk ulang secara acak dalam satu
 * transaksi. Pemanggil wajib memeriksa classShuffleLocked lebih dulu.
 */
export async function regenerateGroupsForClass(assignment: AssignmentRow, classId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(assignmentGroups).where(
      and(eq(assignmentGroups.assignmentId, assignment.id), eq(assignmentGroups.classId, classId)),
    );
    await generateGroupsForClass(tx, assignment, classId);
  });
}

export type AssignmentGroupMemberView = { id: number; name: string; username: string };
export type AssignmentGroupView = { id: number; name: string; members: AssignmentGroupMemberView[] };
export type AssignmentClassGroupsView = {
  class_id: number;
  class_name: string;
  shuffle_locked: boolean;
  groups: AssignmentGroupView[];
  ungrouped: AssignmentGroupMemberView[];
};

/** Data lengkap panel Kelompok guru: per kelas tujuan (termasuk arsip? tidak — hanya yang aktif, sama seperti targetClasses). */
export async function loadAssignmentGroupsView(assignment: AssignmentRow): Promise<AssignmentClassGroupsView[]> {
  const kelasList = await targetClasses(assignment.id);
  const views: AssignmentClassGroupsView[] = [];
  for (const kelas of kelasList) {
    const [groupRows, classMemberRows] = await Promise.all([
      db
        .select({ id: assignmentGroups.id, name: assignmentGroups.name })
        .from(assignmentGroups)
        .where(and(eq(assignmentGroups.assignmentId, assignment.id), eq(assignmentGroups.classId, kelas.id)))
        .orderBy(assignmentGroups.id),
      db
        .select({ id: users.id, name: users.name, username: users.username })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.studentId))
        .where(eq(classMembers.classId, kelas.id))
        .orderBy(users.name),
    ]);
    const memberRows = groupRows.length
      ? await db
          .select({ groupId: assignmentGroupMembers.groupId, id: users.id, name: users.name, username: users.username })
          .from(assignmentGroupMembers)
          .innerJoin(users, eq(users.id, assignmentGroupMembers.studentId))
          .where(inArray(assignmentGroupMembers.groupId, groupRows.map((row) => row.id)))
          .orderBy(users.name)
      : [];
    const membersByGroup = new Map<number, AssignmentGroupMemberView[]>();
    const groupedStudentIds = new Set<number>();
    for (const row of memberRows) {
      const list = membersByGroup.get(row.groupId) ?? [];
      list.push({ id: row.id, name: row.name, username: row.username });
      membersByGroup.set(row.groupId, list);
      groupedStudentIds.add(row.id);
    }
    views.push({
      class_id: kelas.id,
      class_name: kelas.name,
      shuffle_locked: await classShuffleLocked(assignment, kelas.id),
      groups: groupRows.map((row) => ({ id: row.id, name: row.name, members: membersByGroup.get(row.id) ?? [] })),
      ungrouped: classMemberRows.filter((row) => !groupedStudentIds.has(row.id)),
    });
  }
  return views;
}

/** Kelompok seorang murid pada satu penugasan (+ anggota dan nama kelas), atau null bila belum berkelompok. */
export async function loadStudentGroup(assignmentId: number, studentId: number) {
  const [own] = await db
    .select({
      groupId: assignmentGroups.id,
      groupName: assignmentGroups.name,
      classId: classes.id,
      className: classes.name,
    })
    .from(assignmentGroupMembers)
    .innerJoin(assignmentGroups, eq(assignmentGroups.id, assignmentGroupMembers.groupId))
    .innerJoin(classes, eq(classes.id, assignmentGroups.classId))
    .where(and(eq(assignmentGroupMembers.assignmentId, assignmentId), eq(assignmentGroupMembers.studentId, studentId)))
    .limit(1);
  if (!own) return null;
  const members = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(assignmentGroupMembers)
    .innerJoin(users, eq(users.id, assignmentGroupMembers.studentId))
    .where(eq(assignmentGroupMembers.groupId, own.groupId))
    .orderBy(users.name);
  return {
    id: own.groupId,
    name: own.groupName,
    class_id: own.classId,
    class_name: own.className,
    members,
  };
}
