import { bigint, index, int, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

// Buku besar poin XP murid (gamifikasi): XP hanya lahir dari kejadian
// yang tercatat di server — materi dibaca tuntas, LKPD terkumpul, exit
// ticket terkirim — dan setiap penghargaan adalah SATU baris di tabel
// ini. Total XP seorang murid adalah jumlah (SUM) baris-barisnya; tidak
// ada kolom penghitung yang bisa menyimpang dari buku besar.
//
// Kunci unik (student_id, event, source_id) adalah penjamin idempotensi:
// sumber yang sama tidak pernah membayar dua kali — source_id adalah id
// modul untuk materi_tuntas, id attempt untuk lkpd_terkumpul, dan id
// penugasan untuk exit_ticket. Nilai poin per kejadian tinggal di
// apps/api/src/lib/xp.ts (XP_POINTS) dan tersalin ke kolom points saat
// baris ditulis, supaya riwayat tidak berubah bila besaran kelak diubah.
export const xpLedger = mysqlTable(
  "xp_ledger",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    event: varchar("event", { length: 32 }).$type<"materi_tuntas" | "lkpd_terkumpul" | "exit_ticket">().notNull(),
    sourceId: bigint("source_id", { mode: "number" }).notNull(),
    points: int("points").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("xp_ledger_student_event_source_unique").on(t.studentId, t.event, t.sourceId),
    index("xp_ledger_student_idx").on(t.studentId),
  ],
);
