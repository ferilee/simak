import { Hono } from "hono";
import { requireRole } from "../middleware/auth";

// Rekap bukti = agregasi submissions + activity_logs + exit_tickets (Tahap 4).
// Format: ?format=pdf | xlsx
export const reportRoutes = new Hono();

reportRoutes.use("*", requireRole("guru"));

reportRoutes.get("/session", (c) => c.json({ ok: false, message: "Tahap 4." }, 501));
reportRoutes.get("/range", (c) => c.json({ ok: false, message: "Tahap 4." }, 501));
