import { bigint, datetime, decimal, index, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { assignments } from "./assignments";
import { worksheetItems } from "./worksheets";

export const submissions = mysqlTable(
  "submissions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["belum", "draf", "terkumpul", "terlambat", "dinilai"])
      .notNull()
      .default("belum"),
    startedAt: datetime("started_at", { mode: "date" }),
    submittedAt: datetime("submitted_at", { mode: "date" }),
    // Decimal dibaca sebagai string oleh driver; ubah ke angka di lapisan layanan.
    totalScore: decimal("total_score", { precision: 6, scale: 2 }),
    teacherComment: text("teacher_comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("submissions_assignment_student_unique").on(t.assignmentId, t.studentId),
    index("submissions_student_idx").on(t.studentId),
  ],
);

export const submissionAnswers = mysqlTable(
  "submission_answers",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    submissionId: bigint("submission_id", { mode: "number" })
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    worksheetItemId: bigint("worksheet_item_id", { mode: "number" })
      .notNull()
      .references(() => worksheetItems.id),
    answerText: text("answer_text"),
    attachmentKey: varchar("attachment_key", { length: 512 }),
    autoScore: decimal("auto_score", { precision: 6, scale: 2 }),
    manualScore: decimal("manual_score", { precision: 6, scale: 2 }),
    teacherNote: text("teacher_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("submission_answers_pair_unique").on(t.submissionId, t.worksheetItemId)],
);
