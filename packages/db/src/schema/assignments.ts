import { bigint, datetime, index, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { classes } from "./classes";
import { modules } from "./modules";
import { worksheets } from "./worksheets";

export const assignments = mysqlTable(
  "assignments",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    teacherId: bigint("teacher_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    moduleId: bigint("module_id", { mode: "number" }).references(() => modules.id),
    worksheetId: bigint("worksheet_id", { mode: "number" }).references(() => worksheets.id),
    title: varchar("title", { length: 200 }).notNull(),
    instructions: text("instructions"),
    ruasQuizUrl: varchar("ruas_quiz_url", { length: 1024 }),
    opensAt: datetime("opens_at", { mode: "date" }).notNull(),
    dueAt: datetime("due_at", { mode: "date" }).notNull(),
    status: mysqlEnum("status", ["draf", "terbit", "ditutup"]).notNull().default("draf"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("assignments_teacher_idx").on(t.teacherId, t.opensAt)],
);

export const assignmentClasses = mysqlTable(
  "assignment_classes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("assignment_classes_pair_unique").on(t.assignmentId, t.classId),
    index("assignment_classes_class_idx").on(t.classId),
  ],
);
