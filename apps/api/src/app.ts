import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { classRoutes } from "./routes/classes";
import { moduleRoutes } from "./routes/modules";
import { worksheetRoutes } from "./routes/worksheets";
import { assignmentRoutes } from "./routes/assignments";
import { muridRoutes } from "./routes/murid";
import { submissionRoutes } from "./routes/submissions";
import { gradingRoutes } from "./routes/grading";
import { reportRoutes } from "./routes/reports";
import { uploadRoutes } from "./routes/uploads";
import { activityRoutes } from "./routes/activity";
import { integrityRoutes } from "./routes/integrity";
import { env } from "./lib/env";
import { loadSession } from "./middleware/auth";

export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "/api/*",
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use("/api/*", loadSession);

  app.get("/health", (c) => c.json({ ok: true, service: "simak-api" }));

  const v1 = new Hono();
  v1.route("/auth", authRoutes);
  v1.route("/classes", classRoutes);
  v1.route("/modules", moduleRoutes);
  v1.route("/worksheets", worksheetRoutes);
  v1.route("/assignments", assignmentRoutes);
  v1.route("/murid", muridRoutes);
  v1.route("/submissions", submissionRoutes);
  v1.route("/grading", gradingRoutes);
  v1.route("/reports", reportRoutes);
  v1.route("/uploads", uploadRoutes);
  v1.route("/activity", activityRoutes);
  v1.route("/integrity", integrityRoutes);

  app.route("/api/v1", v1);

  return app;
}
