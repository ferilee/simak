import { Hono } from "hono";
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { contributionRatingsSchema, exitTicketSchema, presenceHeartbeatSchema, worksheetAnswersSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { fetchRuasQuizCompleted, parseRuasQuizUrl } from "../lib/ruas-status";
import { presenceSnapshot, presenceStore, recordHeartbeat } from "../lib/presence";
import { listVisibleModuleIds, studentCanAccessModule, studentIsAssignmentTarget } from "../lib/assignment-target";
import { contributionWindowOpen, loadMemberScoreOverride, loadStudentGroup, pickEffectiveAttempt, type AttemptSnapshot } from "../lib/groups";
import { buildStudentGradeRow, chooseGradeAttempt, sortGradeRows, type GradeAttemptCandidate } from "../lib/nilai-saya";
import { isSameAnswerValue, unansweredOrdinals, type SubmitGateAnswer } from "../lib/submit-gate";

// Beranda murid + detail penugasan — halaman paling ringan adalah prioritas.
export const muridRoutes = new Hono();

muridRoutes.use("*", requireRole("murid"));

const { activityLogs, assignmentClasses, assignmentStudents, assignments, classes, classMembers, exitTickets, groupContributionRatings, moduleBlocks, modules, users, worksheetAnswers, worksheetAttemptMemberScores, worksheetAttempts, worksheetItems, worksheets } = schema;

type StudentGroupView = NonNullable<Awaited<ReturnType<typeof loadStudentGroup>>>;

// Penugasan terbit yang boleh diakses murid ini: murid adalah sasaran
// penugasan — anggota salah satu kelas tujuannya ATAU tercatat sebagai
// murid sasaran langsung (penugasan "siswa tertentu"). Pemeriksaan sasaran
// terpusat di lib/assignment-target.ts; semua permukaan murid berbasis
// penugasan (detail, exit ticket, resolusi attempt, konteks kuis RUAS)
// melewati fungsi ini.
async function accessibleAssignment(studentId: number, assignmentId: number) {
  const [assignment] = await db
    .select({
      id: assignments.id,
      teacherId: assignments.teacherId,
      moduleId: assignments.moduleId,
      worksheetId: assignments.worksheetId,
      title: assignments.title,
      instructions: assignments.instructions,
      ruasQuizUrl: assignments.ruasQuizUrl,
      workMode: assignments.workMode,
      opensAt: assignments.opensAt,
      dueAt: assignments.dueAt,
      status: assignments.status,
    })
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.status, "terbit")))
    .limit(1);
  if (!assignment) return undefined;
  if (!(await studentIsAssignmentTarget(assignmentId, studentId))) return undefined;
  return assignment;
}

function assignmentProgress(assignment: { opensAt: Date; dueAt: Date }, attempt?: { status: "draf" | "terkumpul" | "dinilai"; submittedAt?: Date | null } | undefined) {
  if (attempt?.status === "dinilai") return "dinilai" as const;
  if (attempt?.status === "terkumpul") return attempt.submittedAt && attempt.submittedAt.getTime() > assignment.dueAt.getTime() ? "terlambat" as const : "terkumpul" as const;
  if (attempt?.status === "draf") return "draf" as const;
  const now = Date.now();
  if (now < assignment.opensAt.getTime()) return "belum_dibuka" as const;
  if (now > assignment.dueAt.getTime()) return "terlambat" as const;
  return "belum" as const;
}

function serializeAssignmentForStudent(
  assignment: { id: number; moduleId: number | null; worksheetId: number | null; title: string; instructions: string | null; ruasQuizUrl: string | null; workMode?: "individu" | "kelompok"; opensAt: Date; dueAt: Date; status: "draf" | "terbit" | "ditutup" },
  progress: string,
  group?: StudentGroupView | null,
) {
  return {
    id: assignment.id,
    module_id: assignment.moduleId,
    worksheet_id: assignment.worksheetId,
    title: assignment.title,
    instructions: assignment.instructions,
    ruas_quiz_url: assignment.ruasQuizUrl,
    work_mode: assignment.workMode ?? "individu",
    opens_at: assignment.opensAt,
    due_at: assignment.dueAt,
    status: assignment.status,
    progress,
    // Kelompok murid yang meminta (mode kelompok saja) — kelompok lain
    // pada penugasan yang sama tidak pernah ikut terkirim.
    ...(group !== undefined ? { group } : {}),
  };
}

async function accessibleWorksheet(studentId: number, worksheetId: number) {
  const [worksheet] = await db
    .select({
      id: worksheets.id,
      moduleId: worksheets.moduleId,
      title: worksheets.title,
      instructions: worksheets.instructions,
      status: worksheets.status,
      moduleTeacherId: modules.teacherId,
      moduleSubject: modules.subject,
    })
    .from(worksheets)
    .leftJoin(modules, eq(modules.id, worksheets.moduleId))
    .where(and(eq(worksheets.id, worksheetId), eq(worksheets.status, "terbit")))
    .limit(1);
  if (!worksheet?.moduleId || worksheet.moduleTeacherId === null || worksheet.moduleSubject === null) return null;

  const [access] = await db
    .select({ id: classMembers.id })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(
      and(
        eq(classMembers.studentId, studentId),
        eq(classes.isArchived, false),
        or(eq(classes.teacherId, worksheet.moduleTeacherId), eq(classes.subject, worksheet.moduleSubject)),
      ),
    )
    .limit(1);
  return access ? worksheet : null;
}

