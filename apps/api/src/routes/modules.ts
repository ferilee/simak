import { Hono } from "hono";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, schema } from "@simak/db";
import {
  createModuleBlockSchema,
  createModuleSchema,
  reorderModuleBlocksSchema,
  updateModuleBlockSchema,
  updateModuleSchema,
} from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { env } from "../lib/env";
import {
  isLibraryApprover,
  libraryApprovalActive,
  nextShareState,
  nextShareTransition,
  planShareCascadeIds,
  shareFieldsForStatus,
  shareTransitionValues,
} from "../lib/library";
import { moduleDeleteGuard } from "../lib/deletion";

// Modul materi + bloknya (Tahap 1). Isi content_json wajib lolos skema Zod
// moduleBlockContentSchema dari @simak/shared sebelum disimpan.
export const moduleRoutes = new Hono();

const { modules, moduleBlocks, activityLogs, assignments, worksheetAttempts, worksheets } = schema;

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
    cover_key: module.coverKey,
    status: module.status,
    version: module.version,
    is_shared: module.isShared,
    shared_at: module.sharedAt,
    share_status: module.shareStatus,
    share_requested_at: module.shareRequestedAt,
    copied_from_id: module.copiedFromId,
    copied_from_teacher_name: module.copiedFromTeacherName,
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

const shareModuleSchema = z.object({
  shared: z.boolean(),
  include_worksheets: z.boolean().optional(),
});

// Saklar Perpustakaan Bersama untuk modul (Fase 1): hanya pemilik yang
// dapat menyalakan/mematikan. Menyalakan dengan include_worksheets=true
// ikut membagikan semua LKPD yang menempel pada modul ini; mematikan
// modul TIDAK menyentuh LKPD-nya (masing-masing LKPD punya saklarnya
// sendiri). Respons selalu memuat shared_worksheet_count agar UI dapat
// menjelaskan keadaan LKPD yang menempel apa adanya.
moduleRoutes.patch("/:id/share", requireRole("guru"), zValidator("json", shareModuleSchema), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  if (!Number.isInteger(moduleId) || moduleId <= 0) return c.json({ ok: false, message: "ID modul tidak valid." }, 400);
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  const input = c.req.valid("json");
  const now = new Date();

  if (!libraryApprovalActive(env.SIMAK_LIBRARY_APPROVER)) {
    // Mode persetujuan NONAKTIF (SIMAK_LIBRARY_APPROVER belum diatur):
    // perilaku Fase 1 persis — tayang langsung, tanpa antrean.
    const state = nextShareState(input.shared, now);

    await db.update(modules).set({ isShared: state.isShared, sharedAt: state.sharedAt }).where(eq(modules.id, moduleId));
    if (state.isShared && input.include_worksheets === true) {
      await db
        .update(worksheets)
        .set({ isShared: true, sharedAt: now })
        .where(and(eq(worksheets.moduleId, moduleId), eq(worksheets.teacherId, user.userId)));
    }
  } else {
    // Mode persetujuan AKTIF: saklar berjalan lewat mesin keadaan
    // nextShareTransition. Guru bukan penyetuju berhenti di 'menunggu';
    // penyetuju (dan penarikan oleh siapa pun) langsung berlaku.
    const next = nextShareTransition(
      {
        isShared: module.isShared,
        sharedAt: module.sharedAt,
        shareStatus: module.shareStatus,
        shareRequestedAt: module.shareRequestedAt,
      },
      input.shared,
      !isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER),
      now,
    );
    await db.update(modules).set(shareTransitionValues(next)).where(eq(modules.id, moduleId));
    if (input.shared && input.include_worksheets === true) {
      // Rangkaian: LKPD yang masih 'pribadi'/'ditolak' mengikuti keadaan
      // baru modul; yang sudah 'menunggu'/'dibagikan' tidak disentuh.
      const attached = await db
        .select({ id: worksheets.id, shareStatus: worksheets.shareStatus })
        .from(worksheets)
        .where(and(eq(worksheets.moduleId, moduleId), eq(worksheets.teacherId, user.userId)));
      const cascadeIds = planShareCascadeIds(attached, next.shareStatus);
      if (cascadeIds.length > 0) {
        await db
          .update(worksheets)
          .set(shareTransitionValues(shareFieldsForStatus(next.shareStatus, now)))
          .where(inArray(worksheets.id, cascadeIds));
      }
    }
  }

  const [updated] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  const [sharedCount] = await db
    .select({ count: sql<number>`count(${worksheets.id})` })
    .from(worksheets)
    .where(and(eq(worksheets.moduleId, moduleId), eq(worksheets.teacherId, user.userId), eq(worksheets.isShared, true)));
  return c.json({
    ok: true,
    data: { ...serializeModule(updated!), shared_worksheet_count: Number(sharedCount?.count ?? 0) },
  });
});

