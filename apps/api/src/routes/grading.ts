import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";

// Ringkasan pengumpulan penugasan untuk panel guru.
export const gradingRoutes = new Hono();

gradingRoutes.use("*", requireRole("guru"));

const { assignmentClasses, assignments, classMembers, classes, users, worksheetAttempts } = schema;

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
        };
      }),
    },
  });
});
