import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// Modul materi + bloknya (Tahap 1). Isi content_json wajib lolos skema Zod
// moduleBlockContentSchema dari @simak/shared sebelum disimpan.
export const moduleRoutes = new Hono();

moduleRoutes.use("*", requireRole("guru"));

moduleRoutes.get("/", (c) => c.json({ ok: true, data: [] }));
moduleRoutes.post("/", (c) => c.json({ ok: false, message: "Tahap 1." }, 501));
moduleRoutes.patch("/:id", (c) => c.json({ ok: false, message: "Tahap 1." }, 501));
moduleRoutes.get("/:id/blocks", (c) => c.json({ ok: true, data: [] }));
moduleRoutes.post("/:id/blocks", (c) => c.json({ ok: false, message: "Tahap 1." }, 501));
