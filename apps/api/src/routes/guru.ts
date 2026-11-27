import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";
import { fetchRuasTopics } from "../lib/ruas-hub";

const { users } = schema;

// Endpoint bantu khusus guru di luar sumber daya utama:
//  - daftar topik RUAS untuk pemilih pemetaan pada formulir penugasan
//    (Hub Murid Tahap 2) — diteruskan dari endpoint internal RUAS
//    secara gagal-lembut: jembatan belum disetel / RUAS tak terjangkau
//    menjawab available:false dengan daftar kosong, dan formulir
//    menonaktifkan pemilihnya sambil memberi petunjuk.
//  - penanda tutup kartu sambutan guru (welcome/dismiss).
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

// Kartu sambutan guru ditutup: catat penanda welcome_dismissed_at
// (hanya bila masih NULL — idempoten, panggilan berulang tidak
// menggeser waktu tutup pertama) agar kartu tidak tampil lagi untuk
// akun ini di perangkat mana pun. Nilai terbaru selalu dikembalikan
// supaya web bisa menyelaraskan keadaannya tanpa muat ulang.
guruRoutes.post("/welcome/dismiss", async (c) => {
  const user = c.get("user")!;
  await db
    .update(users)
    .set({ welcomeDismissedAt: new Date() })
    .where(and(eq(users.id, user.userId), isNull(users.welcomeDismissedAt)));
  const [me] = await db
    .select({ welcomeDismissedAt: users.welcomeDismissedAt })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);
  return c.json({ ok: true, data: { welcome_dismissed_at: me?.welcomeDismissedAt ?? null } });
});
