import { bigint, index, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { assignments } from "./assignments";

// Jejak aktivitas = bahan baku presensi dan rekap bukti.
// Rekap BUKAN tabel tersendiri: ia query agregasi atas tabel ini,
// submissions, dan exit_tickets (blueprint Bagian 06).
export const activityLogs = mysqlTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    assignmentId: bigint("assignment_id", { mode: "number" }).references(() => assignments.id),
    event: mysqlEnum("event", [
      "buka_materi",
      "mulai_lkpd",
      "kumpul",
      "buka_kuis_ruas",
      "exit_ticket",
    ]).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_logs_assignment_idx").on(t.assignmentId, t.createdAt),
    index("activity_logs_student_idx").on(t.studentId, t.createdAt),
  ],
);

export const exitTickets = mysqlTable(
  "exit_tickets",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    understood3: text("understood_3").notNull(),
    examples2: text("examples_2").notNull(),
    confusing1: text("confusing_1").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Satu exit ticket per murid per penugasan.
  (t) => [uniqueIndex("exit_tickets_pair_unique").on(t.assignmentId, t.studentId)],
);
