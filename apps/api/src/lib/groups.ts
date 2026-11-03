import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";

// Kelompok pengerjaan LKPD (Tahap 1): kelompok dibentuk OTOMATIS ACAK oleh
// sistem per kelas tujuan saat penugasan bermode "kelompok" diterbitkan.
//
// Berkas ini memisahkan logika murni (perencanaan ukuran, pengacakan
// Fisher–Yates dengan RNG yang bisa disuntikkan, penggabungan attempt
// kelompok ke murid untuk laporan) dari operasi basis data, supaya aturan
// mainnya terkunci oleh tes unit (groups.test.mjs).

const { assignmentClasses, assignmentGroupMembers, assignmentGroups, assignments, classMembers, classes, groupContributionRatings, users, worksheetAnswers, worksheetAttemptMemberScores, worksheetAttempts } = schema;

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
// Tahap 2 — logika murni: salin kelompok, kontribusi, nilai anggota.
// ---------------------------------------------------------------------------

export type SourceGroupComposition = { name: string; memberIds: number[] };

/**
 * Susunan salinan kelompok: nama + keanggotaan dari penugasan sumber
 * dipotong dengan daftar murid kelas tujuan SAAT INI — murid yang sudah
 * keluar dari kelas dibuang, urutan dan nama kelompok dipertahankan apa
 * adanya (tidak dinomori ulang), dan kelompok yang kehilangan seluruh
 * anggotanya tidak ikut disalin. Murid kelas yang belum ada di sumber
 * tidak muncul di hasil (mereka tetap belum berkelompok).
 */
export function planCopiedGroups(
  sourceGroups: readonly SourceGroupComposition[],
  rosterIds: ReadonlySet<number> | readonly number[],
): SourceGroupComposition[] {
  const roster = rosterIds instanceof Set ? rosterIds : new Set(rosterIds);
  const copied: SourceGroupComposition[] = [];
  for (const group of sourceGroups) {
    const memberIds = group.memberIds.filter((studentId) => roster.has(studentId));
    if (memberIds.length > 0) copied.push({ name: group.name, memberIds });
  }
  return copied;
}

export type ContributionSummary = { average: number | null; raters: number };

/**
 * Ringkasan kontribusi per anggota dari baris-baris penilaian mentah:
 * rata-rata dibulatkan ke 1 desimal dan jumlah penilai yang berbeda.
 * Anggota tanpa penilaian mana pun mendapat { average: null, raters: 0 }.
 * Penilaian dari/untuk non-anggota diabaikan (route sudah memvalidasi,
 * ini pagar kedua agar agregat tidak pernah tercemar).
 */
export function summarizeContributionRatings(
  ratings: readonly { raterStudentId: number; rateeStudentId: number; score: number }[],
  memberIds: readonly number[],
): Map<number, ContributionSummary> {
  const memberSet = new Set(memberIds);
  const totals = new Map<number, { sum: number; raters: Set<number> }>();
  for (const rating of ratings) {
    if (!memberSet.has(rating.rateeStudentId) || !memberSet.has(rating.raterStudentId)) continue;
    if (rating.raterStudentId === rating.rateeStudentId) continue;
    const entry = totals.get(rating.rateeStudentId) ?? { sum: 0, raters: new Set<number>() };
    if (!entry.raters.has(rating.raterStudentId)) {
      entry.raters.add(rating.raterStudentId);
      entry.sum += rating.score;
    }
    totals.set(rating.rateeStudentId, entry);
  }
  const summary = new Map<number, ContributionSummary>();
  for (const memberId of memberIds) {
    const entry = totals.get(memberId);
    summary.set(memberId, entry && entry.raters.size > 0
      ? { average: Math.round((entry.sum / entry.raters.size) * 10) / 10, raters: entry.raters.size }
      : { average: null, raters: 0 });
  }
  return summary;
}

/**
 * Nilai efektif seorang anggota attempt kelompok: penyesuaian guru
 * (override) menang atas nilai total kelompok; tanpa override, nilai
 * kelompok yang berlaku. Masukan berupa string decimal dari basis data.
 */
export function resolveEffectiveMemberScore(
  overrideScore: string | null | undefined,
  groupTotalScore: string | null | undefined,
): number | null {
  if (overrideScore !== null && overrideScore !== undefined) return Number(overrideScore);
  if (groupTotalScore !== null && groupTotalScore !== undefined) return Number(groupTotalScore);
  return null;
}

/**
 * Jendela penilaian kontribusi: hanya terbuka saat attempt kelompok sudah
 * terkumpul tetapi belum dinilai guru.
 */
export function contributionWindowOpen(status: "draf" | "terkumpul" | "dinilai"): boolean {
  return status === "terkumpul";
}

