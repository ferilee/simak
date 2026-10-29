import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import {
  createWorksheetItemSchema,
  createWorksheetSchema,
  gradeWorksheetSchema,
  reorderWorksheetItemsSchema,
  updateWorksheetItemSchema,
  updateWorksheetSchema,
} from "@simak/shared";
import { requireRole } from "../middleware/auth";

// LKPD + butir blok interaktifnya (Tahap 2).
// Opsi butir divalidasi worksheetItemOptionsSchema dari @simak/shared.
export const worksheetRoutes = new Hono();

const { modules, users, worksheetAnswers, worksheetAttempts, worksheetItems, worksheets } = schema;

type WorksheetAttemptStats = {
  started_count: number;
  submitted_count: number;
  last_activity_at: Date | null;
};

function serializeWorksheet(
  worksheet: typeof worksheets.$inferSelect,
  stats: WorksheetAttemptStats = { started_count: 0, submitted_count: 0, last_activity_at: null },
) {
  return {
    id: worksheet.id,
    module_id: worksheet.moduleId,
    title: worksheet.title,
    instructions: worksheet.instructions,
    status: worksheet.status,
    created_at: worksheet.createdAt,
    updated_at: worksheet.updatedAt,
    started_count: stats.started_count,
    submitted_count: stats.submitted_count,
    last_activity_at: stats.last_activity_at,
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

function serializeScore(score: string | null) {
  return score === null ? null : Number(score);
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
  // Statistik pengerjaan per LKPD dari worksheet_attempts:
  // started_count = murid unik yang sudah mulai mengerjakan (punya attempt),
  // submitted_count = murid unik yang attempt-nya terkumpul/dinilai,
  // last_activity_at = aktivitas attempt terakhir.
  const rows = await db
    .select({
      worksheet: worksheets,
      startedCount: sql<number>`count(distinct ${worksheetAttempts.studentId})`,
      submittedCount: sql<number>`count(distinct case when ${worksheetAttempts.status} in ('terkumpul', 'dinilai') then ${worksheetAttempts.studentId} end)`,
      lastActivityAt: sql<Date | null>`max(${worksheetAttempts.updatedAt})`,
    })
    .from(worksheets)
    .leftJoin(worksheetAttempts, eq(worksheetAttempts.worksheetId, worksheets.id))
    .where(eq(worksheets.teacherId, user.userId))
    .groupBy(worksheets.id);
  return c.json({
    ok: true,
    data: rows.map((row) =>
      serializeWorksheet(row.worksheet, {
        started_count: Number(row.startedCount),
        submitted_count: Number(row.submittedCount),
        last_activity_at: row.lastActivityAt,
      }),
    ),
  });
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

worksheetRoutes.get("/:id/attempts", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

  const rows = await db
    .select({
      id: worksheetAttempts.id,
      studentId: worksheetAttempts.studentId,
      studentName: users.name,
      username: users.username,
      status: worksheetAttempts.status,
      submittedAt: worksheetAttempts.submittedAt,
      totalScore: worksheetAttempts.totalScore,
      updatedAt: worksheetAttempts.updatedAt,
    })
    .from(worksheetAttempts)
    .innerJoin(users, eq(users.id, worksheetAttempts.studentId))
    .where(eq(worksheetAttempts.worksheetId, worksheetId))
    .orderBy(desc(worksheetAttempts.updatedAt));

  return c.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      student_id: row.studentId,
      student_name: row.studentName,
      username: row.username,
      status: row.status,
      submitted_at: row.submittedAt,
      total_score: serializeScore(row.totalScore),
      updated_at: row.updatedAt,
    })),
  });
});

