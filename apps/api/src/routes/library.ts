import { Hono } from "hono";
import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";
import { env } from "../lib/env";
import {
  alreadyCopiedGuard,
  approvalsGuard,
  buildApprovalQueueEntry,
  buildLibraryModuleEntry,
  buildLibraryWorksheetEntry,
  copiedSourceIdSet,
  copyGuard,
  decisionGuard,
  isLibraryApprover,
  mergeApprovalQueue,
  mergeLibraryEntries,
  moduleBlockCopyValues,
  moduleCopyValues,
  planApprovalCarryIds,
  planModuleCopyWorksheets,
  previewGuard,
  shareFieldsForStatus,
  shareTransitionValues,
  tarikGuard,
  worksheetCopyValues,
  worksheetItemCopyValues,
} from "../lib/library";

// Perpustakaan Bersama (Fase 1): katalog materi + LKPD yang dibagikan guru
// lain. Semua route di sini khusus guru (requireRole("guru")) — murid
// menerima 403 dan tidak pernah melihat katalog, pratinjau, apalagi kunci
// jawaban yang ikut tampil di pratinjau LKPD (permukaan khusus guru).
// Kepemilikan menentukan segalanya: katalog dan pratinjau hanya memuat
// materi guru LAIN yang sedang dibagikan; penyalinan membuat draf baru
// milik penyalin dalam satu transaksi.
export const libraryRoutes = new Hono();

const { moduleBlocks, modules, users, worksheetItems, worksheets } = schema;

const MODULE_NOT_FOUND = "Modul tidak ditemukan di perpustakaan.";
const WORKSHEET_NOT_FOUND = "LKPD tidak ditemukan di perpustakaan.";

function parseLibraryId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ownerName(teacherId: number): Promise<string> {
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, teacherId)).limit(1);
  return owner?.name ?? "Guru";
}

