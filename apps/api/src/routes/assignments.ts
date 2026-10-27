import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { createAssignmentSchema, updateAssignmentSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// Penugasan ke kelas: jadwal buka/tutup dan tautan kuis RUAS.
export const assignmentRoutes = new Hono();

const { assignmentClasses, assignments, classes, modules, worksheets } = schema;

function serializeAssignment(
  assignment: typeof assignments.$inferSelect,
  linkedClasses: { id: number; name: string }[] = [],
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
    classes: linkedClasses.map((kelas) => ({ id: kelas.id, name: kelas.name })),
    created_at: assignment.createdAt,
    updated_at: assignment.updatedAt,
  };
}

async function ownedAssignment(userId: number, assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, userId)))
    .limit(1);
  return assignment;
}

async function getLinkedClasses(assignmentId: number) {
  return db
    .select({ id: classes.id, name: classes.name })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .where(eq(assignmentClasses.assignmentId, assignmentId));
}

async function validateTeacherReferences(userId: number, moduleId?: number, worksheetId?: number) {
  if (moduleId !== undefined) {
    const [module] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.teacherId, userId)))
      .limit(1);
    if (!module) return "Modul tidak ditemukan.";
  }
  if (worksheetId !== undefined) {
    const [worksheet] = await db
      .select({ id: worksheets.id })
      .from(worksheets)
      .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, userId)))
      .limit(1);
    if (!worksheet) return "LKPD tidak ditemukan.";
  }
  return null;
}

async function validatePublishableReferences(userId: number, moduleId?: number, worksheetId?: number) {
  if (moduleId !== undefined) {
    const [module] = await db
      .select({ id: modules.id, status: modules.status })
      .from(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.teacherId, userId)))
      .limit(1);
    if (!module || module.status !== "terbit") return "Modul harus diterbitkan sebelum penugasan diterbitkan.";
  }
  if (worksheetId !== undefined) {
    const [worksheet] = await db
      .select({ id: worksheets.id, status: worksheets.status })
      .from(worksheets)
      .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, userId)))
      .limit(1);
    if (!worksheet || worksheet.status !== "terbit") return "LKPD harus diterbitkan sebelum penugasan diterbitkan.";
  }
  return null;
}

async function validateTeacherClasses(userId: number, classIds: number[]) {
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.teacherId, userId), eq(classes.isArchived, false), inArray(classes.id, classIds)));
  return rows.length === new Set(classIds).size;
}

assignmentRoutes.use("*", requireRole("guru"));

assignmentRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await db.select().from(assignments).where(eq(assignments.teacherId, user.userId)).orderBy(desc(assignments.opensAt));
  const links = rows.length
    ? await db
        .select({ assignmentId: assignmentClasses.assignmentId, id: classes.id, name: classes.name })
        .from(assignmentClasses)
        .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
        .where(inArray(assignmentClasses.assignmentId, rows.map((row) => row.id)))
    : [];
  const classesByAssignment = new Map<number, { id: number; name: string }[]>();
  for (const link of links) {
    const current = classesByAssignment.get(link.assignmentId) ?? [];
    current.push({ id: link.id, name: link.name });
    classesByAssignment.set(link.assignmentId, current);
  }
  return c.json({ ok: true, data: rows.map((row) => serializeAssignment(row, classesByAssignment.get(row.id) ?? [])) });
});

assignmentRoutes.post("/", zValidator("json", createAssignmentSchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");
  const referenceError = await validateTeacherReferences(user.userId, input.moduleId, input.worksheetId);
  if (referenceError) return c.json({ ok: false, message: referenceError }, 404);
  if (!(await validateTeacherClasses(user.userId, input.classIds))) {
    return c.json({ ok: false, message: "Ada kelas tujuan yang tidak Anda kelola atau sudah diarsipkan." }, 400);
  }

  let assignmentId = 0;
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(assignments).values({
      teacherId: user.userId,
      moduleId: input.moduleId,
      worksheetId: input.worksheetId,
      title: input.title,
      instructions: input.instructions,
      ruasQuizUrl: input.ruasQuizUrl,
      opensAt: input.opensAt,
      dueAt: input.dueAt,
    }).$returningId();
    assignmentId = created!.id;
    await tx.insert(assignmentClasses).values(input.classIds.map((classId) => ({ assignmentId, classId })));
  });

  const assignment = await ownedAssignment(user.userId, assignmentId);
  return c.json({ ok: true, data: serializeAssignment(assignment!, await getLinkedClasses(assignmentId)) }, 201);
});

assignmentRoutes.patch("/:id", zValidator("json", updateAssignmentSchema), async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const current = await ownedAssignment(user.userId, assignmentId);
  if (!current) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  const input = c.req.valid("json");
  const referenceError = await validateTeacherReferences(user.userId, input.moduleId, input.worksheetId);
  if (referenceError) return c.json({ ok: false, message: referenceError }, 404);
  if (input.classIds && !(await validateTeacherClasses(user.userId, input.classIds))) {
    return c.json({ ok: false, message: "Ada kelas tujuan yang tidak Anda kelola atau sudah diarsipkan." }, 400);
  }
  if (input.status === "terbit" || (input.status === undefined && current.status === "terbit")) {
    const publishError = await validatePublishableReferences(user.userId, input.moduleId ?? current.moduleId ?? undefined, input.worksheetId ?? current.worksheetId ?? undefined);
    if (publishError) return c.json({ ok: false, message: publishError }, 400);
  }
  const opensAt = input.opensAt ?? current.opensAt;
  const dueAt = input.dueAt ?? current.dueAt;
  if (dueAt < opensAt) return c.json({ ok: false, message: "Batas pengumpulan harus setelah waktu buka." }, 400);

  const { classIds, ...assignmentInput } = input;
  await db.transaction(async (tx) => {
    if (Object.keys(assignmentInput).length > 0) {
      await tx.update(assignments).set(assignmentInput).where(eq(assignments.id, assignmentId));
    }
    if (classIds) {
      await tx.delete(assignmentClasses).where(eq(assignmentClasses.assignmentId, assignmentId));
      await tx.insert(assignmentClasses).values(classIds.map((classId) => ({ assignmentId, classId })));
    }
  });

  const [updated] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  return c.json({ ok: true, data: serializeAssignment(updated!, await getLinkedClasses(assignmentId)) });
});
