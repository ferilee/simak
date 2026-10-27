import { bigint, datetime, decimal, index, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { worksheets, worksheetItems } from "./worksheets";

export const worksheetAttempts = mysqlTable(
  "worksheet_attempts",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    worksheetId: bigint("worksheet_id", { mode: "number" })
      .notNull()
      .references(() => worksheets.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["draf", "terkumpul", "dinilai"]).notNull().default("draf"),
    submittedAt: datetime("submitted_at", { mode: "date" }),
    totalScore: decimal("total_score", { precision: 8, scale: 2 }),
    teacherComment: text("teacher_comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("worksheet_attempts_student_unique").on(t.worksheetId, t.studentId),
    index("worksheet_attempts_student_idx").on(t.studentId),
  ],
);

export const worksheetAnswers = mysqlTable(
  "worksheet_answers",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    attemptId: bigint("attempt_id", { mode: "number" })
      .notNull()
      .references(() => worksheetAttempts.id, { onDelete: "cascade" }),
    worksheetItemId: bigint("worksheet_item_id", { mode: "number" })
      .notNull()
      .references(() => worksheetItems.id),
    answerText: text("answer_text"),
    attachmentKey: varchar("attachment_key", { length: 512 }),
    score: decimal("score", { precision: 8, scale: 2 }),
    teacherNote: text("teacher_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("worksheet_answers_pair_unique").on(t.attemptId, t.worksheetItemId)],
);