libraryRoutes.get("/", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const kindParam = c.req.query("kind") ?? "all";
  if (kindParam !== "all" && kindParam !== "module" && kindParam !== "worksheet") {
    return c.json({ ok: false, message: "Jenis katalog tidak valid." }, 400);
  }
  const q = (c.req.query("q") ?? "").trim();
  const pattern = q ? `%${q}%` : null;

  const moduleEntries = [];
  if (kindParam === "all" || kindParam === "module") {
    const rows = await db
      .select({
        id: modules.id,
        title: modules.title,
        subject: modules.subject,
        ownerName: users.name,
        sharedAt: modules.sharedAt,
      })
      .from(modules)
      .innerJoin(users, eq(users.id, modules.teacherId))
      .where(
        and(
          eq(modules.isShared, true),
          ne(modules.teacherId, user.userId),
          ...(pattern ? [or(like(modules.title, pattern), like(modules.subject, pattern))] : []),
        ),
      )
      .orderBy(desc(modules.sharedAt));
    const ids = rows.map((row) => row.id);
    const blockCounts = new Map<number, number>();
    const sharedWorksheetCounts = new Map<number, number>();
    const copiedModuleIds = new Set<number>();
    if (ids.length > 0) {
      // Satu query untuk semua id di halaman ini: salinan MILIK peminta
      // (keadaan apa pun) yang copied_from_id-nya menunjuk ke katalog ini.
      const copyRows = await db
        .select({ copiedFromId: modules.copiedFromId })
        .from(modules)
        .where(and(eq(modules.teacherId, user.userId), inArray(modules.copiedFromId, ids)));
      for (const id of copiedSourceIdSet(copyRows)) copiedModuleIds.add(id);
      const blockRows = await db
        .select({ moduleId: moduleBlocks.moduleId, count: sql<number>`count(${moduleBlocks.id})` })
        .from(moduleBlocks)
        .where(inArray(moduleBlocks.moduleId, ids))
        .groupBy(moduleBlocks.moduleId);
      for (const row of blockRows) blockCounts.set(row.moduleId, Number(row.count));
      const worksheetRows = await db
        .select({ moduleId: worksheets.moduleId, count: sql<number>`count(${worksheets.id})` })
        .from(worksheets)
        .where(and(inArray(worksheets.moduleId, ids), eq(worksheets.isShared, true)))
        .groupBy(worksheets.moduleId);
      for (const row of worksheetRows) {
        if (row.moduleId !== null) sharedWorksheetCounts.set(row.moduleId, Number(row.count));
      }
    }
    for (const row of rows) {
      moduleEntries.push(
        buildLibraryModuleEntry({
          id: row.id,
          title: row.title,
          subject: row.subject,
          ownerName: row.ownerName,
          sharedAt: row.sharedAt,
          blockCount: blockCounts.get(row.id) ?? 0,
          sharedWorksheetCount: sharedWorksheetCounts.get(row.id) ?? 0,
          sudahDisalin: copiedModuleIds.has(row.id),
        }),
      );
    }
  }

  const worksheetEntries = [];
  if (kindParam === "all" || kindParam === "worksheet") {
    const rows = await db
      .select({
        id: worksheets.id,
        title: worksheets.title,
        subject: modules.subject,
        ownerName: users.name,
        sharedAt: worksheets.sharedAt,
      })
      .from(worksheets)
      .innerJoin(users, eq(users.id, worksheets.teacherId))
      .leftJoin(modules, eq(modules.id, worksheets.moduleId))
      .where(
        and(
          eq(worksheets.isShared, true),
          ne(worksheets.teacherId, user.userId),
          ...(pattern ? [like(worksheets.title, pattern)] : []),
        ),
      )
      .orderBy(desc(worksheets.sharedAt));
    const ids = rows.map((row) => row.id);
    const itemStats = new Map<number, { count: number; points: number }>();
    const copiedWorksheetIds = new Set<number>();
    if (ids.length > 0) {
      const copyRows = await db
        .select({ copiedFromId: worksheets.copiedFromId })
        .from(worksheets)
        .where(and(eq(worksheets.teacherId, user.userId), inArray(worksheets.copiedFromId, ids)));
      for (const id of copiedSourceIdSet(copyRows)) copiedWorksheetIds.add(id);
      const statRows = await db
        .select({
          worksheetId: worksheetItems.worksheetId,
          count: sql<number>`count(${worksheetItems.id})`,
          points: sql<number>`coalesce(sum(${worksheetItems.points}), 0)`,
        })
        .from(worksheetItems)
        .where(inArray(worksheetItems.worksheetId, ids))
        .groupBy(worksheetItems.worksheetId);
      for (const row of statRows) itemStats.set(row.worksheetId, { count: Number(row.count), points: Number(row.points) });
    }
    for (const row of rows) {
      const stats = itemStats.get(row.id) ?? { count: 0, points: 0 };
      worksheetEntries.push(
        buildLibraryWorksheetEntry({
          id: row.id,
          title: row.title,
          subject: row.subject,
          ownerName: row.ownerName,
          sharedAt: row.sharedAt,
          itemCount: stats.count,
          totalPoints: stats.points,
          sudahDisalin: copiedWorksheetIds.has(row.id),
        }),
      );
    }
  }

  // Meta penampil untuk halaman katalog: apakah penampil adalah penyetuju
  // Perpustakaan Bersama (mode persetujuan aktif + username cocok) dan
  // berapa pengajuan yang sedang menunggu keputusannya. Guru lain selalu
  // menerima approver=false dan pending_count=0.
  const approver = isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER);
  let pendingCount = 0;
  if (approver) {
    const [modulePending] = await db
      .select({ count: sql<number>`count(${modules.id})` })
      .from(modules)
      .where(eq(modules.shareStatus, "menunggu"));
    const [worksheetPending] = await db
      .select({ count: sql<number>`count(${worksheets.id})` })
      .from(worksheets)
      .where(eq(worksheets.shareStatus, "menunggu"));
    pendingCount = Number(modulePending?.count ?? 0) + Number(worksheetPending?.count ?? 0);
  }

  return c.json({ ok: true, data: mergeLibraryEntries(moduleEntries, worksheetEntries), approver, pending_count: pendingCount });
});

