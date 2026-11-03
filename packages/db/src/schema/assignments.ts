import { bigint, datetime, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
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
    // Mode pengerjaan LKPD: individu (bawaan, perilaku lama) atau kelompok
    // (satu attempt bersama per kelompok — lihat schema/groups.ts).
    workMode: mysqlEnum("work_mode", ["individu", "kelompok"]).notNull().default("individu"),
    // Sasaran penugasan: "kelas" (bawaan — semua anggota kelas tujuan di
    // assignment_classes) atau "siswa" (murid tertentu di
    // assignment_students, untuk remedial/pengayaan). Mode "siswa" hanya
    // tersedia untuk pengerjaan individu — ditegakkan di route.
    targetType: mysqlEnum("target_type", ["kelas", "siswa"]).notNull().default("kelas"),
    groupSize: int("group_size"),
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

// Murid sasaran langsung untuk penugasan bertarget_type "siswa": daftar
// murid ini menggantikan keanggotaan kelas sebagai syarat akses murid ke
// penugasan (lihat lib/assignment-target.ts di API). Satu murid paling
// banyak tercatat sekali per penugasan.
export const assignmentStudents = mysqlTable(
  "assignment_students",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assignment_students_pair_unique").on(t.assignmentId, t.studentId),
    index("assignment_students_student_idx").on(t.studentId),
  ],
);