async function getOrCreateAttempt(studentId: number, worksheetId: number) {
  const [existing] = await db
    .select()
    .from(worksheetAttempts)
    .where(and(eq(worksheetAttempts.studentId, studentId), eq(worksheetAttempts.worksheetId, worksheetId)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(worksheetAttempts).values({ studentId, worksheetId }).$returningId();
  const [attempt] = await db.select().from(worksheetAttempts).where(eq(worksheetAttempts.id, created!.id)).limit(1);
  return attempt!;
}

async function getOrCreateGroupAttempt(worksheetId: number, groupId: number) {
  const [existing] = await db
    .select()
    .from(worksheetAttempts)
    .where(and(eq(worksheetAttempts.worksheetId, worksheetId), eq(worksheetAttempts.groupId, groupId)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(worksheetAttempts).values({ worksheetId, groupId }).$returningId();
  const [attempt] = await db.select().from(worksheetAttempts).where(eq(worksheetAttempts.id, created!.id)).limit(1);
  return attempt!;
}

type AttemptContext =
  | { kind: "ready"; attempt: typeof worksheetAttempts.$inferSelect; group: StudentGroupView | null }
  | { kind: "ungrouped" }
  | { kind: "error"; status: 400 | 404; message: string };

// Resolusi attempt untuk endpoint LKPD murid. Tanpa konteks penugasan —
// atau penugasannya individu — perilakunya persis seperti sebelumnya:
// attempt individu murid itu sendiri. Dengan konteks penugasan kelompok,
// attempt yang dipakai adalah attempt BERSAMA kelompok murid tersebut;
// murid yang belum masuk kelompok mana pun pada penugasan itu mendapat
// keadaan "ungrouped" dan tidak dibuatkan attempt apa pun.
async function resolveAttemptContext(studentId: number, worksheetId: number, assignmentIdParam: string | null): Promise<AttemptContext> {
  if (!assignmentIdParam) {
    return { kind: "ready", attempt: await getOrCreateAttempt(studentId, worksheetId), group: null };
  }
  const assignmentId = Number(assignmentIdParam);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { kind: "error", status: 400, message: "ID penugasan tidak valid." };
  }
  const assignment = await accessibleAssignment(studentId, assignmentId);
  if (!assignment) {
    return { kind: "error", status: 404, message: "Penugasan belum tersedia untuk kelas Anda." };
  }
  if (assignment.worksheetId !== worksheetId) {
    return { kind: "error", status: 400, message: "Penugasan ini tidak terhubung ke LKPD ini." };
  }
  if (assignment.workMode !== "kelompok") {
    return { kind: "ready", attempt: await getOrCreateAttempt(studentId, worksheetId), group: null };
  }
  const group = await loadStudentGroup(assignmentId, studentId);
  if (!group) return { kind: "ungrouped" };
  return { kind: "ready", attempt: await getOrCreateGroupAttempt(worksheetId, group.id), group };
}

type ExistingGroupAttemptContext =
  | { kind: "ready"; attempt: typeof worksheetAttempts.$inferSelect | null; group: StudentGroupView }
  | { kind: "ungrouped" }
  | { kind: "error"; status: 400 | 404; message: string };

// Resolusi konteks kelompok TANPA membuat attempt — untuk penilaian
// kontribusi (Tahap 2), yang hanya bermakna pada attempt kelompok yang
// sudah ada. Konteks non-kelompok selalu berujung error di sini.
async function resolveExistingGroupAttempt(studentId: number, worksheetId: number, assignmentIdParam: string | null): Promise<ExistingGroupAttemptContext> {
  if (!assignmentIdParam) {
    return { kind: "error", status: 400, message: "Penilaian kontribusi hanya tersedia pada penugasan kelompok." };
  }
  const assignmentId = Number(assignmentIdParam);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { kind: "error", status: 400, message: "ID penugasan tidak valid." };
  }
  const assignment = await accessibleAssignment(studentId, assignmentId);
  if (!assignment) {
    return { kind: "error", status: 404, message: "Penugasan belum tersedia untuk kelas Anda." };
  }
  if (assignment.worksheetId !== worksheetId) {
    return { kind: "error", status: 400, message: "Penugasan ini tidak terhubung ke LKPD ini." };
  }
  if (assignment.workMode !== "kelompok") {
    return { kind: "error", status: 400, message: "Penugasan ini bukan penugasan kelompok." };
  }
  const group = await loadStudentGroup(assignmentId, studentId);
  if (!group) return { kind: "ungrouped" };
  const [attempt] = await db
    .select()
    .from(worksheetAttempts)
    .where(and(eq(worksheetAttempts.worksheetId, worksheetId), eq(worksheetAttempts.groupId, group.id)))
    .limit(1);
  return { kind: "ready", attempt: attempt ?? null, group };
}

// Keadaan formulir penilaian kontribusi untuk murid yang meminta: hanya
// nilai yang IA berikan ke tiap teman yang terkirim — penilaian orang lain
// dan rata-rata tidak pernah keluar lewat endpoint murid.
async function contributionRatingsState(studentId: number, context: { attempt: typeof worksheetAttempts.$inferSelect | null; group: StudentGroupView }) {
  const myRatings = context.attempt
    ? await db
        .select({ rateeStudentId: groupContributionRatings.rateeStudentId, score: groupContributionRatings.score })
        .from(groupContributionRatings)
        .where(and(
          eq(groupContributionRatings.attemptId, context.attempt.id),
          eq(groupContributionRatings.raterStudentId, studentId),
        ))
    : [];
  const myScoreByRatee = new Map(myRatings.map((rating) => [rating.rateeStudentId, rating.score]));
  return {
    attempt_id: context.attempt?.id ?? null,
    status: context.attempt?.status ?? null,
    can_rate: context.attempt ? contributionWindowOpen(context.attempt.status) : false,
    group: { id: context.group.id, name: context.group.name },
    teammates: context.group.members
      .filter((member) => member.id !== studentId)
      .map((member) => ({
        id: member.id,
        name: member.name,
        username: member.username,
        my_score: myScoreByRatee.get(member.id) ?? null,
      })),
  };
}

muridRoutes.get("/today", async (c) => {
  const user = c.get("user")!;
  const memberships = await db
    .select({
      id: classes.id,
      name: classes.name,
      subject: classes.subject,
      academicYear: classes.academicYear,
      teacherId: classes.teacherId,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.studentId, user.userId), eq(classes.isArchived, false)));

  // Daftar materi memakai aturan keterlihatan berbasis penugasan
  // (lib/assignment-target.ts): modul terbit hanya tampil bila tertaut dari
  // penugasan terbit/ditutup yang menjadi sasaran murid ini — kelas tujuan
  // atau sasaran langsung. Aturan lama (guru kelas + kecocokan mapel) tidak
  // bisa membedakan jenjang kelas dalam satu mapel, sehingga materi kelas
  // lain dari guru yang sama ikut bocor ke daftar ini.
  const visibleModuleIds = await listVisibleModuleIds(user.userId);
  const publishedModules = visibleModuleIds.length
    ? await db
        .select()
        .from(modules)
        .where(and(eq(modules.status, "terbit"), inArray(modules.id, visibleModuleIds)))
        .orderBy(asc(modules.updatedAt))
    : [];

  const classIds = memberships.map((membership) => membership.id);
  const assignmentRows = classIds.length
    ? await db
        .select()
        .from(assignments)
        .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
        .where(and(eq(assignments.status, "terbit"), inArray(assignmentClasses.classId, classIds)))
        .orderBy(asc(assignments.opensAt))
    : [];
  // Penugasan "siswa tertentu" tidak mempunyai kelas tujuan: murid menemukannya
  // lewat catatan sasaran langsungnya, bukan keanggotaan kelas.
  const directRows = await db
    .select()
    .from(assignments)
    .innerJoin(assignmentStudents, eq(assignmentStudents.assignmentId, assignments.id))
    .where(and(eq(assignments.status, "terbit"), eq(assignmentStudents.studentId, user.userId)))
    .orderBy(asc(assignments.opensAt));
  const uniqueAssignments = [...new Map([...assignmentRows, ...directRows].map((row) => [row.assignments.id, row.assignments])).values()]
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
  const worksheetIds = uniqueAssignments.flatMap((assignment) => assignment.worksheetId === null ? [] : [assignment.worksheetId]);
  const attempts = worksheetIds.length
    ? await db.select({ worksheetId: worksheetAttempts.worksheetId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt }).from(worksheetAttempts).where(and(eq(worksheetAttempts.studentId, user.userId), inArray(worksheetAttempts.worksheetId, worksheetIds)))
    : [];
  const attemptsByWorksheet = new Map(attempts.map((attempt) => [attempt.worksheetId, attempt]));

  // Penugasan kelompok: kelompok murid ini + attempt bersama kelompoknya,
  // agar lencana kelompok dan progres di beranda mengikuti kerja kelompok.
  const groupByAssignment = new Map<number, StudentGroupView>();
  const groupAttemptByAssignment = new Map<number, AttemptSnapshot>();
  await Promise.all(uniqueAssignments.filter((assignment) => assignment.workMode === "kelompok").map(async (assignment) => {
    const group = await loadStudentGroup(assignment.id, user.userId);
    if (!group) return;
    groupByAssignment.set(assignment.id, group);
    if (assignment.worksheetId !== null) {
      const [groupAttempt] = await db
        .select({ status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore })
        .from(worksheetAttempts)
        .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), eq(worksheetAttempts.groupId, group.id)))
        .limit(1);
      if (groupAttempt) groupAttemptByAssignment.set(assignment.id, groupAttempt);
    }
  }));

  // Sinyal langkah "Materi" di beranda: murid sudah pernah membuka minimal
  // satu materi. Predikat sama dengan agregasi penonton guru di
  // routes/modules.ts — baris activity_logs event "buka_materi" yang
  // module_id-nya terisi. Kegagalan query ini tidak boleh menggagalkan
  // ringkasan beranda, jadi kegagalan dianggap belum pernah membuka.
  let hasViewedMaterial = false;
  try {
    const [viewed] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(and(eq(activityLogs.studentId, user.userId), eq(activityLogs.event, "buka_materi"), isNotNull(activityLogs.moduleId)))
      .limit(1);
    hasViewedMaterial = Boolean(viewed);
  } catch {
    // Abaikan — langkah Materi tampil sebagai belum selesai.
  }

  return c.json({
    ok: true,
    data: {
      classes: memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
        subject: membership.subject,
        academic_year: membership.academicYear,
      })),
      modules: publishedModules.map((module) => ({
        id: module.id,
        title: module.title,
        subject: module.subject,
        description: module.description,
        cover_key: module.coverKey,
        status: module.status,
        updated_at: module.updatedAt,
      })),
      assignments: uniqueAssignments.map((assignment) => {
        const individual = assignment.worksheetId === null ? undefined : attemptsByWorksheet.get(assignment.worksheetId);
        const effective = assignment.workMode === "kelompok"
          ? pickEffectiveAttempt(
              individual ? { status: individual.status, submittedAt: individual.submittedAt, totalScore: null } : undefined,
              groupAttemptByAssignment.get(assignment.id),
            )
          : individual;
        return serializeAssignmentForStudent(
          assignment,
          assignmentProgress(assignment, effective),
          assignment.workMode === "kelompok" ? (groupByAssignment.get(assignment.id) ?? null) : undefined,
        );
      }),
      has_viewed_material: hasViewedMaterial,
    },
  });
});