/**
 * Anggota boleh dikeluarkan dari kelompoknya selama attempt kelompok itu
 * belum ada (null) atau masih berstatus draf; attempt terkumpul/dinilai
 * mengunci susunan anggota.
 */
export function groupMemberRemovalAllowed(attemptStatus: "draf" | "terkumpul" | "dinilai" | null): boolean {
  return attemptStatus === null || attemptStatus === "draf";
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
export type AssignmentGroupView = {
  id: number;
  name: string;
  members: AssignmentGroupMemberView[];
  // Status attempt kelompok ini pada LKPD penugasan (null = belum ada
  // attempt) — UI memakainya untuk menonaktifkan pengeluaran anggota.
  attempt_status: "draf" | "terkumpul" | "dinilai" | null;
};
export type AssignmentGroupCopySource = { assignment_id: number; title: string };
export type AssignmentClassGroupsView = {
  class_id: number;
  class_name: string;
  shuffle_locked: boolean;
  groups: AssignmentGroupView[];
  ungrouped: AssignmentGroupMemberView[];
  // Penugasan kelompok lain milik guru yang sama yang sudah mempunyai
  // kelompok untuk kelas ini — kandidat sumber salinan (Tahap 2).
  copy_sources: AssignmentGroupCopySource[];
};

/** Kandidat sumber salinan per kelas: penugasan kelompok LAIN milik guru yang sama yang sudah mempunyai kelompok untuk kelas itu. */
export async function loadCopySources(
  teacherId: number,
  excludeAssignmentId: number,
  classIds: readonly number[],
): Promise<Map<number, AssignmentGroupCopySource[]>> {
  const byClass = new Map<number, AssignmentGroupCopySource[]>();
  if (classIds.length === 0) return byClass;
  const rows = await db
    .select({ classId: assignmentGroups.classId, assignmentId: assignments.id, title: assignments.title })
    .from(assignmentGroups)
    .innerJoin(assignments, eq(assignments.id, assignmentGroups.assignmentId))
    .where(and(
      eq(assignments.teacherId, teacherId),
      eq(assignments.workMode, "kelompok"),
      inArray(assignmentGroups.classId, [...classIds]),
    ))
    .orderBy(assignments.id);
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.assignmentId === excludeAssignmentId) continue;
    const key = `${row.classId}:${row.assignmentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byClass.get(row.classId) ?? [];
    list.push({ assignment_id: row.assignmentId, title: row.title });
    byClass.set(row.classId, list);
  }
  return byClass;
}

/** Data lengkap panel Kelompok guru: per kelas tujuan (termasuk arsip? tidak — hanya yang aktif, sama seperti targetClasses). */
export async function loadAssignmentGroupsView(assignment: AssignmentRow): Promise<AssignmentClassGroupsView[]> {
  const kelasList = await targetClasses(assignment.id);
  const copySources = await loadCopySources(assignment.teacherId, assignment.id, kelasList.map((kelas) => kelas.id));
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
    // Status attempt per kelompok pada LKPD penugasan (untuk kunci
    // pengeluaran anggota di UI) — satu kueri per kelas.
    const attemptStatusByGroup = new Map<number, "draf" | "terkumpul" | "dinilai">();
    if (assignment.worksheetId !== null && groupRows.length > 0) {
      const attemptRows = await db
        .select({ groupId: worksheetAttempts.groupId, status: worksheetAttempts.status })
        .from(worksheetAttempts)
        .where(and(
          eq(worksheetAttempts.worksheetId, assignment.worksheetId),
          inArray(worksheetAttempts.groupId, groupRows.map((row) => row.id)),
        ));
      for (const row of attemptRows) {
        if (row.groupId !== null) attemptStatusByGroup.set(row.groupId, row.status);
      }
    }
    views.push({
      class_id: kelas.id,
      class_name: kelas.name,
      shuffle_locked: await classShuffleLocked(assignment, kelas.id),
      groups: groupRows.map((row) => ({
        id: row.id,
        name: row.name,
        members: membersByGroup.get(row.id) ?? [],
        attempt_status: attemptStatusByGroup.get(row.id) ?? null,
      })),
      ungrouped: classMemberRows.filter((row) => !groupedStudentIds.has(row.id)),
      copy_sources: copySources.get(kelas.id) ?? [],
    });
  }
  return views;
}

/**
 * Salin susunan kelompok satu kelas dari penugasan sumber ke penugasan
 * tujuan, dalam satu transaksi: kelompok tujuan yang ada untuk kelas itu
 * dihapus lebih dulu (pemanggil wajib memastikan kelas tidak terkunci),
 * lalu susunan sumber yang sudah dipotong dengan daftar kelas saat ini
 * (planCopiedGroups) ditulis sebagai kelompok baru. Mengembalikan jumlah
 * kelompok dan anggota yang tersalin.
 */
export async function copyGroupsForClass(
  target: AssignmentRow,
  source: AssignmentRow,
  classId: number,
): Promise<{ groups: number; members: number }> {
  const [sourceGroupRows, rosterRows] = await Promise.all([
    db
      .select({ id: assignmentGroups.id, name: assignmentGroups.name })
      .from(assignmentGroups)
      .where(and(eq(assignmentGroups.assignmentId, source.id), eq(assignmentGroups.classId, classId)))
      .orderBy(assignmentGroups.id),
    db
      .select({ studentId: classMembers.studentId })
      .from(classMembers)
      .where(eq(classMembers.classId, classId)),
  ]);
  const sourceMembers = sourceGroupRows.length
    ? await db
        .select({ groupId: assignmentGroupMembers.groupId, studentId: assignmentGroupMembers.studentId })
        .from(assignmentGroupMembers)
        .where(inArray(assignmentGroupMembers.groupId, sourceGroupRows.map((row) => row.id)))
        .orderBy(assignmentGroupMembers.studentId)
    : [];
  const membersByGroup = new Map<number, number[]>();
  for (const row of sourceMembers) {
    const list = membersByGroup.get(row.groupId) ?? [];
    list.push(row.studentId);
    membersByGroup.set(row.groupId, list);
  }
  const planned = planCopiedGroups(
    sourceGroupRows.map((row) => ({ name: row.name, memberIds: membersByGroup.get(row.id) ?? [] })),
    rosterRows.map((row) => row.studentId),
  );
  let memberCount = 0;
  await db.transaction(async (tx) => {
    await tx.delete(assignmentGroups).where(
      and(eq(assignmentGroups.assignmentId, target.id), eq(assignmentGroups.classId, classId)),
    );
    for (const group of planned) {
      const [created] = await tx
        .insert(assignmentGroups)
        .values({ assignmentId: target.id, classId, name: group.name })
        .$returningId();
      await tx.insert(assignmentGroupMembers).values(
        group.memberIds.map((studentId) => ({ groupId: created!.id, assignmentId: target.id, studentId })),
      );
      memberCount += group.memberIds.length;
    }
  });
  return { groups: planned.length, members: memberCount };
}

/** Status attempt satu kelompok pada LKPD penugasan (null bila belum ada attempt atau penugasan tanpa LKPD). */
export async function loadGroupAttemptStatus(
  assignment: AssignmentRow,
  groupId: number,
): Promise<"draf" | "terkumpul" | "dinilai" | null> {
  if (assignment.worksheetId === null) return null;
  const [attempt] = await db
    .select({ status: worksheetAttempts.status })
    .from(worksheetAttempts)
    .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), eq(worksheetAttempts.groupId, groupId)))
    .limit(1);
  return attempt?.status ?? null;
}

/** Peta penyesuaian nilai per anggota untuk satu attempt: studentId → skor decimal (string). */
export async function loadAttemptMemberScores(attemptId: number): Promise<Map<number, string>> {
  const rows = await db
    .select({ studentId: worksheetAttemptMemberScores.studentId, score: worksheetAttemptMemberScores.score })
    .from(worksheetAttemptMemberScores)
    .where(eq(worksheetAttemptMemberScores.attemptId, attemptId));
  return new Map(rows.map((row) => [row.studentId, row.score]));
}

/** Penyesuaian nilai satu murid pada satu attempt (string decimal), atau null bila tidak ada. */
export async function loadMemberScoreOverride(attemptId: number, studentId: number): Promise<string | null> {
  const [row] = await db
    .select({ score: worksheetAttemptMemberScores.score })
    .from(worksheetAttemptMemberScores)
    .where(and(
      eq(worksheetAttemptMemberScores.attemptId, attemptId),
      eq(worksheetAttemptMemberScores.studentId, studentId),
    ))
    .limit(1);
  return row?.score ?? null;
}

/** Ringkasan kontribusi per anggota untuk tampilan guru pada satu attempt kelompok. */
export async function loadContributionSummary(
  attemptId: number,
  memberIds: readonly number[],
): Promise<Map<number, ContributionSummary>> {
  const rows = await db
    .select({
      raterStudentId: groupContributionRatings.raterStudentId,
      rateeStudentId: groupContributionRatings.rateeStudentId,
      score: groupContributionRatings.score,
    })
    .from(groupContributionRatings)
    .where(eq(groupContributionRatings.attemptId, attemptId));
  return summarizeContributionRatings(rows, memberIds);
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
