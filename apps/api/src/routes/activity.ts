import { Hono } from "hono";
import { and, eq, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { activitySchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// Pencatatan peristiwa belajar untuk presensi otomatis dan rekap bukti.
export const activityRoutes = new Hono();

activityRoutes.use("*", requireRole("murid"));

const { activityLogs, assignmentClasses, assignments, classMembers, classes, modules } = schema;

activityRoutes.post("/", zValidator("json", activitySchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");

  // Tuntas membaca dicatat per modul (bukan per penugasan): murid menyatakan
  // sudah membaca materi sampai habis. Akses modul diperiksa dengan cara
  // yang sama seperti GET /murid/modules/:id.
  if (input.event === "baca_materi_tuntas") {
    const moduleId = input.moduleId!;
    const [module] = await db
      .select({ id: modules.id, teacherId: modules.teacherId, subject: modules.subject })
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

    // Satu catatan tuntas per murid per modul sudah cukup.
    const [existing] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(and(eq(activityLogs.studentId, user.userId), eq(activityLogs.moduleId, moduleId), eq(activityLogs.event, "baca_materi_tuntas")))
      .limit(1);
    if (!existing) {
      await db.insert(activityLogs).values({
        studentId: user.userId,
        assignmentId: null,
        moduleId,
        event: "baca_materi_tuntas",
      });
    }
    return c.json({ ok: true });
  }

  const [access] = await db
    .select({ id: assignments.id, moduleId: assignments.moduleId })
    .from(assignments)
    .innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))
    .innerJoin(classMembers, eq(classMembers.classId, assignmentClasses.classId))
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(
      eq(assignments.id, input.assignmentId!),
      eq(assignments.status, "terbit"),
      eq(classMembers.studentId, user.userId),
      eq(classes.isArchived, false),
    ))
    .limit(1);
  if (!access) return c.json({ ok: false, message: "Penugasan tidak tersedia untuk Anda." }, 404);
  await db.insert(activityLogs).values({
    studentId: user.userId,
    assignmentId: input.assignmentId!,
    moduleId: input.event === "buka_materi" ? access.moduleId : null,
    event: input.event,
  });
  return c.json({ ok: true });
});
