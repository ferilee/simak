import { bigint, index, int, json, mysqlEnum, mysqlTable, text, timestamp } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { modules } from "./modules";

export const worksheets = mysqlTable("worksheets", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  moduleId: bigint("module_id", { mode: "number" }).references(() => modules.id),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  instructions: text("instructions"),
  status: mysqlEnum("status", ["draf", "terbit", "arsip"]).notNull().default("draf"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const worksheetItems = mysqlTable(
  "worksheet_items",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    worksheetId: bigint("worksheet_id", { mode: "number" })
      .notNull()
      .references(() => worksheets.id, { onDelete: "cascade" }),
    sortOrder: int("sort_order").notNull().default(0),
    itemType: mysqlEnum("item_type", [
      "isian_singkat",
      "pilihan_ganda",
      "uraian",
      "unggah_foto",
      "langkah_berurutan",
      "refleksi",
      "tautan_ruas",
    ]).notNull(),
    prompt: text("prompt").notNull(),
    optionsJson: json("options_json").$type<Record<string, unknown>>(),
    answerKey: text("answer_key"),
    explanation: text("explanation"),
    rubricMax: int("rubric_max").notNull().default(100),
    points: int("points").notNull().default(10),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("worksheet_items_worksheet_idx").on(t.worksheetId, t.sortOrder)],
);
