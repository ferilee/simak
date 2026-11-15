// Urutan ATP + kunci berurutan penugasan murid (v1.0.63).
//
// Gagasan: penugasan yang terlihat oleh seorang murid dikelompokkan per
// RANTAI = (mapel modul, kelompok materi/topic_group modul). Di dalam
// satu rantai, penugasan diurutkan menaik menurut nomor ATP modulnya dan
// penugasan berikutnya TERKUNCI sampai penugasan sebelumnya selesai —
// murid menuntaskan ATP 1.1 dulu, baru ATP 1.2 terbuka. Antar-rantai
// tidak saling mengunci (ATP 1.1 Matematika dan ATP 1.1 KKA adalah dua
// hal berbeda), dan penugasan di luar rantai tidak pernah terkunci dan
// tidak mengunci siapa pun.
//
// Nomor ATP diturunkan dari JUDUL modul dengan pola yang sama persis
// dengan pemilih cepat penugasan guru (apps/web/lib/pemilih-cepat.ts,
// parseAtpCode — label "Pasangan ATP x.y"): pola "ATP x.y" pada judul.
// Tidak ada skema penautan baru dan TANPA migrasi: semua keadaan
// diturunkan dari data yang sudah ada (penugasan terbit yang menjadi
// sasaran murid, sinyal baca_materi_tuntas per modul, dan status attempt
// LKPD efektif murid itu — sinyal yang sama dengan kartu beranda
// /murid/today).
//
// Modul ini berisi perencana MURNI (dapat diuji tanpa basis data) dan
// satu pemuat DB yang merakit masukan perencana dari baris nyata.
// Server adalah satu-satunya sumber kebenaran status kunci; klien
// hanya menggambar ulang hasil rencana ini.

import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { loadStudentGroup, pickEffectiveAttempt } from "./groups";

const { activityLogs, assignmentClasses, assignmentStudents, assignments, classMembers, classes, modules, worksheetAttempts } = schema;

// ---------------------------------------------------------------------------
// Penurunan nomor ATP dari judul modul (cermin parseAtpCode sisi web).
// ---------------------------------------------------------------------------

export type AtpParts = { major: number; minor: number; code: string };

/**
 * Nomor ATP dari judul modul: pola "ATP 2.4" (pada judul modul biasanya
 * tertulis "(ATP 2.4)"). Mengembalikan komponen numerik + kode persis
 * seperti tertulis ternormalisasi "major.minor", atau null bila judul
 * tidak memuat pola ATP.
 */
export function parseAtpParts(title: string | null | undefined): AtpParts | null {
  if (!title) return null;
  const match = /ATP\s+(\d+)\.(\d+)/i.exec(title);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return { major, minor, code: `${major}.${minor}` };
}

/** Label tampil nomor ATP, mis. "ATP 1.2"; null bila tak berkode. */
export function atpLabelOf(title: string | null | undefined): string | null {
  const parts = parseAtpParts(title);
  return parts ? `ATP ${parts.code}` : null;
}

// ---------------------------------------------------------------------------
// Perencana murni: rantai, urutan global, dan kunci.
// ---------------------------------------------------------------------------

export type ChainAssignmentInput = {
  id: number;
  title: string;
  moduleId: number | null;
  worksheetId: number | null;
  /** Judul modul tertaut — sumber nomor ATP (pola parseAtpParts). */
  moduleTitle: string | null;
  /** Mapel modul tertaut (modules.subject). */
  moduleSubject: string | null;
  /** Kelompok materi modul tertaut (modules.topic_group, mentah). */
  topicGroup: string | null;
  dueAtMs: number;
  opensAtMs: number;
  /** Sinyal ketuntasan materi per modul (baca_materi_tuntas murid ini). */
  materialCompleted: boolean;
  /** Attempt LKPD efektif murid ini berstatus terkumpul/dinilai. */
  attemptSubmitted: boolean;
};

export type PlannedAssignment = ChainAssignmentInput & {
  /** Posisi 1-based pada urutan global daftar murid ini. */
  position: number;
  atpCode: string | null;
  atpLabel: string | null;
  /** Kunci rantai "mapel|kelompok"; null untuk penugasan bebas. */
  chainKey: string | null;
  completed: boolean;
  locked: boolean;
  /** Penugasan penghambat: yang terawal belum selesai di rantai yang sama. */
  lockedById: number | null;
  lockedByTitle: string | null;
};

