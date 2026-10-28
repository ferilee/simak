import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { createModuleBlockSchema, createModuleSchema, updateModuleSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// Modul materi + bloknya (Tahap 1). Isi content_json wajib lolos skema Zod
// moduleBlockContentSchema dari @simak/shared sebelum disimpan.
export const moduleRoutes = new Hono();

const { modules, moduleBlocks, activityLogs } = schema;

type ModuleViewerStats = {
  viewer_count: number;
  view_count: number;
  last_viewed_at: Date | null;
};

function serializeModule(
  module: typeof modules.$inferSelect,
  stats: ModuleViewerStats = { viewer_count: 0, view_count: 0, last_viewed_at: null },
) {
  return {
    id: module.id,
    title: module.title,
    subject: module.subject,
    description: module.description,
    status: module.status,
    version: module.version,
    created_at: module.createdAt,
    updated_at: module.updatedAt,
    viewer_count: stats.viewer_count,
    view_count: stats.view_count,
    last_viewed_at: stats.last_viewed_at,
  };
}

function serializeBlock(block: typeof moduleBlocks.$inferSelect) {
  return {
    id: block.id,
    sort_order: block.sortOrder,
    type: block.type,
    content: block.contentJson,
    attachment_key: block.attachmentKey,
  };
}

async function ownedModule(userId: number, moduleId: number) {
  const [module] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, moduleId), eq(modules.teacherId, userId)))
    .limit(1);
  return module;
}

moduleRoutes.get("/", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  // Statistik penonton per modul dari activity_logs event "buka_materi":
  // viewer_count = murid unik, view_count = total pembukaan, last_viewed_at = terakhir dibuka.
  const rows = await db
    .select({
      module: modules,
      viewerCount: sql<number>`count(distinct ${activityLogs.studentId})`,
      viewCount: sql<number>`count(${activityLogs.id})`,
      lastViewedAt: sql<Date | null>`max(${activityLogs.createdAt})`,
    })
    .from(modules)
    .leftJoin(
      activityLogs,
      and(eq(activityLogs.moduleId, modules.id), eq(activityLogs.event, "buka_materi")),
    )
    .where(eq(modules.teacherId, user.userId))
    .groupBy(modules.id);
  return c.json({
    ok: true,
    data: rows.map((row) =>
      serializeModule(row.module, {
        viewer_count: Number(row.viewerCount),
        view_count: Number(row.viewCount),
        last_viewed_at: row.lastViewedAt,
      }),
    ),
  });
});

moduleRoutes.post("/", requireRole("guru"), zValidator("json", createModuleSchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");
  const [created] = await db
    .insert(modules)
    .values({ ...input, teacherId: user.userId })
    .$returningId();
  const [module] = await db.select().from(modules).where(eq(modules.id, created!.id)).limit(1);
  return c.json({ ok: true, data: serializeModule(module!) }, 201);
});

moduleRoutes.patch("/:id", requireRole("guru"), zValidator("json", updateModuleSchema), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  if (!Number.isInteger(moduleId) || moduleId <= 0) return c.json({ ok: false, message: "ID modul tidak valid." }, 400);
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);

  await db.update(modules).set(c.req.valid("json")).where(eq(modules.id, moduleId));
  const [updated] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  return c.json({ ok: true, data: serializeModule(updated!) });
});

moduleRoutes.get("/:id/blocks", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  const rows = await db.select().from(moduleBlocks).where(eq(moduleBlocks.moduleId, moduleId)).orderBy(asc(moduleBlocks.sortOrder));
  return c.json({ ok: true, data: rows.map(serializeBlock) });
});

moduleRoutes.post("/:id/blocks", requireRole("guru"), zValidator("json", createModuleBlockSchema), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  const input = c.req.valid("json");
  const [created] = await db
    .insert(moduleBlocks)
    .values({
      moduleId,
      sortOrder: input.sortOrder ?? 0,
      type: input.content.type,
      contentJson: input.content,
      attachmentKey: input.attachmentKey,
    })
    .$returningId();
  const [block] = await db.select().from(moduleBlocks).where(eq(moduleBlocks.id, created!.id)).limit(1);
  return c.json({ ok: true, data: serializeBlock(block!) }, 201);
});
