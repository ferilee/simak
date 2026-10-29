import { Hono } from "hono";
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { exitTicketSchema, worksheetAnswersSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { fetchRuasQuizCompleted, parseRuasQuizUrl } from "../lib/ruas-status";

// Beranda murid + detail penugasan — halaman paling ringan adalah prioritas.
export const muridRoutes = new Hono();

muridRoutes.use("*", requireRole("murid"));

const { activityLogs, assignmentClasses, assignments, classes, classMembers, exitTickets, moduleBlocks, modules, worksheetAnswers, worksheetAttempts, worksheetItems, worksheets } = schema;

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
      opensAt: assignments.opensAt,
      dueAt: assignments.dueAt,
      status: assignments.status,
    })
    .from(assignments)
    .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
    .innerJoin(classMembers, eq(classMembers.classId, assignmentClasses.classId))
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(
      eq(assignments.id, assignmentId),
      eq(assignments.status, "terbit"),
      eq(classMembers.studentId, studentId),
      eq(classes.isArchived, false),
    ))
    .limit(1);
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
  assignment: { id: number; moduleId: number | null; worksheetId: number | null; title: string; instructions: string | null; ruasQuizUrl: string | null; opensAt: Date; dueAt: Date; status: "draf" | "terbit" | "ditutup" },
  progress: string,
) {
  return {
    id: assignment.id,
    module_id: assignment.moduleId,
    worksheet_id: assignment.worksheetId,
    title: assignment.title,
    instructions: assignment.instructions,
    ruas_quiz_url: assignment.ruasQuizUrl,
    opens_at: assignment.opensAt,
    due_at: assignment.dueAt,
    status: assignment.status,
    progress,
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

// Kunci perbandingan mapel: teks penuh (trim + huruf kecil) plus isi kurung
// bila ada, mis. "Koding dan Kecerdasan Artifisial (KKA)" →
// {"koding dan kecerdasan artifisial (kka)", "kka"}.
function subjectKeys(subject: string): Set<string> {
  const full = subject.trim().toLowerCase();
  const keys = new Set<string>([full]);
  const parenthetical = /\(([^)]*)\)/.exec(full)?.[1]?.trim();
  if (parenthetical) keys.add(parenthetical);
  return keys;
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

  const teacherIds = [...new Set(memberships.map((membership) => membership.teacherId))];
  // Daftar materi memakai aturan DAN: modul harus milik guru murid ini DAN
  // mapelnya termasuk mapel kelas murid ini. Syarat guru saja (aturan ATAU)
  // meloloskan semua modul terbit seorang guru ke semua muridnya, padahal
  // satu guru bisa mengajar dua mapel. Penyaringan mapel dilakukan di kode
  // dengan kunci ternormalisasi karena ejaan mapel kelas dan modul tidak
  // selalu sama persis — mis. kelas "KKA" vs modul
  // "Koding dan Kecerdasan Artifisial (KKA)".
  const studentSubjectKeys = new Set(memberships.flatMap((membership) => [...subjectKeys(membership.subject)]));
  const teacherModules = teacherIds.length
    ? await db
        .select()
        .from(modules)
        .where(and(eq(modules.status, "terbit"), inArray(modules.teacherId, teacherIds)))
        .orderBy(asc(modules.updatedAt))
    : [];
  const publishedModules = teacherModules.filter((module) =>
    [...subjectKeys(module.subject)].some((key) => studentSubjectKeys.has(key)),
  );

  const classIds = memberships.map((membership) => membership.id);
  const assignmentRows = classIds.length
    ? await db
        .select()
        .from(assignments)
        .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
        .where(and(eq(assignments.status, "terbit"), inArray(assignmentClasses.classId, classIds)))
        .orderBy(asc(assignments.opensAt))
    : [];
  const uniqueAssignments = [...new Map(assignmentRows.map((row) => [row.assignments.id, row.assignments])).values()];
  const worksheetIds = uniqueAssignments.flatMap((assignment) => assignment.worksheetId === null ? [] : [assignment.worksheetId]);
  const attempts = worksheetIds.length
    ? await db.select({ worksheetId: worksheetAttempts.worksheetId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt }).from(worksheetAttempts).where(and(eq(worksheetAttempts.studentId, user.userId), inArray(worksheetAttempts.worksheetId, worksheetIds)))
    : [];
  const attemptsByWorksheet = new Map(attempts.map((attempt) => [attempt.worksheetId, attempt]));

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
        status: module.status,
        updated_at: module.updatedAt,
      })),
      assignments: uniqueAssignments.map((assignment) => serializeAssignmentForStudent(
        assignment,
        assignmentProgress(assignment, assignment.worksheetId === null ? undefined : attemptsByWorksheet.get(assignment.worksheetId)),
      )),
      has_viewed_material: hasViewedMaterial,
    },
  });
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

  const [attempt] = assignment.worksheetId === null
    ? []
    : await db.select({ status: worksheetAttempts.status, totalScore: worksheetAttempts.totalScore, submittedAt: worksheetAttempts.submittedAt }).from(worksheetAttempts).where(and(eq(worksheetAttempts.studentId, user.userId), eq(worksheetAttempts.worksheetId, assignment.worksheetId))).limit(1);
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
      assignment: serializeAssignmentForStudent(assignment, assignmentProgress(assignment, attempt)),
      worksheet: worksheet ? { id: worksheet.id, title: worksheet.title } : null,
      attempt: attempt ? { status: attempt.status, total_score: attempt.totalScore === null ? null : Number(attempt.totalScore), submitted_at: attempt.submittedAt } : null,
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

  const [access] = await db
    .select({ id: classMembers.id })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(
      and(
        eq(classMembers.studentId, user.userId),
        eq(classes.isArchived, false),
        or(eq(classes.teacherId, module.teacherId), eq(classes.subject, module.subject)),
      ),
    )
    .limit(1);
  if (!access) return c.json({ ok: false, message: "Materi ini belum tersedia untuk kelas Anda." }, 403);

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
  const attempt = await getOrCreateAttempt(user.userId, worksheetId);
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
    },
  });
});

