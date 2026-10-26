import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// Daftar pengumpulan per kelas + penilaian blok manual (uraian, foto) oleh guru.
export const gradingRoutes = new Hono();

gradingRoutes.use("*", requireRole("guru"));

gradingRoutes.get("/assignments/:id", (c) => c.json({ ok: true, data: [] }));
gradingRoutes.patch("/answers/:id", (c) => c.json({ ok: false, message: "Tahap 3." }, 501));