worksheetRoutes.get("/:id/attempts/:attemptId", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  const attemptId = Number(c.req.param("attemptId"));
  if (![worksheetId, attemptId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID LKPD atau pengumpulan tidak valid." }, 400);
  }
  const worksheet = await ownedWorksheet(user.userId, worksheetId);
  if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

  const [attempt] = await db
    .select({
      id: worksheetAttempts.id,
      studentId: worksheetAttempts.studentId,
      studentName: users.name,
      username: users.username,
      status: worksheetAttempts.status,
      submittedAt: worksheetAttempts.submittedAt,
      totalScore: worksheetAttempts.totalScore,
      teacherComment: worksheetAttempts.teacherComment,
    })
    .from(worksheetAttempts)
    .innerJoin(users, eq(users.id, worksheetAttempts.studentId))
    .where(and(eq(worksheetAttempts.id, attemptId), eq(worksheetAttempts.worksheetId, worksheetId)))
    .limit(1);
  if (!attempt) return c.json({ ok: false, message: "Pengumpulan tidak ditemukan." }, 404);

  const [items, answers] = await Promise.all([
    db.select().from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)).orderBy(asc(worksheetItems.sortOrder)),
    db.select().from(worksheetAnswers).where(eq(worksheetAnswers.attemptId, attemptId)),
  ]);
  const answerByItem = new Map(answers.map((answer) => [answer.worksheetItemId, answer]));

  return c.json({
    ok: true,
    data: {
      worksheet: serializeWorksheet(worksheet),
      attempt: {
        id: attempt.id,
        student_id: attempt.studentId,
        student_name: attempt.studentName,
        username: attempt.username,
        status: attempt.status,
        submitted_at: attempt.submittedAt,
        total_score: serializeScore(attempt.totalScore),
        teacher_comment: attempt.teacherComment,
      },
      items: items.map((item) => {
        const answer = answerByItem.get(item.id);
        return {
          ...serializeItem(item),
          answer_text: answer?.answerText ?? null,
          attachment_key: answer?.attachmentKey ?? null,
          score: serializeScore(answer?.score ?? null),
          teacher_note: answer?.teacherNote ?? null,
        };
      }),
    },
  });
});