muridRoutes.put("/worksheets/:id/answers", zValidator("json", worksheetAnswersSchema), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const attempt = await getOrCreateAttempt(user.userId, worksheetId);
  if (attempt.status !== "draf") return c.json({ ok: false, message: "LKPD sudah dikumpulkan dan sedang diperiksa." }, 409);

  const input = c.req.valid("json");
  const items = await db.select({ id: worksheetItems.id }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
  const validItemIds = new Set(items.map((item) => item.id));
  if (input.answers.some((answer) => !validItemIds.has(answer.itemId))) {
    return c.json({ ok: false, message: "Ada jawaban yang bukan bagian dari LKPD ini." }, 400);
  }

  for (const answer of input.answers) {
    const [existing] = await db
      .select({ id: worksheetAnswers.id })
      .from(worksheetAnswers)
      .where(and(eq(worksheetAnswers.attemptId, attempt.id), eq(worksheetAnswers.worksheetItemId, answer.itemId)))
      .limit(1);
    if (existing) {
      await db.update(worksheetAnswers).set({ answerText: answer.answerText, attachmentKey: answer.attachmentKey }).where(eq(worksheetAnswers.id, existing.id));
    } else {
      await db.insert(worksheetAnswers).values({
        attemptId: attempt.id,
        worksheetItemId: answer.itemId,
        answerText: answer.answerText,
        attachmentKey: answer.attachmentKey,
      });
    }
  }
  await db.update(worksheetAttempts).set({ status: "draf" }).where(eq(worksheetAttempts.id, attempt.id));
  return c.json({ ok: true, data: { status: "draf" } });
});

muridRoutes.post("/worksheets/:id/submit", async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await accessibleWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD belum tersedia untuk kelas Anda." }, 404);
  const attempt = await getOrCreateAttempt(user.userId, worksheetId);
  if (attempt.status !== "draf") return c.json({ ok: false, message: "LKPD sudah dikumpulkan." }, 409);
  await db.update(worksheetAttempts).set({ status: "terkumpul", submittedAt: new Date() }).where(eq(worksheetAttempts.id, attempt.id));
  return c.json({ ok: true, data: { status: "terkumpul" } });
});

muridRoutes.get("/assignments/:id", (c) => c.json({ ok: true, data: null }));
