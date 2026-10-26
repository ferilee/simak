import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// Draf jawaban (autosave) + pengumpulan (Tahap 2–3).
// Penilaian otomatis hanya untuk isian_singkat, pilihan_ganda, langkah_berurutan.
export const submissionRoutes = new Hono();

submissionRoutes.use("*", requireRole("murid"));

submissionRoutes.put("/:id/answers", (c) => c.json({ ok: false, message: "Tahap 2." }, 501));
submissionRoutes.post("/:id/submit", (c) => c.json({ ok: false, message: "Tahap 3." }, 501));
