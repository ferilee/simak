import { bigint, index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

export const modules = mysqlTable("modules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draf", "terbit", "arsip"]).notNull().default("draf"),
  version: int("version").notNull().default(1),
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
    type: mysqlEnum("type", ["teks", "gambar", "video", "berkas", "sub_bab"]).notNull(),
    // Isi terstruktur per jenis blok; divalidasi Zod (packages/shared) sebelum disimpan.
    contentJson: json("content_json").$type<Record<string, unknown>>().notNull(),
    attachmentKey: varchar("attachment_key", { length: 512 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("module_blocks_module_idx").on(t.moduleId, t.sortOrder)],
);