// Halaman "Nilai Saya": rangkuman semua nilai LKPD murid yang meminta yang
// sudah terbit — satu baris per penugasan yang menjadi sasarannya (anggota
// kelas tujuan ATAU murid sasaran langsung, gabungan yang sama dengan
// /today) dan attempt-nya untuk konteks penugasan itu sudah dinilai.
// Resolusi attempt meniru persis GET /assignments/:id (attempt individu +
// attempt kelompok murid ini, dipilih dengan pickEffectiveAttempt lewat
// lib/nilai-saya.ts) supaya angka di sini tidak pernah berbeda dari detail
// penugasan. Murid hanya pernah melihat barisnya sendiri: semua kueri
// attempt dan penyesuaian nilai terlingkup pada user.userId.
muridRoutes.get("/nilai", async (c) => {
  const user = c.get("user")!;
  const memberships = await db
    .select({ id: classes.id })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.studentId, user.userId), eq(classes.isArchived, false)));
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
    .where(and(eq(assignments.status, "terbit"), eq(assignmentStudents.studentId, user.userId)));
  const uniqueAssignments = [...new Map([...assignmentRows, ...directRows].map((row) => [row.assignments.id, row.assignments])).values()]
    .filter((assignment) => assignment.worksheetId !== null);

  // Judul LKPD dan mapel semua penugasan kandidat, masing-masing satu kueri.
  // Mapel mengikuti loadAssignmentSubject: modul penugasan lebih dulu, lalu
  // modul induk LKPD-nya.
  const worksheetIds = [...new Set(uniqueAssignments.map((assignment) => assignment.worksheetId!))];
  const worksheetRows = worksheetIds.length
    ? await db.select({ id: worksheets.id, title: worksheets.title, moduleId: worksheets.moduleId }).from(worksheets).where(inArray(worksheets.id, worksheetIds))
    : [];
  const worksheetById = new Map(worksheetRows.map((row) => [row.id, row]));
  const moduleIds = [...new Set([
    ...uniqueAssignments.flatMap((assignment) => (assignment.moduleId === null ? [] : [assignment.moduleId])),
    ...worksheetRows.flatMap((row) => (row.moduleId === null ? [] : [row.moduleId])),
  ])];
  const moduleRows = moduleIds.length
    ? await db.select({ id: modules.id, subject: modules.subject }).from(modules).where(inArray(modules.id, moduleIds))
    : [];
  const subjectByModuleId = new Map(moduleRows.map((row) => [row.id, row.subject]));

  const attemptFields = {
    id: worksheetAttempts.id,
    status: worksheetAttempts.status,
    submittedAt: worksheetAttempts.submittedAt,
    totalScore: worksheetAttempts.totalScore,
    updatedAt: worksheetAttempts.updatedAt,
  };
  const rows = await Promise.all(uniqueAssignments.map(async (assignment) => {
    const worksheetId = assignment.worksheetId!;
    const [individual] = await db
      .select(attemptFields)
      .from(worksheetAttempts)
      .where(and(eq(worksheetAttempts.studentId, user.userId), eq(worksheetAttempts.worksheetId, worksheetId)))
      .limit(1);
    let group: StudentGroupView | null = null;
    let groupAttempt: GradeAttemptCandidate | undefined;
    if (assignment.workMode === "kelompok") {
      group = await loadStudentGroup(assignment.id, user.userId);
      if (group) {
        [groupAttempt] = await db
          .select(attemptFields)
          .from(worksheetAttempts)
          .where(and(eq(worksheetAttempts.worksheetId, worksheetId), eq(worksheetAttempts.groupId, group.id)))
          .limit(1);
      }
    }
    const chosen = chooseGradeAttempt(individual ?? null, groupAttempt ?? null);
    // Penyesuaian nilai hanya bermakna pada attempt kelompok yang efektif,
    // dan hanya baris milik murid yang meminta yang dibaca.
    let override: { score: string; updatedAt: Date } | null = null;
    if (chosen?.isGroup) {
      const [overrideRow] = await db
        .select({ score: worksheetAttemptMemberScores.score, updatedAt: worksheetAttemptMemberScores.updatedAt })
        .from(worksheetAttemptMemberScores)
        .where(and(
          eq(worksheetAttemptMemberScores.attemptId, chosen.attempt.id),
          eq(worksheetAttemptMemberScores.studentId, user.userId),
        ))
        .limit(1);
      override = overrideRow ?? null;
    }
    const subjectName = (assignment.moduleId !== null ? subjectByModuleId.get(assignment.moduleId) : undefined)
      ?? subjectByModuleId.get(worksheetById.get(worksheetId)?.moduleId ?? -1)
      ?? null;
    return buildStudentGradeRow({
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      worksheetTitle: worksheetById.get(worksheetId)?.title ?? "",
      subjectName,
      workMode: assignment.workMode,
      groupName: group?.name ?? null,
      chosen,
      override,
    });
  }));

  return c.json({ ok: true, data: { grades: sortGradeRows(rows.filter((row) => row !== null)) } });
});

