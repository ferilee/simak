import { Hono } from "hono";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";

// Beranda murid + detail penugasan — halaman paling ringan adalah prioritas.
export const muridRoutes = new Hono();

muridRoutes.use("*", requireRole("murid"));

const { classes, classMembers, moduleBlocks, modules } = schema;

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
    },
  });
});

muridRoutes.get("/assignments/:id", (c) => c.json({ ok: true, data: null }));
