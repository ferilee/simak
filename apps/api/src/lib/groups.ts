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
 * kelompok (Aturan B): jumlah kelompok = clamp(ceil(n / size), 1, n) —
 * dibulatkan ke atas supaya tidak ada kelompok yang melebihi target —
 * lalu n dibagi semerata mungkin ke sejumlah kelompok itu (ukuran antar
 * kelompok berselisih paling banyak 1 dan kelompok yang lebih besar
 * didahulukan). Akibatnya ukuran tidak pernah melewati `size`, dan
 * kelompok ekornya sebesar size − 1 (untuk size 4 berisi 3). n = 0
 * menghasilkan daftar kosong.
 * Contoh: n=33, size=4 → 9 kelompok [4,4,4,4,4,4,3,3,3].
 */
export function planGroupSizes(n: number, size: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const target = Number.isInteger(size) && size >= 1 ? size : DEFAULT_GROUP_SIZE;
  const groupCount = Math.min(n, Math.max(1, Math.ceil(n / target)));
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
// Pembentukan ulang sebagian (Aturan B): kelompok yang sudah penuh atau
// sudah mulai mengerjakan TERKUNCI dan dipertahankan apa adanya; hanya
// murid di luar kelompok terkunci yang dibentuk ulang.
// ---------------------------------------------------------------------------

export type GroupAttemptStatus = "draf" | "terkumpul" | "dinilai";

/**
 * Sebuah kelompok terkunci dari pembentukan ulang bila (a) jumlah
 * anggotanya sudah mencapai target ukuran penugasan, ATAU (b) kelompok
 * sudah mulai mengerjakan: attempt-nya pada LKPD penugasan berstatus
 * bukan draf, atau attempt drafnya sudah mempunyai jawaban apa pun —
 * bukti yang sama dengan classShuffleLocked, tetapi dinilai PER KELOMPOK.
 */
export function groupReformationLocked(
  memberCount: number,
  targetSize: number,
  attemptStatus: GroupAttemptStatus | null,
  hasAnswers: boolean,
): boolean {
  const target = Number.isInteger(targetSize) && targetSize >= 1 ? targetSize : DEFAULT_GROUP_SIZE;
  return memberCount >= target || (attemptStatus !== null && attemptStatus !== "draf") || hasAnswers;
}

/** Akhiran angka nama kelompok berpola "Kelompok N" (null bila polanya berbeda). */
export function groupNameSuffix(name: string): number | null {
  const match = /^Kelompok (\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

export type ReformationGroupFacts = {
  id: number;
  name: string;
  memberIds: readonly number[];
  attemptStatus: GroupAttemptStatus | null;
  hasAnswers: boolean;
};

export type ReformationPlan = {
  /** Kelompok terkunci yang dipertahankan apa adanya. */
  preservedIds: number[];
  /** Kelompok tidak terkunci yang dibubarkan. */
  dissolvedIds: number[];
  /**
   * Murid yang dibentuk ulang: daftar anggota kelas dikurangi anggota
   * kelompok terkunci — jadi mencakup anggota kelompok yang dibubarkan,
   * murid yang belum berkelompok, dan murid yang baru masuk kelas.
   * Urutan mengikuti daftar kelas.
   */
  poolStudentIds: number[];
  /**
   * Nomor nama untuk kelompok baru pertama: satu di atas akhiran angka
   * terbesar di antara nama kelompok TERKUNCI; 1 bila tidak ada kelompok
   * terkunci (pembentukan ulang penuh, seperti perilaku lama).
   */
  firstNewGroupNumber: number;
  /** true bila pembentukan ulang tidak mengubah apa pun. */
  noop: boolean;
};

/** Rencana pembentukan ulang sebagian untuk satu (penugasan, kelas). */
export function planReformation(
  groups: readonly ReformationGroupFacts[],
  rosterIds: readonly number[],
  targetSize: number,
): ReformationPlan {
  const preserved: ReformationGroupFacts[] = [];
  const dissolved: ReformationGroupFacts[] = [];
  for (const group of groups) {
    if (groupReformationLocked(group.memberIds.length, targetSize, group.attemptStatus, group.hasAnswers)) {
      preserved.push(group);
    } else {
      dissolved.push(group);
    }
  }
  const lockedMembers = new Set(preserved.flatMap((group) => group.memberIds));
  const poolStudentIds = rosterIds.filter((studentId) => !lockedMembers.has(studentId));
  let maxSuffix = 0;
  for (const group of preserved) {
    const suffix = groupNameSuffix(group.name);
    if (suffix !== null && suffix > maxSuffix) maxSuffix = suffix;
  }
  return {
    preservedIds: preserved.map((group) => group.id),
    dissolvedIds: dissolved.map((group) => group.id),
    poolStudentIds,
    firstNewGroupNumber: maxSuffix + 1,
    noop: dissolved.length === 0 && poolStudentIds.length === 0,
  };
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
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Klien baca: basis data langsung atau transaksi yang sedang berjalan. */
type DbReader = typeof db | DbTransaction;

/** Kelas tujuan penugasan yang tidak diarsipkan, urut id. */
async function targetClasses(assignmentId: number) {
  return db
    .select({ id: classes.id, name: classes.name })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .where(and(eq(assignmentClasses.assignmentId, assignmentId), eq(classes.isArchived, false)))
    .orderBy(classes.id);
}

/** Tulis potongan-potongan murid sebagai kelompok baru bernomor mulai `firstNumber` (di dalam transaksi yang diberikan). */
async function insertGroupsForClass(
  tx: DbTransaction,
  assignment: AssignmentRow,
  classId: number,
  chunks: readonly (readonly number[])[],
  firstNumber: number,
) {
  for (const [index, chunk] of chunks.entries()) {
    const [group] = await tx
      .insert(assignmentGroups)
      .values({ assignmentId: assignment.id, classId, name: `Kelompok ${firstNumber + index}` })
      .$returningId();
    await tx.insert(assignmentGroupMembers).values(
      chunk.map((studentId) => ({ groupId: group!.id, assignmentId: assignment.id, studentId })),
    );
  }
  return chunks.length;
}

/** Bentuk kelompok untuk satu kelas (di dalam transaksi yang diberikan). */
async function generateGroupsForClass(
  tx: DbTransaction,
  assignment: AssignmentRow,
  classId: number,
) {
  const memberRows = await tx
    .select({ studentId: classMembers.studentId })
    .from(classMembers)
    .where(eq(classMembers.classId, classId))
    .orderBy(classMembers.studentId);
  const chunks = splitIntoGroups(memberRows.map((row) => row.studentId), assignment.groupSize ?? DEFAULT_GROUP_SIZE, Math.random);
  return insertGroupsForClass(tx, assignment, classId, chunks, 1);
}

/**
 * Fakta attempt per kelompok pada LKPD penugasan: status attempt dan
 * apakah attempt yang masih draf sudah mempunyai jawaban. Dua kueri
 * konstan untuk seluruh daftar kelompok (bukan satu per kelompok):
 * attempt kelompok-kelompok itu, lalu jawaban atas attempt drafnya —
 * pola bukti yang sama dengan classShuffleLocked.
 */
async function loadGroupAttemptFacts(
  executor: DbReader,
  assignment: AssignmentRow,
  groupIds: readonly number[],
): Promise<Map<number, { status: GroupAttemptStatus | null; hasAnswers: boolean }>> {
  const facts = new Map<number, { status: GroupAttemptStatus | null; hasAnswers: boolean }>();
  if (assignment.worksheetId === null || groupIds.length === 0) return facts;
  const attemptRows = await executor
    .select({ id: worksheetAttempts.id, groupId: worksheetAttempts.groupId, status: worksheetAttempts.status })
    .from(worksheetAttempts)
    .where(and(
      eq(worksheetAttempts.worksheetId, assignment.worksheetId),
      inArray(worksheetAttempts.groupId, [...groupIds]),
    ));
  const draftAttemptGroupById = new Map<number, number>();
  for (const row of attemptRows) {
    if (row.groupId === null) continue;
    facts.set(row.groupId, { status: row.status, hasAnswers: false });
    if (row.status === "draf") draftAttemptGroupById.set(row.id, row.groupId);
  }
  if (draftAttemptGroupById.size > 0) {
    const answeredRows = await executor
      .select({ attemptId: worksheetAnswers.attemptId })
      .from(worksheetAnswers)
      .where(inArray(worksheetAnswers.attemptId, [...draftAttemptGroupById.keys()]));
    for (const row of answeredRows) {
      const groupId = draftAttemptGroupById.get(row.attemptId);
      const fact = groupId !== undefined ? facts.get(groupId) : undefined;
      if (fact) fact.hasAnswers = true;
    }
  }
  return facts;
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

export type RegenerateGroupsSummary = {
  /** Jumlah kelompok terkunci yang dipertahankan apa adanya. */
  preserved: number;
  /** Jumlah kelompok baru yang dibentuk dari kolam murid. */
  formed: number;
  /** Jumlah murid yang ikut dibentuk ulang (kolam). */
  pooled_students: number;
  /** true bila tidak ada kelompok yang bisa dibubarkan dan kolam kosong — tidak ada yang berubah. */
  noop: boolean;
};

/**
 * Bentuk ulang kelompok satu kelas SECARA SEBAGIAN dalam satu transaksi
 * (Aturan B): kelompok terkunci — sudah penuh atau sudah mulai
 * mengerjakan, lihat groupReformationLocked — dipertahankan persis apa
 * adanya (baris, nama, dan keanggotaannya tidak disentuh). Kelompok lain
 * dibubarkan dengan mekanisme hapus yang sama seperti pembentukan ulang
 * lama: baris assignment_groups dihapus dan anggota serta attempt
 * kelompoknya (yang menurut definisi kunci hanya mungkin attempt draf
 * tanpa jawaban) ikut terhapus oleh cascade FK. Murid di luar kelompok
 * terkunci kemudian dibagi ulang dengan Aturan B dan kelompok barunya
 * dinomori melanjutkan akhiran terbesar nama kelompok terkunci.
 */
export async function regenerateGroupsForClass(assignment: AssignmentRow, classId: number): Promise<RegenerateGroupsSummary> {
  const targetSize = assignment.groupSize ?? DEFAULT_GROUP_SIZE;
  return db.transaction(async (tx) => {
    const groupRows = await tx
      .select({ id: assignmentGroups.id, name: assignmentGroups.name })
      .from(assignmentGroups)
      .where(and(eq(assignmentGroups.assignmentId, assignment.id), eq(assignmentGroups.classId, classId)))
      .orderBy(assignmentGroups.id);
    const memberRows = groupRows.length
      ? await tx
          .select({ groupId: assignmentGroupMembers.groupId, studentId: assignmentGroupMembers.studentId })
          .from(assignmentGroupMembers)
          .where(inArray(assignmentGroupMembers.groupId, groupRows.map((row) => row.id)))
          .orderBy(assignmentGroupMembers.studentId)
      : [];
    const membersByGroup = new Map<number, number[]>();
    for (const row of memberRows) {
      const list = membersByGroup.get(row.groupId) ?? [];
      list.push(row.studentId);
      membersByGroup.set(row.groupId, list);
    }
    const facts = await loadGroupAttemptFacts(tx, assignment, groupRows.map((row) => row.id));
    const rosterRows = await tx
      .select({ studentId: classMembers.studentId })
      .from(classMembers)
      .where(eq(classMembers.classId, classId))
      .orderBy(classMembers.studentId);
    const plan = planReformation(
      groupRows.map((row) => ({
        id: row.id,
        name: row.name,
        memberIds: membersByGroup.get(row.id) ?? [],
        attemptStatus: facts.get(row.id)?.status ?? null,
        hasAnswers: facts.get(row.id)?.hasAnswers ?? false,
      })),
      rosterRows.map((row) => row.studentId),
      targetSize,
    );
    if (plan.noop) {
      return { preserved: plan.preservedIds.length, formed: 0, pooled_students: 0, noop: true };
    }
    if (plan.dissolvedIds.length > 0) {
      await tx.delete(assignmentGroups).where(inArray(assignmentGroups.id, plan.dissolvedIds));
    }
    const chunks = splitIntoGroups(plan.poolStudentIds, targetSize, Math.random);
    const formed = await insertGroupsForClass(tx, assignment, classId, chunks, plan.firstNewGroupNumber);
    return { preserved: plan.preservedIds.length, formed, pooled_students: plan.poolStudentIds.length, noop: false };
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
  // Terkunci dari pembentukan ulang sebagian (Aturan B): kelompok sudah
  // penuh atau sudah mulai mengerjakan (groupReformationLocked) — UI
  // menampilkannya sebagai lencana "Terkunci".
  locked: boolean;
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
    // Fakta attempt per kelompok pada LKPD penugasan (status untuk kunci
    // pengeluaran anggota di UI + bukti mulai mengerjakan untuk kunci
    // pembentukan ulang) — kueri konstan per kelas, bukan per kelompok.
    const attemptFacts = await loadGroupAttemptFacts(db, assignment, groupRows.map((row) => row.id));
    const targetSize = assignment.groupSize ?? DEFAULT_GROUP_SIZE;
    const groupViews = groupRows.map((row) => {
      const members = membersByGroup.get(row.id) ?? [];
      const fact = attemptFacts.get(row.id);
      return {
        id: row.id,
        name: row.name,
        members,
        attempt_status: fact?.status ?? null,
        locked: groupReformationLocked(members.length, targetSize, fact?.status ?? null, fact?.hasAnswers ?? false),
      };
    });
    const ungrouped = classMemberRows.filter((row) => !groupedStudentIds.has(row.id));
    views.push({
      class_id: kelas.id,
      class_name: kelas.name,
      // Definisi baru (Aturan B): shuffle_locked kini berarti "pembentukan
      // ulang tidak akan mengubah apa pun" — semua kelompok yang ada
      // terkunci DAN tidak ada murid yang belum berkelompok. (Dulu
      // bidang ini memakai classShuffleLocked: terkunci begitu ada satu
      // kelompok yang mulai mengerjakan; predikat itu tetap dipakai
      // endpoint salin kelompok dan assignmentHasGroupWork.)
      shuffle_locked: groupViews.every((group) => group.locked) && ungrouped.length === 0,
      groups: groupViews,
      ungrouped,
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
