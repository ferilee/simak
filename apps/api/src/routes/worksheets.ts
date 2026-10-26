import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// LKPD + butir blok interaktifnya (Tahap 2).
// Opsi butir divalidasi worksheetItemOptionsSchema dari @simak/shared.
export const worksheetRoutes = new Hono();

worksheetRoutes.use("*", requireRole("guru"));

worksheetRoutes.get("/", (c) => c.json({ ok: true, data: [] }));
worksheetRoutes.post("/", (c) => c.json({ ok: false, message: "Tahap 2." }, 501));
worksheetRoutes.patch("/:id", (c) => c.json({ ok: false, message: "Tahap 2." }, 501));
worksheetRoutes.get("/:id/items", (c) => c.json({ ok: true, data: [] }));
worksheetRoutes.post("/:id/items", (c) => c.json({ ok: false, message: "Tahap 2." }, 501));