libraryRoutes.get("/modules/:id", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const moduleId = parseLibraryId(c.req.param("id"));
  if (moduleId === null) return c.json({ ok: false, message: MODULE_NOT_FOUND }, 404);
  const [module] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  const guard = previewGuard(module, user.userId, MODULE_NOT_FOUND, {
    isApprover: isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER),
  });
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);

  const blocks = await db
    .select()
    .from(moduleBlocks)
    .where(eq(moduleBlocks.moduleId, moduleId))
    .orderBy(asc(moduleBlocks.sortOrder), asc(moduleBlocks.id));
  const sharedWorksheets = await db
    .select()
    .from(worksheets)
    .where(and(eq(worksheets.moduleId, moduleId), eq(worksheets.isShared, true)))
    .orderBy(asc(worksheets.id));
  const worksheetSummaries = [];
  for (const worksheet of sharedWorksheets) {
    const [stats] = await db
      .select({
        count: sql<number>`count(${worksheetItems.id})`,
        points: sql<number>`coalesce(sum(${worksheetItems.points}), 0)`,
      })
      .from(worksheetItems)
      .where(eq(worksheetItems.worksheetId, worksheet.id));
    worksheetSummaries.push({
      id: worksheet.id,
      title: worksheet.title,
      item_count: Number(stats?.count ?? 0),
      total_points: Number(stats?.points ?? 0),
    });
  }

  return c.json({
    ok: true,
    data: {
      kind: "module",
      id: module!.id,
      title: module!.title,
      subject: module!.subject,
      description: module!.description,
      cover_key: module!.coverKey,
      owner_name: await ownerName(module!.teacherId),
      shared_at: module!.sharedAt,
      blocks: blocks.map((block) => ({
        id: block.id,
        sort_order: block.sortOrder,
        type: block.type,
        content: block.contentJson,
        attachment_key: block.attachmentKey,
      })),
      worksheets: worksheetSummaries,
    },
  });
});

libraryRoutes.get("/worksheets/:id", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = parseLibraryId(c.req.param("id"));
  if (worksheetId === null) return c.json({ ok: false, message: WORKSHEET_NOT_FOUND }, 404);
  const [worksheet] = await db.select().from(worksheets).where(eq(worksheets.id, worksheetId)).limit(1);
  const guard = previewGuard(worksheet, user.userId, WORKSHEET_NOT_FOUND, {
    isApprover: isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER),
  });
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);

  const [module] = worksheet!.moduleId
    ? await db.select({ subject: modules.subject }).from(modules).where(eq(modules.id, worksheet!.moduleId)).limit(1)
    : [];
  const items = await db
    .select()
    .from(worksheetItems)
    .where(eq(worksheetItems.worksheetId, worksheetId))
    .orderBy(asc(worksheetItems.sortOrder), asc(worksheetItems.id));

  return c.json({
    ok: true,
    data: {
      kind: "worksheet",
      id: worksheet!.id,
      title: worksheet!.title,
      instructions: worksheet!.instructions,
      subject: module?.subject ?? null,
      module_id: worksheet!.moduleId,
      owner_name: await ownerName(worksheet!.teacherId),
      shared_at: worksheet!.sharedAt,
      items: items.map((item) => ({
        id: item.id,
        sort_order: item.sortOrder,
        item_type: item.itemType,
        prompt: item.prompt,
        options: item.optionsJson,
        answer_key: item.answerKey,
        explanation: item.explanation,
        points: item.points,
        rubric_max: item.rubricMax,
      })),
    },
  });
});

// Salin satu LKPD (dipakai route publik di bawah dan salinan modul):
// menyalin LKPD + semua butirnya ke pemilik baru dalam transaksi yang
// diberikan pemanggil. Mengembalikan id salinan.
async function copyWorksheetInsideTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  source: typeof worksheets.$inferSelect,
  items: (typeof worksheetItems.$inferSelect)[],
  copierId: number,
  newModuleId: number | null,
  sourceOwnerName: string,
): Promise<number> {
  const [created] = await tx
    .insert(worksheets)
    .values(worksheetCopyValues(source, copierId, newModuleId, sourceOwnerName))
    .$returningId();
  const newWorksheetId = created!.id;
  if (items.length > 0) {
    await tx.insert(worksheetItems).values(items.map((item) => worksheetItemCopyValues(item, newWorksheetId)));
  }
  return newWorksheetId;
}

