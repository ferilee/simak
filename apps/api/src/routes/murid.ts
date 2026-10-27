import { Hono } from "hono";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { worksheetAnswersSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// Beranda murid + detail penugasan — halaman paling ringan adalah prioritas.
export const muridRoutes = new Hono();

muridRoutes.use("*", requireRole("murid"));

const { classes, classMembers, moduleBlocks, modules, worksheetAnswers, worksheetAttempts, worksheetItems, worksheets } = schema;

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
  const subjects = [...new Set(memberships.map((membership) => membership.subject))];
  const publishedModules = teacherIds.length
    ? await db
        .select()
        .from(modules)
        .where(
          and(
            eq(modules.status, "terbit"),
            or(inArray(modules.teacherId, teacherIds), inArray(modules.subject, subjects)),
          ),
        )
        .orderBy(asc(modules.updatedAt))
    : [];

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
    },
  });
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
  return c.json({
    ok: true,
    data: {
      id: attempt.id,
      status: attempt.status,
      submitted_at: attempt.submittedAt,
      answers: answers.map((answer) => ({ item_id: answer.worksheetItemId, answer_text: answer.answerText })),
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
