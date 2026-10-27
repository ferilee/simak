import { bigint, decimal, index, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { assignments } from "./assignments";
import { users } from "./users";

// Snapshot impor nilai RUAS per penugasan. Baris yang tidak cocok tetap
// disimpan agar guru dapat menindaklanjuti NIS/identifier yang bermasalah.
export const ruasScores = mysqlTable(
  "ruas_scores",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    teacherId: bigint("teacher_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    studentId: bigint("student_id", { mode: "number" }).references(() => users.id),
    identifier: varchar("identifier", { length: 64 }).notNull(),
    studentName: varchar("student_name", { length: 150 }),
    score: decimal("score", { precision: 8, scale: 2 }).notNull(),
    matchStatus: mysqlEnum("match_status", ["cocok", "tidak_ditemukan", "duplikat"]).notNull(),
    note: varchar("note", { length: 255 }),
    importedAt: timestamp("imported_at").notNull().defaultNow(),
  },
  (t) => [
    index("ruas_scores_assignment_idx").on(t.assignmentId, t.matchStatus),
    index("ruas_scores_student_idx").on(t.studentId),
  ],
);
