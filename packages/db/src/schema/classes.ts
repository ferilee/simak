import { bigint, boolean, index, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

export const classes = mysqlTable("classes", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(), // mis. "XI DPIB"
  subject: varchar("subject", { length: 100 }).notNull(),
  academicYear: varchar("academic_year", { length: 20 }).notNull(),
  joinCode: varchar("join_code", { length: 12 }).notNull().unique(),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const classMembers = mysqlTable(
  "class_members",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_members_pair_unique").on(t.classId, t.studentId),
    index("class_members_student_idx").on(t.studentId),
  ],
);