function cleanTopicGroup(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/** Kunci rantai dari mapel + kelompok materi; null bila salah satu kosong. */
export function chainKeyOf(subject: string | null | undefined, topicGroup: string | null | undefined): string | null {
  const cleanSubject = (subject ?? "").trim();
  const cleanGroup = cleanTopicGroup(topicGroup);
  if (!cleanSubject || !cleanGroup) return null;
  return `${cleanSubject}|${cleanGroup}`;
}

type Decorated = ChainAssignmentInput & {
  atp: AtpParts | null;
  chainKey: string | null;
  completed: boolean;
};

function decorate(input: ChainAssignmentInput): Decorated {
  const topicGroup = cleanTopicGroup(input.topicGroup);
  const atp = parseAtpParts(input.moduleTitle);
  // Syarat masuk rantai: ada modul tertaut, kelompok materi terisi dan
  // bukan "Lainnya", dan nomor ATP modul bisa diturunkan dari judulnya.
  const chainKey =
    input.moduleId !== null && topicGroup !== null && topicGroup !== "Lainnya" && atp !== null
      ? chainKeyOf(input.moduleSubject, topicGroup)
      : null;
  // Definisi SELESAI (tegas): materi tuntas DAN attempt LKPD terkumpul.
  // Syarat yang tidak berlaku tidak menghalangi: penugasan tanpa modul
  // tidak menuntut ketuntasan materi, penugasan tanpa LKPD tidak
  // menuntut attempt. Exit ticket TIDAK termasuk syarat.
  const completed =
    (input.moduleId === null || input.materialCompleted) &&
    (input.worksheetId === null || input.attemptSubmitted);
  // Label ATP mengikuti judul modul apa adanya (tampil juga pada
  // penugasan bebas bermodul berkode ATP, mis. kelompok "Lainnya");
  // yang menentukan keanggotaan rantai hanya chainKey di atas.
  return { ...input, atp, chainKey, completed };
}

function byAtpThenSchedule(a: Decorated, b: Decorated): number {
  const atpA = a.atp!;
  const atpB = b.atp!;
  if (atpA.major !== atpB.major) return atpA.major - atpB.major;
  if (atpA.minor !== atpB.minor) return atpA.minor - atpB.minor;
  if (a.dueAtMs !== b.dueAtMs) return a.dueAtMs - b.dueAtMs;
  if (a.opensAtMs !== b.opensAtMs) return a.opensAtMs - b.opensAtMs;
  return a.id - b.id;
}

function bySchedule(a: Decorated, b: Decorated): number {
  if (a.dueAtMs !== b.dueAtMs) return a.dueAtMs - b.dueAtMs;
  if (a.opensAtMs !== b.opensAtMs) return a.opensAtMs - b.opensAtMs;
  return a.id - b.id;
}

/**
 * Susun rencana urutan + kunci untuk seluruh penugasan yang terlihat
 * oleh seorang murid.
 *
 * Urutan global: rantai-rantai lebih dulu (di dalam rantai menurut ATP
 * menaik), sesudahnya penugasan bebas menurut tenggat terdekat. Urutan
 * antar-rantai menurut tenggat penugasan BELUM-SELESAI terawal di
 * rantai itu (yang paling mendesak dulu); rantai yang semua
 * penugasannya selesai ditaruh sesudah rantai yang masih punya
 * pekerjaan. Semua perbandingan berakhir pada kunci deterministik
 * (tenggat → waktu buka → id / kunci rantai) agar hasil tidak
 * bergantung pada urutan masukan.
 *
 * Kunci: di dalam rantai, penugasan terkunci bila ada penugasan lebih
 * awal yang belum selesai; penghambat yang dilaporkan adalah penugasan
 * belum-selesai TERAWAL di rantai itu. Penugasan pertama rantai tidak
 * pernah terkunci. Penugasan yang sudah selesai tidak pernah terkunci
 * (tetap bisa dibuka untuk dibaca ulang) walaupun pendahulunya belum
 * selesai — mis. data lama dari sebelum fitur ini ada.
 */
export function planAssignmentChains(inputs: readonly ChainAssignmentInput[]): PlannedAssignment[] {
  const decorated = inputs.map(decorate);
  const chains = new Map<string, Decorated[]>();
  const free: Decorated[] = [];
  for (const item of decorated) {
    if (item.chainKey === null) {
      free.push(item);
    } else {
      const bucket = chains.get(item.chainKey) ?? [];
      bucket.push(item);
      chains.set(item.chainKey, bucket);
    }
  }

  type ChainPlan = {
    key: string;
    items: Decorated[];
    /** Tenggat penugasan belum-selesai terawal; null bila semua selesai. */
    earliestOpenDueMs: number | null;
    earliestDueMs: number;
  };
  const chainPlans: ChainPlan[] = [];
  const lockById = new Map<number, { lockedById: number; lockedByTitle: string }>();
  for (const [key, items] of chains) {
    const ordered = [...items].sort(byAtpThenSchedule);
    const firstIncomplete = ordered.find((item) => !item.completed) ?? null;
    if (firstIncomplete) {
      // Semua penugasan sebelum firstIncomplete sudah selesai menurut
      // definisi find() di atas, jadi yang mungkin terkunci hanya yang
      // sesudahnya — dan penghambatnya selalu firstIncomplete itu
      // sendiri (yang terawal belum selesai).
      for (let index = ordered.indexOf(firstIncomplete) + 1; index < ordered.length; index++) {
        const item = ordered[index]!;
        if (item.completed) continue; // selesai tidak pernah terkunci
        lockById.set(item.id, { lockedById: firstIncomplete.id, lockedByTitle: firstIncomplete.title });
      }
    }
    chainPlans.push({
      key,
      items: ordered,
      earliestOpenDueMs: firstIncomplete ? firstIncomplete.dueAtMs : null,
      earliestDueMs: Math.min(...ordered.map((item) => item.dueAtMs)),
    });
  }
  chainPlans.sort((a, b) => {
    const aOpen = a.earliestOpenDueMs !== null;
    const bOpen = b.earliestOpenDueMs !== null;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const aDue = a.earliestOpenDueMs ?? a.earliestDueMs;
    const bDue = b.earliestOpenDueMs ?? b.earliestDueMs;
    if (aDue !== bDue) return aDue - bDue;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const orderedAll: Decorated[] = [
    ...chainPlans.flatMap((plan) => plan.items),
    ...[...free].sort(bySchedule),
  ];
  return orderedAll.map((item, index) => {
    const lock = lockById.get(item.id) ?? null;
    return {
      ...item,
      position: index + 1,
      atpCode: item.atp ? item.atp.code : null,
      atpLabel: item.atp ? `ATP ${item.atp.code}` : null,
      chainKey: item.chainKey,
      completed: item.completed,
      locked: lock !== null,
      lockedById: lock?.lockedById ?? null,
      lockedByTitle: lock?.lockedByTitle ?? null,
    };
  });
}

/**
 * Keadaan kunci sebuah penugasan dari rencana; null bila penugasan itu
 * tidak ada pada daftar murid ini (bukan sasarannya / tidak terbit).
 */
export function planForAssignment(plan: readonly PlannedAssignment[], assignmentId: number): PlannedAssignment | null {
  return plan.find((item) => item.id === assignmentId) ?? null;
}

/**
 * Keadaan kunci sebuah MODUL untuk akses tanpa konteks penugasan
 * (halaman modul langsung, pencatatan tuntas baca): modul terkunci
 * hanya bila minimal satu penugasan murid ini memuat modul itu DAN
 * semuanya terkunci. Modul tanpa penugasan pada daftar (mis. hanya
 * tertaut penugasan ditutup) tidak terkunci. Penghambat yang
 * dilaporkan mengikuti penugasan bermodul itu yang posisinya terawal.
 */
export function planModuleLock(
  plan: readonly PlannedAssignment[],
  moduleId: number,
): { locked: boolean; lockedByTitle: string | null } {
  const related = plan.filter((item) => item.moduleId === moduleId);
  if (related.length === 0) return { locked: false, lockedByTitle: null };
  if (!related.every((item) => item.locked)) return { locked: false, lockedByTitle: null };
  const earliest = [...related].sort((a, b) => a.position - b.position)[0]!;
  return { locked: true, lockedByTitle: earliest.lockedByTitle };
}

/**
 * Penugasan wakil sebuah modul pada urutan global (posisi terawal di
 * antara penugasan murid ini yang memuat modul itu) — dasar pengurutan
 * daftar materi murid mengikuti urutan penugasan. Null bila modul tidak
 * dimuat penugasan mana pun pada daftar.
 */
export function planModuleRepresentative(
  plan: readonly PlannedAssignment[],
  moduleId: number,
): PlannedAssignment | null {
  let best: PlannedAssignment | null = null;
  for (const item of plan) {
    if (item.moduleId !== moduleId) continue;
    if (best === null || item.position < best.position) best = item;
  }
  return best;
}

/** Pesan 403 untuk penugasan terkunci (konteks penugasan eksplisit). */
export function assignmentLockedMessage(lockedByTitle: string | null): string {
  return lockedByTitle
    ? `Penugasan ini masih terkunci. Selesaikan dulu: ${lockedByTitle}.`
    : "Penugasan ini masih terkunci. Selesaikan dulu penugasan sebelumnya.";
}

/** Pesan 403 untuk materi terkunci (akses modul tanpa konteks penugasan). */
export function moduleLockedMessage(lockedByTitle: string | null): string {
  return lockedByTitle
    ? `Materi ini masih terkunci. Selesaikan dulu: ${lockedByTitle}.`
    : "Materi ini masih terkunci. Selesaikan dulu penugasan sebelumnya.";
}

// ---------------------------------------------------------------------------
// Pemuat DB: rakit rencana seorang murid dari baris nyata. Himpunan
// penugasannya persis daftar /murid/today (terbit + sasaran murid —
// jalur kelas tak terarsip atau sasaran langsung), dan sinyal
// penyelesaiannya persis sinyal kartu beranda (ketuntasan materi per
// modul dari baca_materi_tuntas; attempt efektif dari pickEffectiveAttempt
// atas attempt individu + attempt kelompok murid ini).
// ---------------------------------------------------------------------------

export async function loadStudentAssignmentPlan(studentId: number): Promise<PlannedAssignment[]> {
  const memberships = await db
    .select({ id: classes.id })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.studentId, studentId), eq(classes.isArchived, false)));
  const classIds = memberships.map((membership) => membership.id);
  const assignmentRows = classIds.length
    ? await db
        .select()
        .from(assignments)
        .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
        .where(and(eq(assignments.status, "terbit"), inArray(assignmentClasses.classId, classIds)))
    : [];
  const directRows = await db
    .select()
    .from(assignments)
    .innerJoin(assignmentStudents, eq(assignmentStudents.assignmentId, assignments.id))
    .where(and(eq(assignments.status, "terbit"), eq(assignmentStudents.studentId, studentId)));
  const uniqueAssignments = [...new Map([...assignmentRows, ...directRows].map((row) => [row.assignments.id, row.assignments])).values()];

  const moduleIds = [...new Set(uniqueAssignments.flatMap((assignment) => (assignment.moduleId === null ? [] : [assignment.moduleId])))];
  const moduleRows = moduleIds.length
    ? await db
        .select({ id: modules.id, title: modules.title, subject: modules.subject, topicGroup: modules.topicGroup })
        .from(modules)
        .where(inArray(modules.id, moduleIds))
    : [];
  const moduleById = new Map(moduleRows.map((row) => [row.id, row]));

  // Sinyal ketuntasan materi per modul — predikat yang sama dengan
  // /murid/today dan GET /murid/modules/:id. Pola gagal-aman yang sama
  // dengan beranda: kegagalan query → himpunan kosong (materi tampil
  // belum tuntas), tidak pernah menggagalkan pemuatan rencana.
  let completedMaterialModuleIds = new Set<number>();
  try {
    if (moduleIds.length > 0) {
      const rows = await db
        .select({ moduleId: activityLogs.moduleId })
        .from(activityLogs)
        .where(and(eq(activityLogs.studentId, studentId), eq(activityLogs.event, "baca_materi_tuntas"), inArray(activityLogs.moduleId, moduleIds)));
      completedMaterialModuleIds = new Set(rows.flatMap((row) => (row.moduleId === null ? [] : [row.moduleId])));
    }
  } catch {
    // Abaikan — materi dianggap belum tuntas.
  }

  const worksheetIds = [...new Set(uniqueAssignments.flatMap((assignment) => (assignment.worksheetId === null ? [] : [assignment.worksheetId])))];
  const individualAttempts = worksheetIds.length
    ? await db
        .select({ worksheetId: worksheetAttempts.worksheetId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt })
        .from(worksheetAttempts)
        .where(and(eq(worksheetAttempts.studentId, studentId), inArray(worksheetAttempts.worksheetId, worksheetIds)))
    : [];
  const individualByWorksheet = new Map(individualAttempts.map((attempt) => [attempt.worksheetId, attempt]));

  // Attempt kelompok murid ini per penugasan kelompok — jalur yang sama
  // dengan /murid/today (loadStudentGroup lalu attempt bersama
  // kelompoknya). Murid yang belum berkelompok tidak punya attempt
  // kelompok: attempt efektifnya tinggal attempt individunya.
  const groupAttemptByAssignment = new Map<number, { status: "draf" | "terkumpul" | "dinilai"; submittedAt: Date | null; totalScore: string | null }>();
  await Promise.all(uniqueAssignments.filter((assignment) => assignment.workMode === "kelompok").map(async (assignment) => {
    const group = await loadStudentGroup(assignment.id, studentId);
    if (!group || assignment.worksheetId === null) return;
    const [groupAttempt] = await db
      .select({ status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore })
      .from(worksheetAttempts)
      .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), eq(worksheetAttempts.groupId, group.id)))
      .limit(1);
    if (groupAttempt) {
      groupAttemptByAssignment.set(assignment.id, {
        status: groupAttempt.status,
        submittedAt: groupAttempt.submittedAt,
        totalScore: groupAttempt.totalScore === null ? null : String(groupAttempt.totalScore),
      });
    }
  }));

  const inputs: ChainAssignmentInput[] = uniqueAssignments.map((assignment) => {
    const individual = assignment.worksheetId === null ? undefined : individualByWorksheet.get(assignment.worksheetId);
    const individualSnapshot = individual
      ? { status: individual.status, submittedAt: individual.submittedAt, totalScore: null }
      : undefined;
    const effective = assignment.workMode === "kelompok"
      ? pickEffectiveAttempt(individualSnapshot, groupAttemptByAssignment.get(assignment.id))
      : individualSnapshot;
    const module = assignment.moduleId === null ? undefined : moduleById.get(assignment.moduleId);
    return {
      id: assignment.id,
      title: assignment.title,
      moduleId: assignment.moduleId,
      worksheetId: assignment.worksheetId,
      moduleTitle: module?.title ?? null,
      moduleSubject: module?.subject ?? null,
      topicGroup: module?.topicGroup ?? null,
      dueAtMs: assignment.dueAt.getTime(),
      opensAtMs: assignment.opensAt.getTime(),
      materialCompleted: assignment.moduleId !== null && completedMaterialModuleIds.has(assignment.moduleId),
      attemptSubmitted: effective !== undefined && (effective.status === "terkumpul" || effective.status === "dinilai"),
    };
  });
  return planAssignmentChains(inputs);
}

/** Keadaan kunci satu penugasan untuk murid ini; null bila bukan penugasan murid ini. */
export async function loadAssignmentLock(studentId: number, assignmentId: number): Promise<PlannedAssignment | null> {
  return planForAssignment(await loadStudentAssignmentPlan(studentId), assignmentId);
}

/** Keadaan kunci satu modul untuk murid ini (aturan semua-terkunci). */
export async function loadModuleLock(
  studentId: number,
  moduleId: number,
): Promise<{ locked: boolean; lockedByTitle: string | null }> {
  return planModuleLock(await loadStudentAssignmentPlan(studentId), moduleId);
}
