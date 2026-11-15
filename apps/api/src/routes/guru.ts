import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import { fetchRuasTopics } from "../lib/ruas-hub";

// Endpoint bantu khusus guru di luar sumber daya utama. Saat ini satu
// jalur: daftar topik RUAS untuk pemilih pemetaan pada formulir
// penugasan (Hub Murid Tahap 2) — diteruskan dari endpoint internal
// RUAS secara gagal-lembut: jembatan belum disetel / RUAS tak
// terjangkau menjawab available:false dengan daftar kosong, dan
// formulir menonaktifkan pemilihnya sambil memberi petunjuk.
export const guruRoutes = new Hono();

guruRoutes.use("*", requireRole("guru"));

guruRoutes.get("/ruas-topics", async (c) => {
  const topics = await fetchRuasTopics();
  if (topics === null) {
    return c.json({ ok: true, data: { available: false, topics: [] } });
  }
  return c.json({
    ok: true,
    data: {
      available: true,
      topics: topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        subject_id: topic.subjectId,
        subject_name: topic.subjectName,
      })),
    },
  });
});