libraryRoutes.post("/modules/:id/copy", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const moduleId = parseLibraryId(c.req.param("id"));
  if (moduleId === null) return c.json({ ok: false, message: MODULE_NOT_FOUND }, 404);
  const [source] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  const guard = copyGuard(source, user.userId, MODULE_NOT_FOUND);
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);
  const [existingModuleCopy] = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.teacherId, user.userId), eq(modules.copiedFromId, moduleId)))
    .limit(1);
  const duplicate = alreadyCopiedGuard(Boolean(existingModuleCopy), "Modul ini sudah pernah Anda salin.");
  if (!duplicate.ok) return c.json({ ok: false, message: duplicate.message }, duplicate.status);
  const sourceOwnerName = await ownerName(source!.teacherId);

  const blocks = await db
    .select()
    .from(moduleBlocks)
    .where(eq(moduleBlocks.moduleId, moduleId))
    .orderBy(asc(moduleBlocks.sortOrder), asc(moduleBlocks.id));
  const attached = await db
    .select()
    .from(worksheets)
    .where(and(eq(worksheets.moduleId, moduleId), eq(worksheets.teacherId, source!.teacherId)))
    .orderBy(asc(worksheets.id));
  const copiedWorksheetIds = planModuleCopyWorksheets(attached);
  const itemsByWorksheet = new Map<number, (typeof worksheetItems.$inferSelect)[]>();
  if (copiedWorksheetIds.length > 0) {
    const itemRows = await db
      .select()
      .from(worksheetItems)
      .where(inArray(worksheetItems.worksheetId, copiedWorksheetIds))
      .orderBy(asc(worksheetItems.sortOrder), asc(worksheetItems.id));
    for (const item of itemRows) {
      const list = itemsByWorksheet.get(item.worksheetId) ?? [];
      list.push(item);
      itemsByWorksheet.set(item.worksheetId, list);
    }
  }
  const attachedById = new Map(attached.map((worksheet) => [worksheet.id, worksheet]));

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(modules)
      .values(moduleCopyValues(source!, user.userId, sourceOwnerName))
      .$returningId();
    const newModuleId = created!.id;
    if (blocks.length > 0) {
      await tx.insert(moduleBlocks).values(blocks.map((block) => moduleBlockCopyValues(block, newModuleId)));
    }
    const worksheetIds: number[] = [];
    for (const sourceWorksheetId of copiedWorksheetIds) {
      const sourceWorksheet = attachedById.get(sourceWorksheetId)!;
      const newWorksheetId = await copyWorksheetInsideTx(
        tx,
        sourceWorksheet,
        itemsByWorksheet.get(sourceWorksheetId) ?? [],
        user.userId,
        newModuleId,
        sourceOwnerName,
      );
      worksheetIds.push(newWorksheetId);
    }
    return { module_id: newModuleId, worksheet_ids: worksheetIds };
  });

  return c.json({ ok: true, data: result }, 201);
});

libraryRoutes.post("/worksheets/:id/copy", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = parseLibraryId(c.req.param("id"));
  if (worksheetId === null) return c.json({ ok: false, message: WORKSHEET_NOT_FOUND }, 404);
  const [source] = await db.select().from(worksheets).where(eq(worksheets.id, worksheetId)).limit(1);
  const guard = copyGuard(source, user.userId, WORKSHEET_NOT_FOUND);
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);
  const [existingWorksheetCopy] = await db
    .select({ id: worksheets.id })
    .from(worksheets)
    .where(and(eq(worksheets.teacherId, user.userId), eq(worksheets.copiedFromId, worksheetId)))
    .limit(1);
  const duplicate = alreadyCopiedGuard(Boolean(existingWorksheetCopy), "LKPD ini sudah pernah Anda salin.");
  if (!duplicate.ok) return c.json({ ok: false, message: duplicate.message }, duplicate.status);
  const sourceOwnerName = await ownerName(source!.teacherId);
  const items = await db
    .select()
    .from(worksheetItems)
    .where(eq(worksheetItems.worksheetId, worksheetId))
    .orderBy(asc(worksheetItems.sortOrder), asc(worksheetItems.id));

  const newWorksheetId = await db.transaction(async (tx) =>
    copyWorksheetInsideTx(tx, source!, items, user.userId, null, sourceOwnerName),
  );
  return c.json({ ok: true, data: { worksheet_id: newWorksheetId } }, 201);
});

// ---------------------------------------------------------------------------
// Antrean persetujuan berbagi (Fase 2). Semua endpoint di bawah khusus
// PENYETUJU Perpustakaan Bersama (username yang terkonfigurasi di
// SIMAK_LIBRARY_APPROVER): guru lain — dan siapa pun saat mode persetujuan
// nonaktif — menerima 403 yang sama. Pengajuan 'menunggu' tidak pernah
// bocor ke katalog, pratinjau guru lain, atau penyalinan; hanya penyetuju
// yang melihatnya, lewat antrean ini dan pratinjau yang diperluas untuknya.
// ---------------------------------------------------------------------------

function approverGate(user: { username: string }) {
  return approvalsGuard(isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER));
}

