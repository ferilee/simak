import { bigint, index, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { classes } from "./classes";
import { assignments } from "./assignments";

// Kelompok pengerjaan LKPD untuk penugasan bermode "kelompok" (Tahap 1):
// kelompok dibentuk otomatis acak oleh sistem per kelas tujuan saat
// penugasan diterbitkan. Satu murid paling banyak masuk satu kelompok
// per penugasan — ditegakkan unique (assignment_id, student_id) pada
// tabel anggota; assignment_id didenormalisasi dari kelompok demi aturan itu.
export const assignmentGroups = mysqlTable(
  "assignment_groups",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("assignment_groups_assignment_class_idx").on(t.assignmentId, t.classId)],
);

export const assignmentGroupMembers = mysqlTable(
  "assignment_group_members",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    groupId: bigint("group_id", { mode: "number" })
      .notNull()
      .references(() => assignmentGroups.id, { onDelete: "cascade" }),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assignment_group_members_group_student_unique").on(t.groupId, t.studentId),
    uniqueIndex("assignment_group_members_assignment_student_unique").on(t.assignmentId, t.studentId),
    index("assignment_group_members_group_idx").on(t.groupId),
  ],
);
