import { bigint, date, index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { modules } from "./modules";
import { users } from "./users";

// JURNAL BELAJAR MURID (Hub Murid Tahap 3, migrasi 0021): entri refleksi
// murid — bentuk permanen tahap Transform pada alur DELTA. Satu murid
// boleh menulis lebih dari satu entri pada tanggal yang sama; entri
// disunting/dihapus hanya oleh pemiliknya (penegakan di rute murid),
// dan guru hanya MEMBACA entri murid dalam jangkauan kelasnya (rute
// guru jurnal tidak punya jalur tulis sama sekali). Jurnal tidak
// menghasilkan XP dan tidak dinilai — tidak ada kolom skor di sini.
//
// - entry_date adalah tanggal jurnal menurut WIB, diputuskan server
//   saat entri dibuat (lib/jurnal.ts todayWib) dan tidak berubah saat
//   entri disunting; mode "string" agar nilainya berpindah sebagai
//   "YYYY-MM-DD" persis seperti tersimpan.
// - prompt_key merujuk katalog prompt refleksi BAWAAN di kode
//   (apps/api/src/lib/jurnal.ts) — guru tidak membuat prompt, jadi
//   kuncinya teks polos tanpa tabel referensi, seperti topic_group
//   pada modules. NULL = entri bebas tanpa prompt.
// - mood penanda perasaan sederhana dari himpunan kecil di katalog
//   yang sama; NULL = murid tidak menandai.
// - linked_module_id kaitan opsional ke materi yang sedang dipelajari;
//   keabsahannya (modul terlihat oleh murid itu) diperiksa rute saat
//   menulis, mengikuti aturan keterlihatan lib/assignment-target.ts.
export const journalEntries = mysqlTable(
  "journal_entries",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    body: text("body").notNull(),
    promptKey: varchar("prompt_key", { length: 64 }),
    mood: varchar("mood", { length: 32 }),
    linkedModuleId: bigint("linked_module_id", { mode: "number" }).references(() => modules.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("journal_entries_student_date_idx").on(t.studentId, t.entryDate)],
);
