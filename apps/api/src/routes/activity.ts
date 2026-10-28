import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { activitySchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// Pencatatan peristiwa belajar untuk presensi otomatis dan rekap bukti.
export const activityRoutes = new Hono();

activityRoutes.use("*", requireRole("murid"));

const { activityLogs, assignmentClasses, assignments, classMembers, classes } = schema;

activityRoutes.post("/", zValidator("json", activitySchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");
  const [access] = await db
    .select({ id: assignments.id, moduleId: assignments.moduleId })
    .from(assignments)
    .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
    .innerJoin(classMembers, eq(classMembers.classId, assignmentClasses.classId))
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(
      eq(assignments.id, input.assignmentId),
      eq(assignments.status, "terbit"),
      eq(classMembers.studentId, user.userId),
      eq(classes.isArchived, false),
    ))
    .limit(1);
  if (!access) return c.json({ ok: false, message: "Penugasan tidak tersedia untuk Anda." }, 404);
  await db.insert(activityLogs).values({
    studentId: user.userId,
    assignmentId: input.assignmentId,
    moduleId: input.event === "buka_materi" ? access.moduleId : null,
    event: input.event,
  });
  return c.json({ ok: true });
});