worksheetRoutes.patch(
  "/:id/attempts/:attemptId",
  requireRole("guru"),
  zValidator("json", gradeWorksheetSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    const attemptId = Number(c.req.param("attemptId"));
    if (![worksheetId, attemptId].every((value) => Number.isInteger(value) && value > 0)) {
      return c.json({ ok: false, message: "ID LKPD atau pengumpulan tidak valid." }, 400);
    }
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

    const [attempt] = await db
      .select({ id: worksheetAttempts.id })
      .from(worksheetAttempts)
      .where(and(eq(worksheetAttempts.id, attemptId), eq(worksheetAttempts.worksheetId, worksheetId)))
      .limit(1);
    if (!attempt) return c.json({ ok: false, message: "Pengumpulan tidak ditemukan." }, 404);

    const input = c.req.valid("json");
    const items = await db.select({ id: worksheetItems.id, points: worksheetItems.points }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
    const pointsByItem = new Map(items.map((item) => [item.id, item.points]));
    if (input.answers.some((answer) => !pointsByItem.has(answer.itemId))) {
      return c.json({ ok: false, message: "Ada nilai untuk soal yang bukan bagian dari LKPD ini." }, 400);
    }
    if (input.answers.some((answer) => answer.score > pointsByItem.get(answer.itemId)!)) {
      return c.json({ ok: false, message: "Nilai tidak boleh melebihi poin soal." }, 400);
    }

    for (const answer of input.answers) {
      const [existing] = await db
        .select({ id: worksheetAnswers.id })
        .from(worksheetAnswers)
        .where(and(eq(worksheetAnswers.attemptId, attemptId), eq(worksheetAnswers.worksheetItemId, answer.itemId)))
        .limit(1);
      if (existing) {
        await db.update(worksheetAnswers).set({ score: answer.score.toFixed(2), teacherNote: answer.teacherNote }).where(eq(worksheetAnswers.id, existing.id));
      } else {
        await db.insert(worksheetAnswers).values({
          attemptId,
          worksheetItemId: answer.itemId,
          score: answer.score.toFixed(2),
          teacherNote: answer.teacherNote,
        });
      }
    }

    const totalScore = input.answers.reduce((sum, answer) => sum + answer.score, 0);
    await db.update(worksheetAttempts).set({
      status: "dinilai",
      totalScore: totalScore.toFixed(2),
      teacherComment: input.teacherComment,
    }).where(eq(worksheetAttempts.id, attemptId));
    return c.json({ ok: true, data: { status: "dinilai", total_score: totalScore } });
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

// Route "/order" didaftarkan sebelum "/:itemId" agar segmen "order" tidak
// tertangkap sebagai id butir.
worksheetRoutes.patch(
  "/:id/items/order",
  requireRole("guru"),
  zValidator("json", reorderWorksheetItemsSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    const input = c.req.valid("json");
    const existing = await db.select({ id: worksheetItems.id }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
    const existingIds = new Set(existing.map((row) => row.id));
    const requestedIds = new Set(input.itemIds);
    if (
      input.itemIds.length !== existingIds.size
      || requestedIds.size !== input.itemIds.length
      || input.itemIds.some((itemId) => !existingIds.has(itemId))
    ) {
      return c.json({ ok: false, message: "Daftar urutan butir harus memuat semua butir LKPD ini tepat satu kali." }, 400);
    }
    for (const [index, itemId] of input.itemIds.entries()) {
      await db.update(worksheetItems).set({ sortOrder: index }).where(eq(worksheetItems.id, itemId));
    }
    const rows = await db.select().from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)).orderBy(asc(worksheetItems.sortOrder));
    return c.json({ ok: true, data: rows.map((item) => serializeItem(item)) });
  },
);

worksheetRoutes.patch(
  "/:id/items/:itemId",
  requireRole("guru"),
  zValidator("json", updateWorksheetItemSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    const itemId = Number(c.req.param("itemId"));
    if (![worksheetId, itemId].every((value) => Number.isInteger(value) && value > 0)) {
      return c.json({ ok: false, message: "ID LKPD atau butir tidak valid." }, 400);
    }
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    const [item] = await db
      .select()
      .from(worksheetItems)
      .where(and(eq(worksheetItems.id, itemId), eq(worksheetItems.worksheetId, worksheetId)))
      .limit(1);
    if (!item) return c.json({ ok: false, message: "Butir tidak ditemukan." }, 404);
    const input = c.req.valid("json");
    if (input.itemType !== item.itemType) {
      return c.json({ ok: false, message: "Jenis butir tidak dapat diubah. Hapus butir ini lalu buat butir baru bila ingin mengganti jenisnya." }, 400);
    }
    await db.update(worksheetItems).set({
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      prompt: input.prompt,
      optionsJson: input.options ?? null,
      answerKey: input.answerKey ?? null,
      explanation: input.explanation ?? null,
      points: input.points,
    }).where(eq(worksheetItems.id, itemId));
    const [updated] = await db.select().from(worksheetItems).where(eq(worksheetItems.id, itemId)).limit(1);
    return c.json({ ok: true, data: serializeItem(updated!) });
  },
);

worksheetRoutes.delete("/:id/items/:itemId", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));
  if (![worksheetId, itemId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID LKPD atau butir tidak valid." }, 400);
  }
  if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
  const [item] = await db
    .select({ id: worksheetItems.id })
    .from(worksheetItems)
    .where(and(eq(worksheetItems.id, itemId), eq(worksheetItems.worksheetId, worksheetId)))
    .limit(1);
  if (!item) return c.json({ ok: false, message: "Butir tidak ditemukan." }, 404);
  // Butir yang sudah dijawab murid adalah bagian dari riwayat penilaian;
  // menghapusnya akan merusak jawaban dan skor yang sudah tercatat.
  const [answer] = await db
    .select({ id: worksheetAnswers.id })
    .from(worksheetAnswers)
    .where(eq(worksheetAnswers.worksheetItemId, itemId))
    .limit(1);
  if (answer) {
    return c.json({ ok: false, message: "Butir ini sudah memiliki jawaban murid dan tidak dapat dihapus." }, 409);
  }
  await db.delete(worksheetItems).where(eq(worksheetItems.id, itemId));
  return c.json({ ok: true, data: { id: itemId } });
});