muridRoutes.get("/assignments/:id", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const assignment = await accessibleAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan belum tersedia untuk kelas Anda." }, 404);

  const now = Date.now();
  if (now < assignment.opensAt.getTime()) return c.json({ ok: false, message: "Penugasan belum dibuka." }, 403);
  await db.insert(activityLogs).values({ studentId: user.userId, assignmentId, moduleId: assignment.moduleId, event: "buka_materi" });

  const [individualAttempt] = assignment.worksheetId === null
    ? []
    : await db.select({ status: worksheetAttempts.status, totalScore: worksheetAttempts.totalScore, submittedAt: worksheetAttempts.submittedAt }).from(worksheetAttempts).where(and(eq(worksheetAttempts.studentId, user.userId), eq(worksheetAttempts.worksheetId, assignment.worksheetId))).limit(1);
  // Mode kelompok: progres dan nilai mengikuti attempt bersama kelompok
  // murid ini (attempt efektif = yang statusnya lebih maju di antara
  // attempt individu dan attempt kelompok).
  let group: StudentGroupView | null = null;
  let attempt = individualAttempt;
  // Tahap 2: bila attempt efektifnya adalah attempt kelompok, sertakan
  // nilai kelompok + penyesuaian nilai milik murid ini (bila ada).
  let groupScoreFields: { group_total_score: number | null; member_score: number | null } | null = null;
  if (assignment.workMode === "kelompok") {
    group = await loadStudentGroup(assignmentId, user.userId);
    if (group && assignment.worksheetId !== null) {
      const [groupAttempt] = await db
        .select({ id: worksheetAttempts.id, status: worksheetAttempts.status, totalScore: worksheetAttempts.totalScore, submittedAt: worksheetAttempts.submittedAt })
        .from(worksheetAttempts)
        .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), eq(worksheetAttempts.groupId, group.id)))
        .limit(1);
      const effective = pickEffectiveAttempt(individualAttempt, groupAttempt);
      attempt = effective;
      if (groupAttempt && effective === groupAttempt) {
        const override = await loadMemberScoreOverride(groupAttempt.id, user.userId);
        groupScoreFields = {
          group_total_score: groupAttempt.totalScore === null ? null : Number(groupAttempt.totalScore),
          member_score: override === null ? null : Number(override),
        };
      }
    }
  }
  const [exitTicket] = await db.select({ id: exitTickets.id }).from(exitTickets).where(and(eq(exitTickets.assignmentId, assignmentId), eq(exitTickets.studentId, user.userId))).limit(1);
  const [worksheet] = assignment.worksheetId === null
    ? []
    : await db.select({ id: worksheets.id, title: worksheets.title }).from(worksheets).where(eq(worksheets.id, assignment.worksheetId)).limit(1);

  // Sinyal langkah "Kuis RUAS": ditanyakan langsung ke RUAS lewat endpoint
  // internalnya — apakah murid ini punya attempt "completed" pada topik
  // dari tautan kuis penugasan. Hanya dicek bila tautannya terurai menjadi
  // id topik; helper-nya fail-soft (konfigurasi kosong/kegagalan apa pun →
  // false) agar rincian penugasan tidak pernah gagal karenanya.
  const quizTarget = parseRuasQuizUrl(assignment.ruasQuizUrl);
  const ruasQuizCompleted = quizTarget ? await fetchRuasQuizCompleted(user.username, quizTarget) : false;

  return c.json({
    ok: true,
    data: {
      assignment: serializeAssignmentForStudent(assignment, assignmentProgress(assignment, attempt), assignment.workMode === "kelompok" ? group : undefined),
      worksheet: worksheet ? { id: worksheet.id, title: worksheet.title } : null,
      attempt: attempt ? { status: attempt.status, total_score: attempt.totalScore === null ? null : Number(attempt.totalScore), submitted_at: attempt.submittedAt, ...(groupScoreFields ?? {}) } : null,
      exit_ticket_submitted: Boolean(exitTicket),
      ruas_quiz_completed: ruasQuizCompleted,
    },
  });
});