libraryRoutes.get("/approvals", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const gate = approverGate(user);
  if (!gate.ok) return c.json({ ok: false, message: gate.message }, gate.status);

  const moduleRows = await db
    .select({
      id: modules.id,
      title: modules.title,
      subject: modules.subject,
      ownerName: users.name,
      shareRequestedAt: modules.shareRequestedAt,
    })
    .from(modules)
    .innerJoin(users, eq(users.id, modules.teacherId))
    .where(eq(modules.shareStatus, "menunggu"));
  const moduleIds = moduleRows.map((row) => row.id);
  const blockCounts = new Map<number, number>();
  const pendingWorksheetCounts = new Map<number, number>();
  if (moduleIds.length > 0) {
    const blockRows = await db
      .select({ moduleId: moduleBlocks.moduleId, count: sql<number>`count(${moduleBlocks.id})` })
      .from(moduleBlocks)
      .where(inArray(moduleBlocks.moduleId, moduleIds))
      .groupBy(moduleBlocks.moduleId);
    for (const row of blockRows) blockCounts.set(row.moduleId, Number(row.count));
    const worksheetRows = await db
      .select({ moduleId: worksheets.moduleId, count: sql<number>`count(${worksheets.id})` })
      .from(worksheets)
      .where(and(inArray(worksheets.moduleId, moduleIds), eq(worksheets.shareStatus, "menunggu")))
      .groupBy(worksheets.moduleId);
    for (const row of worksheetRows) {
      if (row.moduleId !== null) pendingWorksheetCounts.set(row.moduleId, Number(row.count));
    }
  }
  const moduleEntries = moduleRows.map((row) =>
    buildApprovalQueueEntry({
      kind: "module",
      id: row.id,
      title: row.title,
      ownerName: row.ownerName,
      shareRequestedAt: row.shareRequestedAt,
      subject: row.subject,
      blockCount: blockCounts.get(row.id) ?? 0,
      pendingWorksheetCount: pendingWorksheetCounts.get(row.id) ?? 0,
      itemCount: null,
    }),
  );

  const worksheetRows = await db
    .select({
      id: worksheets.id,
      title: worksheets.title,
      subject: modules.subject,
      ownerName: users.name,
      shareRequestedAt: worksheets.shareRequestedAt,
    })
    .from(worksheets)
    .innerJoin(users, eq(users.id, worksheets.teacherId))
    .leftJoin(modules, eq(modules.id, worksheets.moduleId))
    .where(eq(worksheets.shareStatus, "menunggu"));
  const worksheetIds = worksheetRows.map((row) => row.id);
  const itemCounts = new Map<number, number>();
  if (worksheetIds.length > 0) {
    const itemRows = await db
      .select({ worksheetId: worksheetItems.worksheetId, count: sql<number>`count(${worksheetItems.id})` })
      .from(worksheetItems)
      .where(inArray(worksheetItems.worksheetId, worksheetIds))
      .groupBy(worksheetItems.worksheetId);
    for (const row of itemRows) itemCounts.set(row.worksheetId, Number(row.count));
  }
  const worksheetEntries = worksheetRows.map((row) =>
    buildApprovalQueueEntry({
      kind: "worksheet",
      id: row.id,
      title: row.title,
      ownerName: row.ownerName,
      shareRequestedAt: row.shareRequestedAt,
      subject: row.subject,
      blockCount: null,
      pendingWorksheetCount: null,
      itemCount: itemCounts.get(row.id) ?? 0,
    }),
  );

  return c.json({ ok: true, data: mergeApprovalQueue(moduleEntries, worksheetEntries) });
});

const approvalDecisionSchema = z.object({ decision: z.enum(["setujui", "tolak"]) });

