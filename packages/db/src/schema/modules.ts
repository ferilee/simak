import { bigint, boolean, datetime, index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

export const modules = mysqlTable("modules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  // Kelompok materi (TP/Materi pada daftar CP & ATP, mis. "Eksponen",
  // "Matematika Keuangan", "Berpikir Komputasional"): penanda resmi agar
  // daftar Materi saya bisa disaring per kelompok. NULL = belum
  // dikelompokkan (tampil di saringan "Lainnya"). Nilai diisi guru lewat
  // dropdown yang daftarnya berasal dari data kurikulum; kolomnya teks
  // polos seperti subject, bukan kunci asing — daftar kelompok hidup di
  // data kurikulum yang terbit bersama kode.
  topicGroup: varchar("topic_group", { length: 120 }),
  description: text("description"),
  // Kunci objek sampul modul di penyimpanan (RustFS); URL unduhan bertanda
  // tangan diterbitkan segar lewat /uploads/download seperti lampiran blok.
  coverKey: varchar("cover_key", { length: 512 }),
  status: mysqlEnum("status", ["draf", "terbit", "arsip"]).notNull().default("draf"),
  version: int("version").notNull().default(1),
  // Perpustakaan Bersama (Fase 1): modul hanya tampil ke guru lain bila
  // pemiliknya menyalakan is_shared secara eksplisit (bawaan privat).
  // shared_at mencatat kapan terakhir dibagikan (NULL = tidak dibagikan).
  isShared: boolean("is_shared").notNull().default(false),
  sharedAt: datetime("shared_at"),
  // Antrean persetujuan berbagi: status pengajuan berbagi modul ini.
  // is_shared tetap menjadi penanda tayang (invarian: is_shared bernilai
  // true tepat bila share_status = 'dibagikan'); share_status mencatat
  // perjalanan pengajuannya — 'pribadi' (tidak diajukan), 'menunggu'
  // (menunggu keputusan penyetuju), 'dibagikan' (tayang), 'ditolak'.
  // share_requested_at mencatat kapan pengajuan terakhir diajukan.
  shareStatus: mysqlEnum("share_status", ["pribadi", "menunggu", "dibagikan", "ditolak"]).notNull().default("pribadi"),
  shareRequestedAt: datetime("share_requested_at"),
  // Jejak salinan: terisi hanya pada modul hasil salinan dari perpustakaan.
  // copied_from_id adalah kolom polos TANPA foreign key (sumber boleh
  // berubah/dihapus tanpa menyeret salinan); nama guru sumber dibekukan
  // sebagai teks agar atribusi tetap tampil apa adanya.
  copiedFromId: bigint("copied_from_id", { mode: "number" }),
  copiedFromTeacherName: varchar("copied_from_teacher_name", { length: 120 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const moduleBlocks = mysqlTable(
  "module_blocks",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    moduleId: bigint("module_id", { mode: "number" })
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    sortOrder: int("sort_order").notNull().default(0),
    type: mysqlEnum("type", ["teks", "gambar", "video", "berkas", "sub_bab", "interaktif"]).notNull(),
    // Isi terstruktur per jenis blok; divalidasi Zod (packages/shared) sebelum disimpan.
    contentJson: json("content_json").$type<Record<string, unknown>>().notNull(),
    attachmentKey: varchar("attachment_key", { length: 512 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("module_blocks_module_idx").on(t.moduleId, t.sortOrder)],
);
