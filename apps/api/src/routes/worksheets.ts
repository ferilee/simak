import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import {
  createWorksheetItemSchema,
  createWorksheetSchema,
  updateWorksheetSchema,
} from "@simak/shared";
import { requireRole } from "../middleware/auth";

// LKPD + butir blok interaktifnya (Tahap 2).
// Opsi butir divalidasi worksheetItemOptionsSchema dari @simak/shared.
export const worksheetRoutes = new Hono();

const { modules, worksheetItems, worksheets } = schema;

function serializeWorksheet(worksheet: typeof worksheets.$inferSelect) {
  return {
    id: worksheet.id,
    module_id: worksheet.moduleId,
    title: worksheet.title,
    instructions: worksheet.instructions,
    status: worksheet.status,
    created_at: worksheet.createdAt,
    updated_at: worksheet.updatedAt,
  };
}

function serializeItem(item: typeof worksheetItems.$inferSelect, includeAnswer = true) {
  return {
    id: item.id,
    sort_order: item.sortOrder,
    item_type: item.itemType,
    prompt: item.prompt,
    options: item.optionsJson,
    ...(includeAnswer ? { answer_key: item.answerKey, explanation: item.explanation } : {}),
    points: item.points,
  };
}

async function ownedWorksheet(userId: number, worksheetId: number) {
  const [worksheet] = await db
    .select()
    .from(worksheets)
    .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, userId)))
    .limit(1);
  return worksheet;
}

worksheetRoutes.get("/", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const rows = await db.select().from(worksheets).where(eq(worksheets.teacherId, user.userId));
  return c.json({ ok: true, data: rows.map(serializeWorksheet) });
});

worksheetRoutes.post(
  "/",
  requireRole("guru"),
  zValidator("json", createWorksheetSchema),
  async (c) => {
    const user = c.get("user")!;
    const input = c.req.valid("json");
    if (input.moduleId) {
      const [module] = await db
        .select({ id: modules.id })
        .from(modules)
        .where(and(eq(modules.id, input.moduleId), eq(modules.teacherId, user.userId)))
        .limit(1);
      if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
    }
    const [created] = await db.insert(worksheets).values({ ...input, teacherId: user.userId }).$returningId();
    const [worksheet] = await db.select().from(worksheets).where(eq(worksheets.id, created!.id)).limit(1);
    return c.json({ ok: true, data: serializeWorksheet(worksheet!) }, 201);
  },
);

worksheetRoutes.patch(
  "/:id",
  requireRole("guru"),
  zValidator("json", updateWorksheetSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
    const worksheet = await ownedWorksheet(user.userId, worksheetId);
    if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    await db.update(worksheets).set(c.req.valid("json")).where(eq(worksheets.id, worksheetId));
    const [updated] = await db.select().from(worksheets).where(eq(worksheets.id, worksheetId)).limit(1);
    return c.json({ ok: true, data: serializeWorksheet(updated!) });
  },
);

worksheetRoutes.get("/:id/items", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
  const rows = await db.select().from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)).orderBy(asc(worksheetItems.sortOrder));
  return c.json({ ok: true, data: rows.map((item) => serializeItem(item)) });
});

worksheetRoutes.post(
  "/:id/items",
  requireRole("guru"),
  zValidator("json", createWorksheetItemSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    const input = c.req.valid("json");
    const [created] = await db.insert(worksheetItems).values({
      worksheetId,
      sortOrder: input.sortOrder ?? 0,
      itemType: input.itemType,
      prompt: input.prompt,
      optionsJson: input.options,
      answerKey: input.answerKey,
      explanation: input.explanation,
      points: input.points,
    }).$returningId();
    const [item] = await db.select().from(worksheetItems).where(eq(worksheetItems.id, created!.id)).limit(1);
    return c.json({ ok: true, data: serializeItem(item!) }, 201);
  },
);
