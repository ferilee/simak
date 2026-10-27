import { bigint, index, mysqlEnum, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { assignments } from "./assignments";

// Indikasi integritas adalah sinyal untuk ditinjau guru, bukan bukti otomatis
// bahwa murid melakukan kecurangan.
export const integrityEvents = mysqlTable(
  "integrity_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    event: mysqlEnum("event", [
      "visibility_hidden",
      "window_blur",
      "copy_attempt",
      "paste_attempt",
      "context_menu",
    ]).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("integrity_events_assignment_idx").on(t.assignmentId, t.createdAt),
    index("integrity_events_student_idx").on(t.studentId, t.createdAt),
  ],
);
