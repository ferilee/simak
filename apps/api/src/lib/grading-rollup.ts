import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { countGradedByAttempt } from "./grading-progress";
import { isGradedAttempt, type GradeAttemptCandidate } from "./nilai-saya";
import { loadTeacherClassMemberships, resolveStudentClass } from "./student-class";

// Rollup status penilaian per penugasan untuk daftar pemantauan guru
// (Pantau Hasil + daftar penugasan Langkah 4): guru harus bisa melihat
// penugasan mana yang sudah selesai dinilai tanpa membuka satu per satu.
//
// Semantiknya meniru persis permukaan yang sudah ada — tidak ada aturan
// nilai baru:
//   - "dinilai" memakai predikat isGradedAttempt dari lib/nilai-saya
//     (status "dinilai" DAN total terisi), keadaan yang sama dengan yang
//     membuat nilai muncul di detail penugasan dan halaman Nilai Saya.
//   - Unit hitung mengikuti mode LKPD penugasan: individu → attempt
//     efektif per murid sasaran (attempt milik murid pada LKPD tertaut,
//     persis GET /grading/assignments/:id); kelompok → attempt kelompok
//     sebagai SATU unit (persis antrean GET /grading/attempts). Attempt
//     draf tidak pernah dihitung; attempt individu liar pada penugasan
//     kelompok (terdampar) tidak membuat unit tambahan.
//   - "sedang dicicil" (partial) = attempt terkumpul yang sebagian
//     butirnya sudah berskor tetapi totalnya belum terbit (Penilaian
//     Rapi) — dihitung dari baris jawaban berskor seperti penanda
//     "Dinilai X dari Y butir" pada daftar pengumpulan.
// Penyebut (submitted_count) hanya attempt terkumpul + dinilai, jadi
// pecahan "Dinilai X dari Y" selalu tentang pekerjaan yang sudah masuk.

const { assignmentClasses, assignmentGroups, assignmentStudents, classMembers, classes, modules, worksheetAnswers, worksheetAttempts, worksheets } = schema;

export type GradingStatus = "belum_ada_pengumpulan" | "belum_dinilai" | "sebagian" | "selesai";

export type GradingRollup = {
  submitted_count: number;
  graded_count: number;
  partial_count: number;
  grading_status: GradingStatus;
};

export type GradingRollupByClass = GradingRollup & { class_id: number };

export type AssignmentGradingView = GradingRollup & {
  by_class: GradingRollupByClass[];
};

export const EMPTY_GRADING_ROLLUP: GradingRollup = {
  submitted_count: 0,
  graded_count: 0,
  partial_count: 0,
  grading_status: "belum_ada_pengumpulan",
};

/**
 * Satu unit penilaian: attempt efektifnya (undefined = belum ada attempt)
 * dan jumlah butir yang sudah berskor pada attempt itu.
 */
export type GradingUnit = {
  attempt: GradeAttemptCandidate | undefined;
  gradedItemCount: number;
};

/** Status rollup dari dua hitungan inti — satu-satunya tempat aturannya hidup. */
export function deriveGradingStatus(submittedCount: number, gradedCount: number): GradingStatus {
  if (submittedCount <= 0) return "belum_ada_pengumpulan";
  if (gradedCount <= 0) return "belum_dinilai";
  if (gradedCount < submittedCount) return "sebagian";
  return "selesai";
}

/** Ringkas daftar unit menjadi rollup (murni; urutan unit tidak berpengaruh). */
export function summarizeGradingUnits(units: readonly GradingUnit[]): GradingRollup {
  let submitted = 0;
  let graded = 0;
  let partial = 0;
  for (const unit of units) {
    const attempt = unit.attempt;
    if (!attempt) continue;
    if (attempt.status !== "terkumpul" && attempt.status !== "dinilai") continue;
    submitted += 1;
    if (isGradedAttempt(attempt)) {
      graded += 1;
    } else if (attempt.status === "terkumpul" && unit.gradedItemCount > 0) {
      partial += 1;
    }
  }
  return {
    submitted_count: submitted,
    graded_count: graded,
    partial_count: partial,
    grading_status: deriveGradingStatus(submitted, graded),
  };
}