muridRoutes.post("/assignments/:id/exit-ticket", zValidator("json", exitTicketSchema), async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const assignment = await accessibleAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan belum tersedia untuk kelas Anda." }, 404);
  if (Date.now() < assignment.opensAt.getTime()) return c.json({ ok: false, message: "Penugasan belum dibuka." }, 403);

  const input = c.req.valid("json");
  const [existing] = await db.select({ id: exitTickets.id }).from(exitTickets).where(and(eq(exitTickets.assignmentId, assignmentId), eq(exitTickets.studentId, user.userId))).limit(1);
  if (existing) {
    await db.update(exitTickets).set({ understood3: input.understood3, examples2: input.examples2, confusing1: input.confusing1 }).where(eq(exitTickets.id, existing.id));
  } else {
    await db.insert(exitTickets).values({ assignmentId, studentId: user.userId, ...input });
  }
  await db.insert(activityLogs).values({ studentId: user.userId, assignmentId, event: "exit_ticket" });
  return c.json({ ok: true, data: { submitted: true } });
});

muridRoutes.get("/modules/:id", async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  if (!Number.isInteger(moduleId) || moduleId <= 0) return c.json({ ok: false, message: "ID modul tidak valid." }, 400);

  const [module] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, moduleId), eq(modules.status, "terbit")))
    .limit(1);
  if (!module) return c.json({ ok: false, message: "Materi tidak ditemukan." }, 404);

  // Akses baca mengikuti aturan keterlihatan yang sama dengan daftar
  // materi di beranda (berbasis penugasan, lib/assignment-target.ts) —
  // tidak ada jalan belakang lewat URL langsung untuk materi yang tidak
  // dipetakan ke murid ini.
  if (!(await studentCanAccessModule(user.userId, moduleId))) {
    return c.json({ ok: false, message: "Materi ini belum tersedia untuk kelas Anda." }, 403);
  }

  // Catat pembukaan materi per modul untuk statistik penonton guru.
  // Kegagalan pencatatan tidak boleh menggagalkan pembacaan materi.
  try {
    await db.insert(activityLogs).values({ studentId: user.userId, assignmentId: null, moduleId, event: "buka_materi" });
  } catch {
    // Abaikan — materi tetap dilayani.
  }

  // Apakah murid ini sudah pernah mencatat tuntas membaca modul ini?
  // Sama seperti pencatatan di atas: kegagalan query dianggap belum tuntas
  // dan tidak pernah menggagalkan pembacaan materi.
  let materialCompleted = false;
  try {
    const [completed] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(and(eq(activityLogs.studentId, user.userId), eq(activityLogs.moduleId, moduleId), eq(activityLogs.event, "baca_materi_tuntas")))
      .limit(1);
    materialCompleted = Boolean(completed);
  } catch {
    materialCompleted = false;
  }

  const blocks = await db
    .select()
    .from(moduleBlocks)
    .where(eq(moduleBlocks.moduleId, moduleId))
    .orderBy(asc(moduleBlocks.sortOrder));
  const publishedWorksheets = await db
    .select({ id: worksheets.id, title: worksheets.title, instructions: worksheets.instructions })
    .from(worksheets)
    .where(and(eq(worksheets.moduleId, moduleId), eq(worksheets.status, "terbit")));

  return c.json({
    ok: true,
    data: {
      module: {
        id: module.id,
        title: module.title,
        subject: module.subject,
        description: module.description,
        cover_key: module.coverKey,
      },
      blocks: blocks.map((block) => ({
        id: block.id,
        sort_order: block.sortOrder,
        type: block.type,
        content: block.contentJson,
        attachment_key: block.attachmentKey,
      })),
      worksheets: publishedWorksheets.map((worksheet) => ({
        id: worksheet.id,
        title: worksheet.title,
        instructions: worksheet.instructions,
      })),
      material_completed: materialCompleted,
    },
  });
});

