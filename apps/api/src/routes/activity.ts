import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { activitySchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { studentCanAccessModule, studentIsAssignmentTarget } from "../lib/assignment-target";
import { countMaterialWords, minReadingSeconds, planCompletion } from "../lib/baca-wajar";
import { awardXp } from "../lib/xp";

// Pencatatan peristiwa belajar untuk presensi otomatis dan rekap bukti.
export const activityRoutes = new Hono();

activityRoutes.use("*", requireRole("murid"));

const { activityLogs, assignments, moduleBlocks, modules } = schema;

activityRoutes.post("/", zValidator("json", activitySchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");

  // Tuntas membaca dicatat per modul (bukan per penugasan): murid menyatakan
  // sudah membaca materi sampai habis. Akses modul diperiksa dengan aturan
  // keterlihatan berbasis penugasan yang sama seperti GET
  // /murid/modules/:id (lib/assignment-target.ts).
  if (input.event === "baca_materi_tuntas") {
    const moduleId = input.moduleId!;
    const [module] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.status, "terbit")))
      .limit(1);
    if (!module) return c.json({ ok: false, message: "Materi tidak ditemukan." }, 404);
    if (!(await studentCanAccessModule(user.userId, moduleId))) {
      return c.json({ ok: false, message: "Materi ini belum tersedia untuk kelas Anda." }, 403);
    }

    // Gerbang keplausiban (lib/baca-wajar): ketuntasan hanya dicatat
    // bila waktu membaca aktif yang dilaporkan klien masuk akal untuk
    // panjang materi. Ambangnya dihitung dari blok modul yang sama
    // dengan yang dibaca murid.
    const blocks = await db
      .select({ type: moduleBlocks.type, contentJson: moduleBlocks.contentJson })
      .from(moduleBlocks)
      .where(eq(moduleBlocks.moduleId, moduleId))
      .orderBy(asc(moduleBlocks.sortOrder));
    const wordCount = countMaterialWords(blocks.map((block) => ({ type: block.type, content: block.contentJson })));
    const minSeconds = minReadingSeconds(wordCount);
    const activeSeconds = input.activeSeconds ?? null;

    // Satu catatan tuntas per murid per modul sudah cukup: yang sudah
    // tercatat dijawab tuntas tanpa insert dan tanpa XP ulang.
    const [existing] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(and(eq(activityLogs.studentId, user.userId), eq(activityLogs.moduleId, moduleId), eq(activityLogs.event, "baca_materi_tuntas")))
      .limit(1);
    if (existing) {
      return c.json({ ok: true, completed: true, min_seconds: minSeconds, active_seconds: activeSeconds });
    }

    const plan = planCompletion({ wordCount, activeSeconds: activeSeconds ?? 0 });
    if (!plan.completed) {
      // Belum wajar: JANGAN catat, JANGAN bayar XP — jawab dengan
      // sisa waktu agar klien membimbing murid melanjutkan membaca.
      // Ini bukan galat dan bukan tuduhan; respons tetap 200 ok.
      return c.json({
        ok: true,
        completed: false,
        min_seconds: plan.minSeconds,
        active_seconds: activeSeconds,
        remaining_seconds: plan.remainingSeconds,
      });
    }

    await db.insert(activityLogs).values({
      studentId: user.userId,
      assignmentId: null,
      moduleId,
      event: "baca_materi_tuntas",
    });
    // XP materi tuntas: dibayar tepat di sini — satu-satunya tempat
    // catatan tuntas pertama dibuat, jadi tidak mungkin ganda.
    await awardXp(user.userId, "materi_tuntas", moduleId);
    return c.json({ ok: true, completed: true, min_seconds: minSeconds, active_seconds: activeSeconds });
  }

  const [assignment] = await db
    .select({ id: assignments.id, moduleId: assignments.moduleId })
    .from(assignments)
    .where(and(eq(assignments.id, input.assignmentId!), eq(assignments.status, "terbit")))
    .limit(1);
  const access = assignment && (await studentIsAssignmentTarget(assignment.id, user.userId)) ? assignment : undefined;
  if (!access) return c.json({ ok: false, message: "Penugasan tidak tersedia untuk Anda." }, 404);
  await db.insert(activityLogs).values({
    studentId: user.userId,
    assignmentId: input.assignmentId!,
    moduleId: input.event === "buka_materi" ? access.moduleId : null,
    event: input.event,
  });
  return c.json({ ok: true });
});
