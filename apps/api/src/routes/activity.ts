import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { activitySchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// Pencatatan peristiwa belajar untuk presensi otomatis dan rekap bukti.
export const activityRoutes = new Hono();

activityRoutes.use("*", requireRole("murid"));

activityRoutes.post("/", zValidator("json", activitySchema), async (c) => {
  // TODO Tahap 4: tulis ke activity_logs.
  return c.json({ ok: true });
});