muridRoutes.get("/worksheets/:id", async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  const worksheet = await accessibleWorksheet(user.userId, worksheetId);
  if (!worksheet) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);

  const items = await db
    .select()
    .from(worksheetItems)
    .where(eq(worksheetItems.worksheetId, worksheetId))
    .orderBy(asc(worksheetItems.sortOrder));
  return c.json({
    ok: true,
    data: {
      worksheet: {
        id: worksheet.id,
        module_id: worksheet.moduleId,
        title: worksheet.title,
        instructions: worksheet.instructions,
      },
      items: items.map((item) => ({
        id: item.id,
        sort_order: item.sortOrder,
        item_type: item.itemType,
        prompt: item.prompt,
        options: item.optionsJson,
        points: item.points,
      })),
    },
  });
});

muridRoutes.get("/worksheets/:id/attempt", async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const context = await resolveAttemptContext(user.userId, worksheetId, c.req.query("assignmentId") ?? null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  if (context.kind === "ungrouped") {
    // Keadaan yang bisa dibedakan sisi klien: murid belum masuk kelompok
    // mana pun pada penugasan ini — tidak ada attempt yang dibuat.
    return c.json({ ok: true, data: { ungrouped: true, status: null, submitted_at: null, answers: [], group: null } });
  }
  const attempt = context.attempt;
  const answers = await db.select().from(worksheetAnswers).where(eq(worksheetAnswers.attemptId, attempt.id));
  // Pembahasan hanya dibuka setelah LKPD dikumpulkan/dinilai. Kunci jawaban
  // (answer_key) tidak pernah dikirim ke murid.
  let explanations: Record<number, string> | undefined;
  if (attempt.status !== "draf") {
    const items = await db
      .select({ id: worksheetItems.id, explanation: worksheetItems.explanation })
      .from(worksheetItems)
      .where(eq(worksheetItems.worksheetId, worksheetId));
    explanations = Object.fromEntries(
      items.filter((item) => item.explanation).map((item) => [item.id, item.explanation!]),
    );
  }
  // Konteks kelompok: identitas kelompok, penanda pengedit terakhir, dan —
  // setelah dinilai — nilai serta komentar guru untuk seluruh anggota.
  let groupExtras: Record<string, unknown> = {};
  if (context.group) {
    let lastEditedBy: { id: number; name: string } | null = null;
    if (attempt.lastEditedBy) {
      const [editor] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, attempt.lastEditedBy))
        .limit(1);
      if (editor) lastEditedBy = editor;
    }
    // Tahap 2: penyesuaian nilai individu milik murid yang meminta saja
    // yang ikut terkirim (penyesuaian anggota lain tidak pernah bocor).
    const memberScoreOverride = attempt.status === "dinilai"
      ? await loadMemberScoreOverride(attempt.id, user.userId)
      : null;
    groupExtras = {
      group: context.group,
      last_edited_by: lastEditedBy,
      last_edited_at: attempt.lastEditedBy ? attempt.updatedAt : null,
      ...(attempt.status === "dinilai"
        ? {
            total_score: attempt.totalScore === null ? null : Number(attempt.totalScore),
            teacher_comment: attempt.teacherComment,
            member_score: memberScoreOverride === null ? null : Number(memberScoreOverride),
          }
        : {}),
    };
  }
  return c.json({
    ok: true,
    data: {
      id: attempt.id,
      status: attempt.status,
      submitted_at: attempt.submittedAt,
      answers: answers.map((answer) => ({
        item_id: answer.worksheetItemId,
        answer_text: answer.answerText,
        attachment_key: answer.attachmentKey,
      })),
      ...(explanations ? { explanations } : {}),
      ...groupExtras,
    },
  });
});

