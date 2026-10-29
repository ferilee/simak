import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";

// Ringkasan pengumpulan penugasan untuk panel guru.
export const gradingRoutes = new Hono();

gradingRoutes.use("*", requireRole("guru"));

const { assignmentClasses, assignments, classMembers, classes, exitTickets, users, worksheetAttempts, worksheets } = schema;

function serializeScore(score: string | null) {
  return score === null ? null : Number(score);
}

// Daftar gabungan pengumpulan lintas semua LKPD milik guru yang login
// (mode "Semua LKPD" pada panel Pengumpulan LKPD). Kolomnya sama seperti
// daftar per-LKPD di routes/worksheets.ts, ditambah identitas LKPD asal
// setiap attempt agar rincian penilaian bisa dibuka dari daftar gabungan.
gradingRoutes.get("/attempts", async (c) => {
  const user = c.get("user")!;

  const rows = await db
    .select({
      id: worksheetAttempts.id,
      worksheetId: worksheetAttempts.worksheetId,
      worksheetTitle: worksheets.title,
      studentId: worksheetAttempts.studentId,
      studentName: users.name,
      username: users.username,
      status: worksheetAttempts.status,
      submittedAt: worksheetAttempts.submittedAt,
      totalScore: worksheetAttempts.totalScore,
      updatedAt: worksheetAttempts.updatedAt,
    })
    .from(worksheetAttempts)
    .innerJoin(worksheets, eq(worksheets.id, worksheetAttempts.worksheetId))
    .innerJoin(users, eq(users.id, worksheetAttempts.studentId))
    .where(eq(worksheets.teacherId, user.userId))
    .orderBy(desc(worksheetAttempts.updatedAt));

  return c.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      worksheet_id: row.worksheetId,
      worksheet_title: row.worksheetTitle,
      student_id: row.studentId,
      student_name: row.studentName,
      username: row.username,
      status: row.status,
      submitted_at: row.submittedAt,
      total_score: serializeScore(row.totalScore),
      updated_at: row.updatedAt,
    })),
  });
});

gradingRoutes.get("/assignments/:id", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, user.userId)))
    .limit(1);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);

  const links = await db.select({ classId: assignmentClasses.classId }).from(assignmentClasses).where(eq(assignmentClasses.assignmentId, assignmentId));
  const classIds = links.map((link) => link.classId);
  const students = classIds.length
    ? await db
        .select({ id: users.id, name: users.name, username: users.username, classId: classMembers.classId })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.studentId))
        .innerJoin(classes, eq(classes.id, classMembers.classId))
        .where(and(inArray(classMembers.classId, classIds), eq(classes.isArchived, false)))
    : [];
  const uniqueStudents = [...new Map(students.map((student) => [student.id, student])).values()];
  const attempts = assignment.worksheetId === null || uniqueStudents.length === 0
    ? []
    : await db
        .select({ studentId: worksheetAttempts.studentId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore })
        .from(worksheetAttempts)
        .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.studentId, uniqueStudents.map((student) => student.id))));
  const attemptByStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));
  const exitTicketRows = uniqueStudents.length
    ? await db
        .select({
          studentId: exitTickets.studentId,
          understood3: exitTickets.understood3,
          examples2: exitTickets.examples2,
          confusing1: exitTickets.confusing1,
          createdAt: exitTickets.createdAt,
        })
        .from(exitTickets)
        .where(and(eq(exitTickets.assignmentId, assignmentId), inArray(exitTickets.studentId, uniqueStudents.map((student) => student.id))))
    : [];
  const exitTicketByStudent = new Map(exitTicketRows.map((ticket) => [ticket.studentId, ticket]));

  return c.json({
    ok: true,
    data: {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        worksheet_id: assignment.worksheetId,
        due_at: assignment.dueAt,
      },
      students: uniqueStudents.map((student) => {
        const attempt = attemptByStudent.get(student.id);
        return {
          id: student.id,
          name: student.name,
          username: student.username,
          status: attempt?.status ?? "belum",
          submitted_at: attempt?.submittedAt ?? null,
          total_score: attempt?.totalScore === null || attempt?.totalScore === undefined ? null : Number(attempt.totalScore),
          exit_ticket: exitTicketByStudent.has(student.id)
            ? {
                understood_3: exitTicketByStudent.get(student.id)!.understood3,
                examples_2: exitTicketByStudent.get(student.id)!.examples2,
                confusing_1: exitTicketByStudent.get(student.id)!.confusing1,
                submitted_at: exitTicketByStudent.get(student.id)!.createdAt,
              }
            : null,
        };
      }),
    },
  });
});