libraryRoutes.post("/approvals/modules/:id", requireRole("guru"), zValidator("json", approvalDecisionSchema), async (c) => {
  const user = c.get("user")!;
  const gate = approverGate(user);
  if (!gate.ok) return c.json({ ok: false, message: gate.message }, gate.status);
  const moduleId = parseLibraryId(c.req.param("id"));
  if (moduleId === null) return c.json({ ok: false, message: MODULE_NOT_FOUND }, 404);
  const [module] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  const guard = decisionGuard(module, MODULE_NOT_FOUND);
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);
  const { decision } = c.req.valid("json");
  const now = new Date();

  if (decision === "tolak") {
    // Penolakan bersifat bedah: hanya modul ini yang berubah. LKPD-nya
    // yang masih 'menunggu' TETAP 'menunggu' sebagai pengajuan sendiri.
    await db
      .update(modules)
      .set(shareTransitionValues(shareFieldsForStatus("ditolak", now)))
      .where(eq(modules.id, moduleId));
    return c.json({ ok: true, data: { kind: "modul", id: moduleId, share_status: "ditolak" } });
  }

  // Persetujuan membawa: LKPD modul yang masih 'menunggu' ikut tayang
  // dalam transaksi yang sama dengan modulnya.
  const attached = await db
    .select({ id: worksheets.id, shareStatus: worksheets.shareStatus })
    .from(worksheets)
    .where(eq(worksheets.moduleId, moduleId));
  const carryIds = planApprovalCarryIds(attached);
  const approved = shareTransitionValues(shareFieldsForStatus("dibagikan", now));
  await db.transaction(async (tx) => {
    await tx.update(modules).set(approved).where(eq(modules.id, moduleId));
    if (carryIds.length > 0) {
      await tx.update(worksheets).set(approved).where(inArray(worksheets.id, carryIds));
    }
  });
  return c.json({ ok: true, data: { kind: "modul", id: moduleId, share_status: "dibagikan" } });
});

libraryRoutes.post("/approvals/worksheets/:id", requireRole("guru"), zValidator("json", approvalDecisionSchema), async (c) => {
  const user = c.get("user")!;
  const gate = approverGate(user);
  if (!gate.ok) return c.json({ ok: false, message: gate.message }, gate.status);
  const worksheetId = parseLibraryId(c.req.param("id"));
  if (worksheetId === null) return c.json({ ok: false, message: WORKSHEET_NOT_FOUND }, 404);
  const [worksheet] = await db.select().from(worksheets).where(eq(worksheets.id, worksheetId)).limit(1);
  const guard = decisionGuard(worksheet, WORKSHEET_NOT_FOUND);
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);
  const { decision } = c.req.valid("json");
  const now = new Date();
  const nextStatus = decision === "setujui" ? "dibagikan" : "ditolak";
  await db
    .update(worksheets)
    .set(shareTransitionValues(shareFieldsForStatus(nextStatus, now)))
    .where(eq(worksheets.id, worksheetId));
  return c.json({ ok: true, data: { kind: "lkpd", id: worksheetId, share_status: nextStatus } });
});

// Penarikan oleh penyetuju: menurunkan materi guru lain yang sedang tayang
// kembali menjadi pribadi. Salinan yang sudah dibuat guru lain adalah
// baris mandiri dan tidak terpengaruh — handler ini hanya menyentuh baris
// sumbernya. Materi milik penyetuju sendiri tidak ditarik dari sini
// (saklar Bagikan biasa yang mematikannya).
libraryRoutes.post("/approvals/modules/:id/tarik", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const gate = approverGate(user);
  if (!gate.ok) return c.json({ ok: false, message: gate.message }, gate.status);
  const moduleId = parseLibraryId(c.req.param("id"));
  if (moduleId === null) return c.json({ ok: false, message: MODULE_NOT_FOUND }, 404);
  const [module] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  const guard = tarikGuard(module, user.userId, MODULE_NOT_FOUND);
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);
  await db
    .update(modules)
    .set(shareTransitionValues(shareFieldsForStatus("pribadi", new Date())))
    .where(eq(modules.id, moduleId));
  return c.json({ ok: true, data: { kind: "modul", id: moduleId, share_status: "pribadi" } });
});

libraryRoutes.post("/approvals/worksheets/:id/tarik", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const gate = approverGate(user);
  if (!gate.ok) return c.json({ ok: false, message: gate.message }, gate.status);
  const worksheetId = parseLibraryId(c.req.param("id"));
  if (worksheetId === null) return c.json({ ok: false, message: WORKSHEET_NOT_FOUND }, 404);
  const [worksheet] = await db.select().from(worksheets).where(eq(worksheets.id, worksheetId)).limit(1);
  const guard = tarikGuard(worksheet, user.userId, WORKSHEET_NOT_FOUND);
  if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);
  await db
    .update(worksheets)
    .set(shareTransitionValues(shareFieldsForStatus("pribadi", new Date())))
    .where(eq(worksheets.id, worksheetId));
  return c.json({ ok: true, data: { kind: "lkpd", id: worksheetId, share_status: "pribadi" } });
});