// Live kelompok (versi ringan — polling, bukan WebSocket): detak presensi
// murid + keadaan terkini attempt kelompoknya. Resolusi attempt dan
// otorisasinya PERSIS jalur halaman LKPD (accessibleWorksheet +
// resolveAttemptContext): murid hanya bisa mengakses data live attempt
// kelompoknya sendiri; non-anggota penugasan mendapat 404 yang sama seperti
// halaman, dan murid yang belum berkelompok tidak mendapat data apa pun.
// Presensi hidup di memori proses API (lib/presence.ts) — tanpa tulisan DB.
muridRoutes.post("/worksheets/:id/presence", zValidator("json", presenceHeartbeatSchema), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const input = c.req.valid("json");
  const context = await resolveAttemptContext(user.userId, worksheetId, input.assignmentId ? String(input.assignmentId) : null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  // Attempt individu atau murid belum berkelompok: tidak ada presensi yang
  // dicatat — bukan kesalahan, klien cukup menerima live:false.
  if (context.kind === "ungrouped" || !context.group) return c.json({ ok: true, data: { live: false } });
  recordHeartbeat(presenceStore, context.attempt.id, { id: user.userId, name: user.name }, input.currentItemId ?? null, Date.now());
  return c.json({ ok: true, data: { live: true } });
});

muridRoutes.get("/worksheets/:id/live", async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const context = await resolveAttemptContext(user.userId, worksheetId, c.req.query("assignmentId") ?? null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  if (context.kind === "ungrouped") {
    return c.json({ ok: true, data: { live: false, ungrouped: true, attempt_status: null, answers: [], presence: [] } });
  }
  const attempt = context.attempt;
  // Satu kueri jawaban untuk attempt ini + satu kueri nama pengedit; presensi
  // dibaca dari peta memori. submitted_by tidak dicatat attempt di mana pun,
  // jadi nama pengumpul tidak dikirim (klien memakai pesan umum).
  const answerRows = await db
    .select({
      itemId: worksheetAnswers.worksheetItemId,
      answerText: worksheetAnswers.answerText,
      attachmentKey: worksheetAnswers.attachmentKey,
      lastEditedBy: worksheetAnswers.lastEditedBy,
      updatedAt: worksheetAnswers.updatedAt,
    })
    .from(worksheetAnswers)
    .where(eq(worksheetAnswers.attemptId, attempt.id));
  const editorIds = [...new Set(answerRows.flatMap((row) => (row.lastEditedBy === null ? [] : [row.lastEditedBy])))];
  const editors = editorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, editorIds))
    : [];
  const editorNameById = new Map(editors.map((editor) => [editor.id, editor.name]));
  const presence = context.group
    ? presenceSnapshot(presenceStore, attempt.id, Date.now())
        .filter((entry) => entry.studentId !== user.userId)
        .map((entry) => ({ student_id: entry.studentId, name: entry.name, current_item_id: entry.currentItemId }))
    : [];
  return c.json({
    ok: true,
    data: {
      live: Boolean(context.group),
      attempt_status: attempt.status,
      answers: answerRows.map((row) => ({
        item_id: row.itemId,
        answer_text: row.answerText,
        attachment_key: row.attachmentKey,
        last_edited_by: row.lastEditedBy,
        last_edited_by_name: row.lastEditedBy === null ? null : (editorNameById.get(row.lastEditedBy) ?? null),
        updated_at: row.updatedAt,
      })),
      presence,
    },
  });
});

