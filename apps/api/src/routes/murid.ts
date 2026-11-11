import { Hono } from "hono";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { contributionRatingsSchema, exitTicketSchema, presenceHeartbeatSchema, worksheetAnswersSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { fetchRuasQuizCompleted, parseRuasQuizUrl } from "../lib/ruas-status";
import { presenceSnapshot, presenceStore, recordHeartbeat } from "../lib/presence";
import { listVisibleModuleIds, loadAssignmentSubject, studentCanAccessModule, studentIsAssignmentTarget } from "../lib/assignment-target";
import { buildNotYetOpenBody } from "../lib/halaman-tunggu";
import { contributionWindowOpen, loadMemberScoreOverride, loadStudentGroup, pickEffectiveAttempt, type AttemptSnapshot } from "../lib/groups";
import { planRecoveredContext, type RecoveryCandidate } from "../lib/konteks-pulih";
import { buildStudentGradeRow, chooseGradeAttempt, sortGradeRows, type GradeAttemptCandidate } from "../lib/nilai-saya";
import { buildUnansweredMessage, isSameAnswerValue, unansweredDetails, type SubmitGateAnswer } from "../lib/submit-gate";
import { needsWelcome } from "../lib/sapaan";
import { awardXp, summarizeXp, XP_POINTS, type XpSummary } from "../lib/xp";
import { avatarBySlug } from "../lib/avatar";

// Beranda murid + detail penugasan — halaman paling ringan adalah prioritas.
export const muridRoutes = new Hono();

muridRoutes.use("*", requireRole("murid"));

const { activityLogs, assignmentClasses, assignmentGroupMembers, assignmentStudents, assignments, classes, classMembers, exitTickets, groupContributionRatings, moduleBlocks, modules, users, worksheetAnswers, worksheetAttemptMemberScores, worksheetAttempts, worksheetItems, worksheets, xpLedger } = schema;

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
  | { kind: "ready"; attempt: typeof worksheetAttempts.$inferSelect; group: StudentGroupView | null; assignmentId: number | null }
  | { kind: "ungrouped"; assignmentId: number }
  | { kind: "error"; status: 400 | 404; message: string };

type AccessibleAssignment = NonNullable<Awaited<ReturnType<typeof accessibleAssignment>>>;

// Resolusi attempt dari satu penugasan yang sudah terverifikasi dapat
// diakses murid ini — satu-satunya tempat mode penugasan diterjemahkan
// menjadi attempt, dipakai jalur parameter maupun jalur pemulihan konteks
// agar keduanya tidak pernah berbeda perilaku. Penugasan individu memakai
// attempt individu murid itu sendiri (dengan id penugasan melekat pada
// konteks); penugasan kelompok memakai attempt BERSAMA kelompok murid
// tersebut; murid yang belum masuk kelompok mana pun pada penugasan itu
// mendapat keadaan "ungrouped" dan tidak dibuatkan attempt apa pun.
async function resolveFromAssignment(studentId: number, worksheetId: number, assignment: AccessibleAssignment): Promise<AttemptContext> {
  if (assignment.worksheetId !== worksheetId) {
    return { kind: "error", status: 400, message: "Penugasan ini tidak terhubung ke LKPD ini." };
  }
  if (assignment.workMode !== "kelompok") {
    return { kind: "ready", attempt: await getOrCreateAttempt(studentId, worksheetId), group: null, assignmentId: assignment.id };
  }
  const group = await loadStudentGroup(assignment.id, studentId);
  if (!group) return { kind: "ungrouped", assignmentId: assignment.id };
  return { kind: "ready", attempt: await getOrCreateGroupAttempt(worksheetId, group.id), group, assignmentId: assignment.id };
}

// Kandidat pemulihan konteks: penugasan TERBIT untuk LKPD ini yang menjadi
// sasaran murid ini — jalur kelas tujuan (kelas tidak diarsipkan) atau
// jalur sasaran langsung, cermin studentIsAssignmentTarget. Keanggotaan
// kelompok hanya diperiksa untuk kandidat kelompok (lewat loadStudentGroup,
// jalur yang sama dengan resolusi berparameter).
async function loadRecoveryCandidates(studentId: number, worksheetId: number): Promise<RecoveryCandidate[]> {
  const fields = { id: assignments.id, workMode: assignments.workMode, updatedAt: assignments.updatedAt };
  const publishedForWorksheet = () => and(eq(assignments.worksheetId, worksheetId), eq(assignments.status, "terbit"));
  const viaClass = await db
    .select(fields)
    .from(assignments)
    .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .where(and(publishedForWorksheet(), eq(classMembers.studentId, studentId), eq(classes.isArchived, false)));
  const viaDirect = await db
    .select(fields)
    .from(assignments)
    .innerJoin(assignmentStudents, eq(assignmentStudents.assignmentId, assignments.id))
    .where(and(publishedForWorksheet(), eq(assignmentStudents.studentId, studentId)));
  const byId = new Map<number, { id: number; workMode: "individu" | "kelompok"; updatedAt: Date }>();
  for (const row of [...viaClass, ...viaDirect]) byId.set(row.id, row);
  const candidates: RecoveryCandidate[] = [];
  for (const row of byId.values()) {
    const hasMembership = row.workMode === "kelompok" ? (await loadStudentGroup(row.id, studentId)) !== null : false;
    candidates.push({ id: row.id, workMode: row.workMode, hasMembership, updatedAtMs: row.updatedAt.getTime() });
  }
  return candidates;
}

// Resolusi attempt untuk endpoint LKPD murid.
//
// Jalur parameter (?assignmentId=) tidak berubah: id diverifikasi lewat
// accessibleAssignment lalu diresolusi dari penugasan itu.
//
// Tanpa parameter, konteks DIPULIHKAN dari server (lib/konteks-pulih.ts):
// tautan LKPD dari halaman modul tidak membawa parameter, dan jatuh
// diam-diam ke attempt individu membuat jawaban anggota kelompok terdampar
// di attempt pribadi serta Live Kelompok tidak pernah menyala. Bila ada
// kandidat penugasan untuk murid ini, konteksnya diresolusi persis seperti
// jalur parameter (perencana hanya memilih penugasan mana; resolusinya
// tetap resolveFromAssignment). Tanpa kandidat apa pun — atau kandidatnya
// berubah di antara dua pembacaan — perilakunya persis seperti sebelumnya:
// attempt individu murid itu sendiri tanpa konteks penugasan.
async function resolveAttemptContext(studentId: number, worksheetId: number, assignmentIdParam: string | null): Promise<AttemptContext> {
  if (assignmentIdParam) {
    const assignmentId = Number(assignmentIdParam);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return { kind: "error", status: 400, message: "ID penugasan tidak valid." };
    }
    const assignment = await accessibleAssignment(studentId, assignmentId);
    if (!assignment) {
      return { kind: "error", status: 404, message: "Penugasan belum tersedia untuk kelas Anda." };
    }
    return resolveFromAssignment(studentId, worksheetId, assignment);
  }
  const plan = planRecoveredContext(await loadRecoveryCandidates(studentId, worksheetId));
  if (plan.kind !== "none") {
    const assignment = await accessibleAssignment(studentId, plan.assignmentId);
    if (assignment) return resolveFromAssignment(studentId, worksheetId, assignment);
  }
  return { kind: "ready", attempt: await getOrCreateAttempt(studentId, worksheetId), group: null, assignmentId: null };
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

  // Penanda sambutan pertama: modal ucapan selamat datang hanya tampil
  // bila welcomed_at murid ini masih NULL. Sama seperti sinyal materi di
  // atas, kegagalan query tidak boleh menggagalkan ringkasan beranda —
  // kegagalan dianggap sudah disambut (modal tidak tampil).
  // Avatar terpasang dibaca dari baris users yang sama; slug selalu
  // divalidasi ke katalog avatar (slug asing diperlakukan belum
  // memasang), dan kegagalan query yang sama mengosongkannya.
  let showWelcome = false;
  let equippedAvatarSlug: string | null = null;
  try {
    const [me] = await db
      .select({ welcomedAt: users.welcomedAt, avatarSlug: users.avatarSlug })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);
    showWelcome = needsWelcome(me?.welcomedAt);
    equippedAvatarSlug = me?.avatarSlug && avatarBySlug(me.avatarSlug) ? me.avatarSlug : null;
  } catch {
    // Abaikan — modal sambutan tidak tampil, avatar tidak dirender.
  }

  // Ringkasan XP murid dari buku besar xp_ledger. Level dihitung dari
  // XP SEUMUR — jumlah baris berpoin positif saja — agar menukar XP
  // untuk avatar tidak pernah menurunkan level; saldo tukar (jumlah
  // semua baris) menyertai ringkasan sebagai field balance. Pola
  // gagal-aman yang sama dengan sinyal di atas: kegagalan query
  // menghasilkan xp null dan kartu XP tidak dirender — beranda tidak
  // pernah gagal gara-gara gamifikasi.
  let xpSummary: XpSummary | null = null;
  try {
    const [row] = await db
      .select({
        lifetime: sql<number>`coalesce(sum(case when ${xpLedger.points} > 0 then ${xpLedger.points} else 0 end), 0)`,
        balance: sql<number>`coalesce(sum(${xpLedger.points}), 0)`,
      })
      .from(xpLedger)
      .where(eq(xpLedger.studentId, user.userId));
    xpSummary = summarizeXp(Number(row?.lifetime ?? 0), Number(row?.balance ?? 0));
  } catch {
    // Abaikan — kartu XP tidak tampil.
  }

  // Checklist langkah per penugasan pada kartu beranda: ketuntasan
  // materi per modul dan pengiriman exit ticket per penugasan, masing-
  // masing SATU query himpunan untuk seluruh daftar (bukan per
  // penugasan). Predikat tuntasnya sama dengan GET /murid/modules/:id
  // (baris baca_materi_tuntas murid ini untuk modul itu); predikat exit
  // ticket sama dengan halaman detail penugasan (ada baris exit_tickets
  // untuk pasangan penugasan+murid). Pola gagal-aman yang sama dengan
  // sinyal beranda lain: kegagalan → himpunan kosong (langkah tampil
  // belum selesai) dan tidak pernah menggagalkan ringkasan beranda.
  const assignmentModuleIds = [...new Set(uniqueAssignments.flatMap((assignment) => (assignment.moduleId === null ? [] : [assignment.moduleId])))];
  let completedMaterialModuleIds = new Set<number>();
  try {
    if (assignmentModuleIds.length > 0) {
      const rows = await db
        .select({ moduleId: activityLogs.moduleId })
        .from(activityLogs)
        .where(and(eq(activityLogs.studentId, user.userId), eq(activityLogs.event, "baca_materi_tuntas"), inArray(activityLogs.moduleId, assignmentModuleIds)));
      completedMaterialModuleIds = new Set(rows.flatMap((row) => (row.moduleId === null ? [] : [row.moduleId])));
    }
  } catch {
    // Abaikan — langkah materi tampil sebagai belum tuntas.
  }
  let submittedExitTicketAssignmentIds = new Set<number>();
  try {
    if (uniqueAssignments.length > 0) {
      const rows = await db
        .select({ assignmentId: exitTickets.assignmentId })
        .from(exitTickets)
        .where(and(eq(exitTickets.studentId, user.userId), inArray(exitTickets.assignmentId, uniqueAssignments.map((assignment) => assignment.id))));
      submittedExitTicketAssignmentIds = new Set(rows.map((row) => row.assignmentId));
    }
  } catch {
    // Abaikan — langkah exit ticket tampil sebagai belum diisi.
  }

  return c.json({
    ok: true,
    data: {
      needs_welcome: showWelcome,
      xp: xpSummary,
      avatar_slug: equippedAvatarSlug,
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
        return {
          ...serializeAssignmentForStudent(
            assignment,
            assignmentProgress(assignment, effective),
            assignment.workMode === "kelompok" ? (groupByAssignment.get(assignment.id) ?? null) : undefined,
          ),
          // Dua field checklist kartu beranda (lihat query himpunan di
          // atas): material_completed hanya bermakna bila penugasan
          // punya modul — tanpa modul selalu false dan web tidak
          // menggambar langkah materinya.
          material_completed: assignment.moduleId !== null && completedMaterialModuleIds.has(assignment.moduleId),
          exit_ticket_submitted: submittedExitTicketAssignmentIds.has(assignment.id),
        };
      }),
      has_viewed_material: hasViewedMaterial,
    },
  });
});

