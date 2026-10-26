import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// Beranda murid + detail penugasan — halaman paling ringan adalah prioritas.
export const muridRoutes = new Hono();

muridRoutes.use("*", requireRole("murid"));

muridRoutes.get("/today", (c) => c.json({ ok: true, data: [] }));
muridRoutes.get("/assignments/:id", (c) => c.json({ ok: true, data: null }));