export type GradingRollupAssignmentLike = {
  id: number;
  moduleId: number | null;
  worksheetId: number | null;
  workMode: string;
  targetType: string;
};

type UnitBucket = Map<number, GradingUnit[]>; // classId (0 = tanpa konteks kelas) -> unit

function pushUnit(buckets: UnitBucket, classId: number, unit: GradingUnit) {
  const list = buckets.get(classId) ?? [];
  list.push(unit);
  buckets.set(classId, list);
}

/**
 * Muat rollup penilaian untuk banyak penugasan milik satu guru dalam
 * sejumlah kueri berkelompok (tanpa N+1 per penugasan). Penugasan tanpa
 * LKPD tidak muncul di peta hasil — pemanggil memakai rollup kosong.
 * Konteks kelas: murid sasaran kelas diatribusikan ke SATU kelas tujuan
 * (id terkecil di antara kelas tujuannya yang tidak diarsipkan, meniru
 * preferensi lib/student-class); murid sasaran langsung diatasi dengan
 * resolveStudentClass seperti tampilan sasaran yang sudah ada; kelompok
 * membawa kelasnya sendiri dari assignment_groups.
 */
export async function loadAssignmentGradingRollups(
  teacherId: number,
  assignmentRows: readonly GradingRollupAssignmentLike[],
): Promise<Map<number, AssignmentGradingView>> {
  const result = new Map<number, AssignmentGradingView>();
  const graded = assignmentRows.filter((row) => row.worksheetId !== null);
  if (graded.length === 0) return result;
  const assignmentIds = graded.map((row) => row.id);

  // Kelas tujuan per penugasan (semua tautan; keanggotaan di bawah yang
  // menyaring kelas arsip, persis GET /grading/assignments/:id).
  const linkRows = await db
    .select({ assignmentId: assignmentClasses.assignmentId, classId: assignmentClasses.classId })
    .from(assignmentClasses)
    .where(inArray(assignmentClasses.assignmentId, assignmentIds));
  const linkedClassIdsByAssignment = new Map<number, number[]>();
  const allLinkedClassIds = new Set<number>();
  for (const link of linkRows) {
    const list = linkedClassIdsByAssignment.get(link.assignmentId) ?? [];
    list.push(link.classId);
    linkedClassIdsByAssignment.set(link.assignmentId, list);
    allLinkedClassIds.add(link.classId);
  }

  // Murid sasaran lewat kelas: studentId -> classId per penugasan.
  const memberRows = allLinkedClassIds.size
    ? await db
        .select({ studentId: classMembers.studentId, classId: classMembers.classId })
        .from(classMembers)
        .innerJoin(classes, eq(classes.id, classMembers.classId))
        .where(and(inArray(classMembers.classId, [...allLinkedClassIds]), eq(classes.isArchived, false)))
    : [];
  const memberClassByStudent = new Map<string, number>();
  for (const row of memberRows) {
    // Atribusi deterministik: kelas dengan id terkecil menang untuk murid
    // yang kebetulan anggota dua kelas tujuan penugasan yang sama.
    for (const [assignmentId, classIds] of linkedClassIdsByAssignment) {
      if (!classIds.includes(row.classId)) continue;
      const key = `${assignmentId}:${row.studentId}`;
      const current = memberClassByStudent.get(key);
      if (current === undefined || row.classId < current) memberClassByStudent.set(key, row.classId);
    }
  }

  // Murid sasaran langsung (target_type "siswa") + mapel penugasan untuk
  // mengatasi kelas asal mereka.
  const siswaAssignments = graded.filter((row) => row.targetType === "siswa");
  const directByAssignment = new Map<number, number[]>();
  if (siswaAssignments.length > 0) {
    const directRows = await db
      .select({ assignmentId: assignmentStudents.assignmentId, studentId: assignmentStudents.studentId })
      .from(assignmentStudents)
      .where(inArray(assignmentStudents.assignmentId, siswaAssignments.map((row) => row.id)));
    for (const row of directRows) {
      const list = directByAssignment.get(row.assignmentId) ?? [];
      list.push(row.studentId);
      directByAssignment.set(row.assignmentId, list);
    }
  }
  const subjectByAssignment = new Map<number, string | null>();
  if (siswaAssignments.length > 0) {
    const moduleIds = [...new Set(siswaAssignments.flatMap((row) => (row.moduleId === null ? [] : [row.moduleId])))];
    const worksheetIds = [...new Set(siswaAssignments.flatMap((row) => (row.worksheetId === null ? [] : [row.worksheetId])))];
    const [moduleRows, worksheetRows] = await Promise.all([
      moduleIds.length
        ? db.select({ id: modules.id, subject: modules.subject }).from(modules).where(inArray(modules.id, moduleIds))
        : Promise.resolve([] as { id: number; subject: string }[]),
      worksheetIds.length
        ? db.select({ id: worksheets.id, moduleId: worksheets.moduleId }).from(worksheets).where(inArray(worksheets.id, worksheetIds))
        : Promise.resolve([] as { id: number; moduleId: number }[]),
    ]);
    const subjectByModule = new Map(moduleRows.map((row) => [row.id, row.subject]));
    const worksheetModuleIds = [...new Set(worksheetRows.flatMap((row) => (row.moduleId === null ? [] : [row.moduleId])))];
    const worksheetModuleRows = worksheetModuleIds.length
      ? await db.select({ id: modules.id, subject: modules.subject }).from(modules).where(inArray(modules.id, worksheetModuleIds))
      : [];
    for (const row of worksheetModuleRows) subjectByModule.set(row.id, row.subject);
    const moduleByWorksheet = new Map(worksheetRows.map((row) => [row.id, row.moduleId]));
    for (const row of siswaAssignments) {
      const subject = row.moduleId !== null
        ? (subjectByModule.get(row.moduleId) ?? null)
        : (subjectByModule.get(moduleByWorksheet.get(row.worksheetId!) ?? -1) ?? null);
      subjectByAssignment.set(row.id, subject);
    }
  }
  const membershipsByStudent = siswaAssignments.length > 0 ? await loadTeacherClassMemberships(teacherId) : new Map();

  // Sasaran per penugasan: studentId -> classId (0 = tanpa konteks kelas).
  const targetsByAssignment = new Map<number, Map<number, number>>();
  for (const row of graded) {
    const targets = new Map<number, number>();
    if (row.targetType === "siswa") {
      for (const studentId of directByAssignment.get(row.id) ?? []) {
        const resolved = resolveStudentClass(membershipsByStudent.get(studentId) ?? [], subjectByAssignment.get(row.id) ?? null);
        targets.set(studentId, resolved?.id ?? 0);
      }
    } else {
      for (const [key, classId] of memberClassByStudent) {
        const [assignmentIdText, studentIdText] = key.split(":");
        if (Number(assignmentIdText) === row.id) targets.set(Number(studentIdText), classId);
      }
    }
    targetsByAssignment.set(row.id, targets);
  }

  // Kelompok per penugasan (unit mode kelompok; kelasnya dari baris kelompok).
  const groupRows = await db
    .select({ id: assignmentGroups.id, assignmentId: assignmentGroups.assignmentId, classId: assignmentGroups.classId })
    .from(assignmentGroups)
    .where(inArray(assignmentGroups.assignmentId, assignmentIds));
  const groupsByAssignment = new Map<number, { id: number; classId: number }[]>();
  for (const row of groupRows) {
    const list = groupsByAssignment.get(row.assignmentId) ?? [];
    list.push({ id: row.id, classId: row.classId });
    groupsByAssignment.set(row.assignmentId, list);
  }

  // Attempt individu (unik per LKPD+murid) dan attempt kelompok (unik per
  // LKPD+kelompok) untuk seluruh sasaran di atas.
  const worksheetIds = [...new Set(graded.map((row) => row.worksheetId!))];
  const allStudentIds = [...new Set([...targetsByAssignment.values()].flatMap((targets) => [...targets.keys()]))];
  const allGroupIds = groupRows.map((row) => row.id);
  const [individualAttempts, groupAttempts] = await Promise.all([
    allStudentIds.length
      ? db
          .select({ id: worksheetAttempts.id, worksheetId: worksheetAttempts.worksheetId, studentId: worksheetAttempts.studentId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore, updatedAt: worksheetAttempts.updatedAt })
          .from(worksheetAttempts)
          .where(and(inArray(worksheetAttempts.worksheetId, worksheetIds), inArray(worksheetAttempts.studentId, allStudentIds)))
      : Promise.resolve([] as { id: number; worksheetId: number; studentId: number | null; status: "draf" | "terkumpul" | "dinilai"; submittedAt: Date | null; totalScore: string | null; updatedAt: Date }[]),
    allGroupIds.length
      ? db
          .select({ id: worksheetAttempts.id, groupId: worksheetAttempts.groupId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore, updatedAt: worksheetAttempts.updatedAt })
          .from(worksheetAttempts)
          .where(inArray(worksheetAttempts.groupId, allGroupIds))
      : Promise.resolve([] as { id: number; groupId: number | null; status: "draf" | "terkumpul" | "dinilai"; submittedAt: Date | null; totalScore: string | null; updatedAt: Date }[]),
  ]);
  const individualByKey = new Map<string, GradeAttemptCandidate & { id: number }>();
  for (const attempt of individualAttempts) {
    if (attempt.studentId !== null) individualByKey.set(`${attempt.worksheetId}:${attempt.studentId}`, attempt);
  }
  const groupById = new Map<number, GradeAttemptCandidate & { id: number }>();
  for (const attempt of groupAttempts) {
    if (attempt.groupId !== null) groupById.set(attempt.groupId, attempt);
  }

  // Butir berskor per attempt (penanda cicilan Penilaian Rapi).
  const allAttemptIds = [...individualAttempts.map((row) => row.id), ...groupAttempts.map((row) => row.id)];
  const gradedRows = allAttemptIds.length
    ? await db
        .select({ attemptId: worksheetAnswers.attemptId })
        .from(worksheetAnswers)
        .where(and(inArray(worksheetAnswers.attemptId, allAttemptIds), isNotNull(worksheetAnswers.score)))
    : [];
  const gradedByAttempt = countGradedByAttempt(gradedRows);

  for (const row of graded) {
    const combined: GradingUnit[] = [];
    const buckets: UnitBucket = new Map();
    const addUnit = (classId: number, attempt: (GradeAttemptCandidate & { id: number }) | undefined) => {
      const unit: GradingUnit = { attempt, gradedItemCount: attempt ? (gradedByAttempt.get(attempt.id) ?? 0) : 0 };
      combined.push(unit);
      pushUnit(buckets, classId, unit);
    };
    if (row.workMode === "kelompok") {
      for (const group of groupsByAssignment.get(row.id) ?? []) {
        addUnit(group.classId, groupById.get(group.id));
      }
    } else {
      for (const [studentId, classId] of targetsByAssignment.get(row.id) ?? []) {
        addUnit(classId, individualByKey.get(`${row.worksheetId}:${studentId}`));
      }
    }
    const rollup = summarizeGradingUnits(combined);
    // Rincian per kelas: semua kelas tujuan selalu hadir (walau kosong)
    // agar konteks kelas di UI tidak pernah menebak; kelas dari unit
    // (kelompok/sasaran langsung) ikut bila belum ada.
    const classIds = new Set<number>([...(linkedClassIdsByAssignment.get(row.id) ?? []), ...buckets.keys()]);
    const byClass: GradingRollupByClass[] = [...classIds]
      .filter((classId) => classId > 0)
      .sort((a, b) => a - b)
      .map((classId) => ({ class_id: classId, ...summarizeGradingUnits(buckets.get(classId) ?? []) }));
    result.set(row.id, { ...rollup, by_class: byClass });
  }
  return result;
}
