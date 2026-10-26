import { Hono } from "hono";

// Presigned URL RustFS: klien tidak pernah memegang kredensial storage.
// Pola kunci mengikuti tata letak bucket blueprint Bagian 08:
// materi/[teacherId]/[moduleId]/..., submissions/[assignmentId]/[studentId]/...
export const uploadRoutes = new Hono();

uploadRoutes.post("/presign", (c) => c.json({ ok: false, message: "Tahap 1." }, 501));
