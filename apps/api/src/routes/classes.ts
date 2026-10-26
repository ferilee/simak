import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// CRUD kelas/rombel + anggota dari username/NIS yang dicocokkan ke akun RUAS.
export const classRoutes = new Hono();

classRoutes.use("*", requireRole("guru"));

classRoutes.get("/", (c) => c.json({ ok: true, data: [] }));
classRoutes.post("/", (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
classRoutes.patch("/:id", (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
classRoutes.get("/:id/members", (c) => c.json({ ok: true, data: [] }));
classRoutes.post("/:id/members", (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
