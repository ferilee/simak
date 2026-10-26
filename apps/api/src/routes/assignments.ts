import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// Penugasan ke kelas: jadwal buka/tutup, tautan kuis RUAS (Tahap 3).
export const assignmentRoutes = new Hono();

assignmentRoutes.use("*", requireRole("guru"));

assignmentRoutes.get("/", (c) => c.json({ ok: true, data: [] }));
assignmentRoutes.post("/", (c) => c.json({ ok: false, message: "Tahap 3." }, 501));
assignmentRoutes.patch("/:id", (c) => c.json({ ok: false, message: "Tahap 3." }, 501));

// Exit ticket 3-2-1 terikat penugasan (diisi murid; rute murid ada di murid.ts bila dipisah).
assignmentRoutes.post("/:id/exit-ticket", (c) =>
  c.json({ ok: false, message: "Tahap 3." }, 501),
);