// Hapus permanen modul beserta seluruh isinya. Penjaganya di
// lib/deletion.ts: ditolak 409 bila ada penugasan yang menunjuk modul
// ini ATAU salah satu LKPD-nya, atau bila ada murid yang sudah
// mengerjakan LKPD apa pun di dalam modul ini. Objek penyimpanan
// (sampul, lampiran blok) TIDAK ikut dihapus — salinan Perpustakaan
// Bersama merujuk kunci yang sama, jadi berkas fisiknya harus bertahan.
// Baris activity_logs yang menunjuk modul ini menjadi NULL lewat
// onDelete "set null" pada skema; jejak aktivitas murid tidak hilang.
moduleRoutes.delete("/:id", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  if (!Number.isInteger(moduleId) || moduleId <= 0) return c.json({ ok: false, message: "ID modul tidak valid." }, 400);
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);

  const attachedWorksheets = await db.select({ id: worksheets.id }).from(worksheets).where(eq(worksheets.moduleId, moduleId));
  const worksheetIds = attachedWorksheets.map((row) => row.id);
  const [moduleAssignmentRefs] = await db
    .select({ count: sql<number>`count(${assignments.id})` })
    .from(assignments)
    .where(eq(assignments.moduleId, moduleId));
  const [worksheetAssignmentRefs] = worksheetIds.length
    ? await db
        .select({ count: sql<number>`count(${assignments.id})` })
        .from(assignments)
        .where(inArray(assignments.worksheetId, worksheetIds))
    : [{ count: 0 }];
  const [attempts] = worksheetIds.length
    ? await db
        .select({ count: sql<number>`count(${worksheetAttempts.id})` })
        .from(worksheetAttempts)
        .where(inArray(worksheetAttempts.worksheetId, worksheetIds))
    : [{ count: 0 }];
  const guard = moduleDeleteGuard({
    assignmentRefs: Number(moduleAssignmentRefs?.count ?? 0) + Number(worksheetAssignmentRefs?.count ?? 0),
    attemptCount: Number(attempts?.count ?? 0),
  });
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);

  await db.transaction(async (tx) => {
    // FK worksheets.module_id tidak mempunyai cascade, jadi LKPD modul
    // ini dihapus lebih dulu (butir-butirnya terhapus lewat cascade
    // worksheet_items.worksheet_id); blok modul terhapus lewat cascade
    // module_blocks.module_id saat baris modulnya dihapus.
    if (worksheetIds.length > 0) {
      await tx.delete(worksheets).where(inArray(worksheets.id, worksheetIds));
    }
    await tx.delete(modules).where(eq(modules.id, moduleId));
  });
  return c.json({ ok: true, data: { id: moduleId } });
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

// Route "/order" didaftarkan sebelum "/:blockId" agar segmen "order" tidak
// tertangkap sebagai id blok.
moduleRoutes.patch("/:id/blocks/order", requireRole("guru"), zValidator("json", reorderModuleBlocksSchema), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  if (!Number.isInteger(moduleId) || moduleId <= 0) return c.json({ ok: false, message: "ID modul tidak valid." }, 400);
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  const input = c.req.valid("json");
  const existing = await db.select({ id: moduleBlocks.id }).from(moduleBlocks).where(eq(moduleBlocks.moduleId, moduleId));
  const existingIds = new Set(existing.map((row) => row.id));
  const requestedIds = new Set(input.blockIds);
  if (
    input.blockIds.length !== existingIds.size
    || requestedIds.size !== input.blockIds.length
    || input.blockIds.some((blockId) => !existingIds.has(blockId))
  ) {
    return c.json({ ok: false, message: "Daftar urutan blok harus memuat semua blok modul ini tepat satu kali." }, 400);
  }
  for (const [index, blockId] of input.blockIds.entries()) {
    await db.update(moduleBlocks).set({ sortOrder: index }).where(eq(moduleBlocks.id, blockId));
  }
  const rows = await db.select().from(moduleBlocks).where(eq(moduleBlocks.moduleId, moduleId)).orderBy(asc(moduleBlocks.sortOrder));
  return c.json({ ok: true, data: rows.map(serializeBlock) });
});

moduleRoutes.patch("/:id/blocks/:blockId", requireRole("guru"), zValidator("json", updateModuleBlockSchema), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  const blockId = Number(c.req.param("blockId"));
  if (![moduleId, blockId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID modul atau blok tidak valid." }, 400);
  }
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  const [block] = await db
    .select()
    .from(moduleBlocks)
    .where(and(eq(moduleBlocks.id, blockId), eq(moduleBlocks.moduleId, moduleId)))
    .limit(1);
  if (!block) return c.json({ ok: false, message: "Blok tidak ditemukan." }, 404);
  const input = c.req.valid("json");
  if (input.content.type !== block.type) {
    return c.json({ ok: false, message: "Jenis blok tidak dapat diubah. Hapus blok ini lalu buat blok baru bila ingin mengganti jenisnya." }, 400);
  }
  const update: Partial<typeof moduleBlocks.$inferInsert> = { contentJson: input.content };
  if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;
  // Kolom attachment_key tingkat blok mengikuti lampiran pada isi blok
  // (gambar/berkas) bila body tidak mengirimkannya secara eksplisit.
  const contentAttachmentKey = "attachmentKey" in input.content ? input.content.attachmentKey : undefined;
  const attachmentKey = input.attachmentKey ?? contentAttachmentKey;
  if (attachmentKey !== undefined) update.attachmentKey = attachmentKey;
  await db.update(moduleBlocks).set(update).where(eq(moduleBlocks.id, blockId));
  const [updated] = await db.select().from(moduleBlocks).where(eq(moduleBlocks.id, blockId)).limit(1);
  return c.json({ ok: true, data: serializeBlock(updated!) });
});

moduleRoutes.delete("/:id/blocks/:blockId", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const moduleId = Number(c.req.param("id"));
  const blockId = Number(c.req.param("blockId"));
  if (![moduleId, blockId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID modul atau blok tidak valid." }, 400);
  }
  const module = await ownedModule(user.userId, moduleId);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  const [block] = await db
    .select({ id: moduleBlocks.id })
    .from(moduleBlocks)
    .where(and(eq(moduleBlocks.id, blockId), eq(moduleBlocks.moduleId, moduleId)))
    .limit(1);
  if (!block) return c.json({ ok: false, message: "Blok tidak ditemukan." }, 404);
  await db.delete(moduleBlocks).where(eq(moduleBlocks.id, blockId));
  return c.json({ ok: true, data: { id: blockId } });
});
