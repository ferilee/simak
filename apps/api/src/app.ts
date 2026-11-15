import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { classRoutes } from "./routes/classes";
import { moduleRoutes } from "./routes/modules";
import { worksheetRoutes } from "./routes/worksheets";
import { assignmentRoutes } from "./routes/assignments";
import { muridRoutes } from "./routes/murid";
import { avatarRoutes } from "./routes/avatar";
import { submissionRoutes } from "./routes/submissions";
import { gradingRoutes } from "./routes/grading";
import { reportRoutes } from "./routes/reports";
import { uploadRoutes } from "./routes/uploads";
import { activityRoutes } from "./routes/activity";
import { integrityRoutes } from "./routes/integrity";
import { libraryRoutes } from "./routes/library";
import { kurikulumRoutes } from "./routes/kurikulum";
import { guruRoutes } from "./routes/guru";
import { guruJurnalRoutes, muridJurnalRoutes } from "./routes/jurnal";
import { masukRuasRoutes, ruasInternalRoutes } from "./routes/serah-terima";
import { env } from "./lib/env";
import { loadSession } from "./middleware/auth";

export function createApp() {
  const app = new Hono();

  // Rute penukaran serah-terima (Hub Murid Tahap 4) dipasang SEBELUM
  // logger akses: path-nya memuat token sekali pakai, dan token tidak
  // boleh pernah tertulis di log (rancangan Bagian 6). Penangan rute
  // yang cocok menjawab tanpa memanggil next(), jadi rantai berhenti
  // di sini untuk path itu.
  app.route("/", masukRuasRoutes);

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
  // Avatar murid berbagi awalan /murid dengan router beranda: jalurnya
  // /murid/avatars* dan penjaga perannya sama (khusus murid).
  v1.route("/murid", avatarRoutes);
  v1.route("/submissions", submissionRoutes);
  v1.route("/grading", gradingRoutes);
  v1.route("/reports", reportRoutes);
  v1.route("/uploads", uploadRoutes);
  v1.route("/activity", activityRoutes);
  v1.route("/integrity", integrityRoutes);
  v1.route("/library", libraryRoutes);
  v1.route("/kurikulum", kurikulumRoutes);
  v1.route("/guru", guruRoutes);
  // Jurnal Belajar (Hub Murid Tahap 3) berbagi awalan dengan router
  // pemilik peran yang sama: sisi murid /murid/jurnal* (tulis milik
  // sendiri) dan sisi guru /guru/jurnal* (hanya-baca).
  v1.route("/murid", muridJurnalRoutes);
  v1.route("/guru", guruJurnalRoutes);

  app.route("/api/v1", v1);

  // Endpoint internal untuk RUAS (Hub Murid Tahap 4): penerbitan token
  // serah-terima masuk, dijaga rahasia bersama — bukan bagian dari v1.
  app.route("/api/internal/ruas", ruasInternalRoutes);

  return app;
}