// Modal ucapan selamat datang ditutup murid: catat penanda sambutan
// (hanya bila masih NULL — panggilan berulang tidak menggeser waktu
// sambutan pertama) agar modal tidak tampil lagi untuk akun ini.
muridRoutes.post("/welcome/seen", async (c) => {
  const user = c.get("user")!;
  await db
    .update(users)
    .set({ welcomedAt: new Date() })
    .where(and(eq(users.id, user.userId), isNull(users.welcomedAt)));
  return c.json({ ok: true, data: { needs_welcome: false } });
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
  if (now < assignment.opensAt.getTime()) {
    // Murid ini sudah pasti sasaran penugasan (accessibleAssignment di
    // atas); hanya waktunya yang belum tiba. Sertakan data ringkas agar
    // halaman murid menggambar halaman tunggu, bukan layar kosong —
    // lihat lib/halaman-tunggu.ts. Murid bukan sasaran tidak pernah
    // sampai di sini (404 polos di atas, tanpa data).
    const subjectName = await loadAssignmentSubject(assignment);
    return c.json(buildNotYetOpenBody(assignment, subjectName), 403);
  }
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
  let xpAwarded = 0;
  if (existing) {
    await db.update(exitTickets).set({ understood3: input.understood3, examples2: input.examples2, confusing1: input.confusing1 }).where(eq(exitTickets.id, existing.id));
  } else {
    await db.insert(exitTickets).values({ assignmentId, studentId: user.userId, ...input });
    // XP exit ticket hanya untuk tiket yang BARU dibuat — kirim ulang
    // memperbarui isi tiket lama dan tidak membayar lagi.
    xpAwarded = await awardXp(user.userId, "exit_ticket", assignmentId);
  }
  await db.insert(activityLogs).values({ studentId: user.userId, assignmentId, event: "exit_ticket" });
  return c.json({ ok: true, data: { submitted: true, xp_awarded: xpAwarded } });
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
    return c.json({ ok: true, data: { ungrouped: true, assignment_id: context.assignmentId, status: null, submitted_at: null, answers: [], group: null } });
  }
  const attempt = context.attempt;
  const answers = await db.select().from(worksheetAnswers).where(eq(worksheetAnswers.attemptId, attempt.id));
  // Konteks materi untuk banner pengingat di halaman LKPD: penugasan
  // yang melekat pada attempt ini (dari parameter ATAU dipulihkan
  // server — konteks yang sama dengan assignment_id pada respons)
  // menentukan modulnya; ketuntasan memakai predikat yang sama dengan
  // GET /murid/modules/:id (baris baca_materi_tuntas murid ini untuk
  // modul itu). Tanpa konteks penugasan, atau penugasannya tanpa modul,
  // material null dan banner tidak tampil. Kegagalan query juga
  // menghasilkan null — banner pengingat tidak pernah boleh
  // menggagalkan pemuatan attempt.
  let material: { module_id: number; completed: boolean } | null = null;
  if (context.assignmentId !== null) {
    try {
      const [contextAssignment] = await db
        .select({ moduleId: assignments.moduleId })
        .from(assignments)
        .where(eq(assignments.id, context.assignmentId))
        .limit(1);
      if (contextAssignment?.moduleId != null) {
        const moduleId = contextAssignment.moduleId;
        const [completedRow] = await db
          .select({ id: activityLogs.id })
          .from(activityLogs)
          .where(and(eq(activityLogs.studentId, user.userId), eq(activityLogs.moduleId, moduleId), eq(activityLogs.event, "baca_materi_tuntas")))
          .limit(1);
        material = { module_id: moduleId, completed: Boolean(completedRow) };
      }
    } catch {
      material = null;
    }
  }
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
      // Id penugasan hasil resolusi konteks (dari parameter ATAU dipulihkan
      // server): klien mengadopsinya bila URL-nya tidak membawa parameter,
      // agar simpan/pengumpulan/presensi memakai konteks yang sama.
      assignment_id: context.assignmentId,
      // Konteks materi banner pengingat (lihat di atas): { module_id,
      // completed } atau null bila attempt ini tidak terikat modul.
      material,
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
    const missing = unansweredDetails(items, answersByItemId);
    if (missing.length > 0) {
      return c.json({
        ok: false,
        message: buildUnansweredMessage(missing),
      }, 400);
    }
  }
  await db.update(worksheetAttempts).set({ status: "terkumpul", submittedAt: new Date() }).where(eq(worksheetAttempts.id, attempt.id));
  // XP LKPD terkumpul: attempt individu membayar pengumpulnya; attempt
  // kelompok membayar SETIAP anggota kelompok (kerja kolektif — bukan
  // lomba menekan tombol Kumpulkan). Penjaga status "draf" di atas
  // membuat titik ini tercapai tepat sekali per attempt, dan kunci
  // unik buku besar menahan sisa perlombaan apa pun.
  let xpAwarded = 0;
  if (context.group) {
    const memberRows = await db
      .select({ studentId: assignmentGroupMembers.studentId })
      .from(assignmentGroupMembers)
      .where(eq(assignmentGroupMembers.groupId, context.group.id));
    for (const member of memberRows) {
      await awardXp(member.studentId, "lkpd_terkumpul", attempt.id);
    }
    xpAwarded = memberRows.some((member) => member.studentId === user.userId) ? XP_POINTS.lkpd_terkumpul : 0;
  } else {
    xpAwarded = await awardXp(user.userId, "lkpd_terkumpul", attempt.id);
  }
  return c.json({ ok: true, data: { status: "terkumpul", xp_awarded: xpAwarded } });
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
