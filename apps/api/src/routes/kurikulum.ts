import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import { findCurriculumSet, listCurriculumSummaries, listTopicGroups } from "../lib/kurikulum";

// Daftar CP & ATP (Tahap 1): referensi kurikulum baca-saja untuk guru.
// Datanya statis di lib/kurikulum.ts (dokumen kurikulum yang disetujui,
// terbit bersama kode) — tidak ada tabel dan tidak ada jalur tulis di
// tahap ini. Semua route khusus guru (requireRole("guru")): murid
// menerima 403, sama seperti permukaan khusus guru lainnya.
export const kurikulumRoutes = new Hono();

kurikulumRoutes.get("/", requireRole("guru"), (c) => {
  return c.json({ ok: true, data: listCurriculumSummaries() });
});

// Daftar kelompok materi per mapel untuk dropdown "Kelompok materi"
// pada formulir modul (saringan kelompok di ruang guru).
kurikulumRoutes.get("/groups", requireRole("guru"), (c) => {
  return c.json({ ok: true, data: listTopicGroups() });
});

kurikulumRoutes.get("/set", requireRole("guru"), (c) => {
  const subject = c.req.query("subject") ?? "";
  const grade = c.req.query("grade") ?? "";
  const semester = c.req.query("semester") ?? "";
  if (!subject.trim() || !grade.trim() || !semester.trim()) {
    return c.json({ ok: false, message: "Parameter subject, grade, dan semester wajib diisi." }, 400);
  }
  const set = findCurriculumSet(subject, grade, semester);
  if (!set) {
    return c.json({ ok: false, message: "Daftar CP & ATP untuk pilihan itu belum tersedia." }, 404);
  }
  return c.json({ ok: true, data: set });
});
