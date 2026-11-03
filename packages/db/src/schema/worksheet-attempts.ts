import { bigint, datetime, decimal, foreignKey, index, mysqlEnum, mysqlTable, text, timestamp, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { worksheets, worksheetItems } from "./worksheets";
import { assignmentGroups } from "./groups";

export const worksheetAttempts = mysqlTable(
  "worksheet_attempts",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    worksheetId: bigint("worksheet_id", { mode: "number" })
      .notNull()
      .references(() => worksheets.id, { onDelete: "cascade" }),
    // NULL pada attempt kelompok: pemiliknya adalah kelompok (group_id).
    // Attempt individu selalu mengisi student_id seperti sebelumnya;
    // unique (worksheet_id, student_id) tetap menahan satu attempt per murid
    // karena baris kelompok ber-student_id NULL tidak saling bertabrakan
    // dalam semantik unique MySQL (NULL tidak pernah dianggap sama).
    studentId: bigint("student_id", { mode: "number" })
      .references(() => users.id),
    groupId: bigint("group_id", { mode: "number" })
      .references(() => assignmentGroups.id, { onDelete: "cascade" }),
    // Pengedit terakhir attempt (dipakai attempt kelompok; attempt individu
    // membiarkannya NULL).
    lastEditedBy: bigint("last_edited_by", { mode: "number" })
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
    uniqueIndex("worksheet_attempts_group_unique").on(t.worksheetId, t.groupId),
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
    // Jejak penulis per jawaban (Tahap 3 mini): murid yang terakhir menulis
    // atau mengubah jawaban ini, diisi pada setiap simpan jawaban murid
    // (termasuk jawaban foto lewat attachment_key). NULL pada jawaban lama
    // yang dibuat sebelum kolom ini ada. Pada attempt individu penulisnya
    // selalu murid pemilik attempt; nilainya dipakai tampilan guru pada
    // attempt kelompok.
    lastEditedBy: bigint("last_edited_by", { mode: "number" })
      .references(() => users.id),
    score: decimal("score", { precision: 8, scale: 2 }),
    teacherNote: text("teacher_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("worksheet_answers_pair_unique").on(t.attemptId, t.worksheetItemId)],
);

// ---------------------------------------------------------------------------
// LKPD Kelompok — Tahap 2: penilaian kontribusi antarteman + penyesuaian
// nilai individu pada attempt kelompok.
// ---------------------------------------------------------------------------

// Nilai kontribusi yang diberikan seorang anggota kepada anggota lain pada
// satu attempt kelompok (skala 1–5, ditegakkan zod + route). Hanya diisi
// pada jendela attempt "terkumpul" (sesudah mengumpulkan, sebelum dinilai)
// dan tidak pernah ditampilkan ke murid — hanya agregatnya yang dilihat
// guru di panel penilaian.
export const groupContributionRatings = mysqlTable(
  "group_contribution_ratings",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    attemptId: bigint("attempt_id", { mode: "number" })
      .notNull()
      .references(() => worksheetAttempts.id, { onDelete: "cascade" }),
    raterStudentId: bigint("rater_student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    rateeStudentId: bigint("ratee_student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    score: tinyint("score").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("group_contribution_ratings_trio_unique").on(t.attemptId, t.raterStudentId, t.rateeStudentId),
    index("group_contribution_ratings_attempt_idx").on(t.attemptId),
  ],
);

// Nilai akhir khusus satu anggota pada attempt kelompok (penyesuaian guru).
// Tanpa baris di tabel ini, nilai efektif anggota = nilai total kelompok;
// dengan baris, nilai baris inilah yang tampil ke murid itu dan ke laporan.
export const worksheetAttemptMemberScores = mysqlTable(
  "worksheet_attempt_member_scores",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    // FK attempt_id dinyatakan eksplisit dengan nama pendek di bawah:
    // nama otomatis Drizzle untuk FK ini 67 karakter, melebihi batas
    // 64 karakter MariaDB (ERROR 1059) — lihat catatan perbaikan 0009.
    attemptId: bigint("attempt_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    score: decimal("score", { precision: 8, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("worksheet_attempt_member_scores_pair_unique").on(t.attemptId, t.studentId),
    index("worksheet_attempt_member_scores_attempt_idx").on(t.attemptId),
    foreignKey({
      columns: [t.attemptId],
      foreignColumns: [worksheetAttempts.id],
      name: "wams_attempt_id_worksheet_attempts_id_fk",
    }).onDelete("cascade"),
  ],
);