muridRoutes.put("/worksheets/:id/answers", zValidator("json", worksheetAnswersSchema), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const context = await resolveAttemptContext(user.userId, worksheetId, c.req.query("assignmentId") ?? null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  if (context.kind === "ungrouped") return c.json({ ok: false, message: "Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu." }, 403);
  const attempt = context.attempt;
  if (attempt.status !== "draf") return c.json({ ok: false, message: "LKPD sudah dikumpulkan dan sedang diperiksa." }, 409);

  const input = c.req.valid("json");
  const items = await db.select({ id: worksheetItems.id }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
  const validItemIds = new Set(items.map((item) => item.id));
  if (input.answers.some((answer) => !validItemIds.has(answer.itemId))) {
    return c.json({ ok: false, message: "Ada jawaban yang bukan bagian dari LKPD ini." }, 400);
  }

  // Setiap simpan jawaban (teks maupun foto lewat attachmentKey) mencatat
  // penulisnya pada baris jawaban — jejak penulis per jawaban (Tahap 3 mini),
  // ditampilkan ke guru pada attempt kelompok.
  //
  // Jaga jawaban kelompok: butir yang isinya PERSIS sama dengan yang sudah
  // tersimpan dilewati sepenuhnya — tidak ditulis ulang dan lastEditedBy
  // tidak berpindah ke penyimpan terakhir. Tanpa ini, anggota kelompok yang
  // halamannya memuat potret lama bisa menimpa jawaban tersimpan temannya
  // (termasuk mengosongkannya) hanya dengan menyimpan drafnya sendiri.
  // Pengosongan yang disengaja (isi berubah menjadi kosong) tetap perubahan
  // sungguhan dan tetap dicatat.
  let wroteAny = false;
  for (const answer of input.answers) {
    const [existing] = await db
      .select({ id: worksheetAnswers.id, answerText: worksheetAnswers.answerText, attachmentKey: worksheetAnswers.attachmentKey })
      .from(worksheetAnswers)
      .where(and(eq(worksheetAnswers.attemptId, attempt.id), eq(worksheetAnswers.worksheetItemId, answer.itemId)))
      .limit(1);
    if (existing) {
      if (isSameAnswerValue(existing, answer)) continue;
      await db.update(worksheetAnswers).set({ answerText: answer.answerText, attachmentKey: answer.attachmentKey, lastEditedBy: user.userId }).where(eq(worksheetAnswers.id, existing.id));
    } else {
      await db.insert(worksheetAnswers).values({
        attemptId: attempt.id,
        worksheetItemId: answer.itemId,
        answerText: answer.answerText,
        attachmentKey: answer.attachmentKey,
        lastEditedBy: user.userId,
      });
    }
    wroteAny = true;
  }
  // Attempt kelompok mencatat siapa pengedit terakhir pada setiap simpan —
  // hanya bila memang ada jawaban yang berubah; simpan yang seluruhnya
  // terlewati tidak menyentuh attempt sama sekali.
  if (wroteAny) {
    await db.update(worksheetAttempts).set({
      status: "draf",
      ...(context.group ? { lastEditedBy: user.userId } : {}),
    }).where(eq(worksheetAttempts.id, attempt.id));
  }
  return c.json({ ok: true, data: { status: "draf" } });
});

muridRoutes.post("/worksheets/:id/submit", async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const context = await resolveAttemptContext(user.userId, worksheetId, c.req.query("assignmentId") ?? null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  if (context.kind === "ungrouped") return c.json({ ok: false, message: "Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu." }, 403);
  const attempt = context.attempt;
  if (attempt.status !== "draf") return c.json({ ok: false, message: "LKPD sudah dikumpulkan." }, 409);
  // Gerbang kelengkapan khusus attempt KELOMPOK: semua soal terhitung harus
  // sudah terjawab (dari jawaban tersimpan) sebelum kelompok boleh
  // mengumpulkan — definisi "terjawab" di lib/submit-gate.ts menyalin
  // halaman murid. Attempt individu tidak digerbang (tetap boleh
  // mengumpulkan dengan soal kosong, seperti sebelumnya).
  if (context.group) {
    const items = await db
      .select({ id: worksheetItems.id, itemType: worksheetItems.itemType, optionsJson: worksheetItems.optionsJson })
      .from(worksheetItems)
      .where(eq(worksheetItems.worksheetId, worksheetId))
      .orderBy(asc(worksheetItems.sortOrder));
    const answerRows = await db
      .select({ itemId: worksheetAnswers.worksheetItemId, answerText: worksheetAnswers.answerText, attachmentKey: worksheetAnswers.attachmentKey })
      .from(worksheetAnswers)
      .where(eq(worksheetAnswers.attemptId, attempt.id));
    const answersByItemId = new Map<number, SubmitGateAnswer>(answerRows.map((row) => [row.itemId, row]));
    const missing = unansweredOrdinals(items, answersByItemId);
    if (missing.length > 0) {
      return c.json({
        ok: false,
        message: `Masih ada ${missing.length} soal yang belum dijawab (nomor ${missing.join(", ")}). Lengkapi dulu sebelum mengumpulkan.`,
      }, 400);
    }
  }
  await db.update(worksheetAttempts).set({ status: "terkumpul", submittedAt: new Date() }).where(eq(worksheetAttempts.id, attempt.id));
  return c.json({ ok: true, data: { status: "terkumpul" } });
});

// Penilaian kontribusi antarteman (Tahap 2): jendela isian hanya saat
// attempt kelompok berstatus "terkumpul". GET mengembalikan nilai yang
// diberikan murid yang meminta saja; PUT adalah upsert per teman.
muridRoutes.get("/worksheets/:id/contribution-ratings", async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const context = await resolveExistingGroupAttempt(user.userId, worksheetId, c.req.query("assignmentId") ?? null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  if (context.kind === "ungrouped") return c.json({ ok: false, message: "Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu." }, 403);
  return c.json({ ok: true, data: await contributionRatingsState(user.userId, context) });
});

muridRoutes.put("/worksheets/:id/contribution-ratings", zValidator("json", contributionRatingsSchema), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const context = await resolveExistingGroupAttempt(user.userId, worksheetId, c.req.query("assignmentId") ?? null);
  if (context.kind === "error") return c.json({ ok: false, message: context.message }, context.status);
  if (context.kind === "ungrouped") return c.json({ ok: false, message: "Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu." }, 403);
  const attempt = context.attempt;
  if (!attempt || attempt.status === "draf") {
    return c.json({ ok: false, message: "Penilaian kontribusi hanya dapat diisi setelah kelompok mengumpulkan LKPD." }, 403);
  }
  if (attempt.status === "dinilai") {
    return c.json({ ok: false, message: "Penilaian kontribusi sudah ditutup karena LKPD ini sudah dinilai guru." }, 403);
  }
  const input = c.req.valid("json");
  const memberIds = new Set(context.group.members.map((member) => member.id));
  const ratingsByRatee = new Map<number, number>();
  for (const rating of input.ratings) {
    if (rating.rateeStudentId === user.userId) {
      return c.json({ ok: false, message: "Kamu tidak dapat menilai kontribusimu sendiri." }, 400);
    }
    if (!memberIds.has(rating.rateeStudentId)) {
      return c.json({ ok: false, message: "Ada penilaian untuk murid yang bukan anggota kelompokmu." }, 400);
    }
    ratingsByRatee.set(rating.rateeStudentId, rating.score);
  }
  for (const [rateeStudentId, score] of ratingsByRatee) {
    await db
      .insert(groupContributionRatings)
      .values({ attemptId: attempt.id, raterStudentId: user.userId, rateeStudentId, score })
      .onDuplicateKeyUpdate({ set: { score } });
  }
  return c.json({ ok: true, data: await contributionRatingsState(user.userId, context) });
});

muridRoutes.get("/assignments/:id", (c) => c.json({ ok: true, data: null }));
