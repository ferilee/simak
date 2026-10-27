import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";

// Rekap bukti = agregasi submissions + activity_logs + exit_tickets (Tahap 4).
// Format: JSON (default) atau CSV yang dapat dibuka di Excel.
export const reportRoutes = new Hono();

reportRoutes.use("*", requireRole("guru"));

const { activityLogs, assignmentClasses, assignments, classes, classMembers, exitTickets, users, worksheetAttempts } = schema;

reportRoutes.get("/session", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.query("assignmentId"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return c.json({ ok: false, message: "assignmentId wajib berupa ID positif." }, 400);
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, user.userId)))
    .limit(1);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);

  const targetStudents = await db
    .select({ id: users.id, name: users.name, username: users.username, classId: classes.id, className: classes.name })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .innerJoin(users, eq(users.id, classMembers.studentId))
    .where(and(eq(assignmentClasses.assignmentId, assignmentId), eq(classes.isArchived, false)));
  const students = [...new Map(targetStudents.map((student) => [student.id, student])).values()];
  const studentIds = students.map((student) => student.id);

  const [activities, attempts, tickets] = await Promise.all([
    studentIds.length
      ? db
          .select({ studentId: activityLogs.studentId, event: activityLogs.event, createdAt: activityLogs.createdAt })
          .from(activityLogs)
          .where(and(eq(activityLogs.assignmentId, assignmentId), inArray(activityLogs.studentId, studentIds)))
      : Promise.resolve([]),
    assignment.worksheetId !== null && studentIds.length
      ? db
          .select({ studentId: worksheetAttempts.studentId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore })
          .from(worksheetAttempts)
          .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.studentId, studentIds)))
      : Promise.resolve([]),
    studentIds.length
      ? db
          .select({ studentId: exitTickets.studentId, submittedAt: exitTickets.createdAt })
          .from(exitTickets)
          .where(and(eq(exitTickets.assignmentId, assignmentId), inArray(exitTickets.studentId, studentIds)))
      : Promise.resolve([]),
  ]);

  const activitiesByStudent = new Map<number, typeof activities>();
  for (const activity of activities) {
    const current = activitiesByStudent.get(activity.studentId) ?? [];
    current.push(activity);
    activitiesByStudent.set(activity.studentId, current);
  }
  const attemptsByStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));
  const ticketsByStudent = new Map(tickets.map((ticket) => [ticket.studentId, ticket]));

  const rows = students.map((student) => {
    const studentActivities = activitiesByStudent.get(student.id) ?? [];
    const openedAt = studentActivities
      .filter((activity) => activity.event === "buka_materi")
      .map((activity) => activity.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const startedAt = studentActivities
      .filter((activity) => activity.event === "mulai_lkpd")
      .map((activity) => activity.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const ruasOpenedAt = studentActivities
      .filter((activity) => activity.event === "buka_kuis_ruas")
      .map((activity) => activity.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const attempt = attemptsByStudent.get(student.id);
    const ticket = ticketsByStudent.get(student.id);
    const submitted = Boolean(attempt && attempt.status !== "draf") || Boolean(ticket);

    return {
      student_id: student.id,
      name: student.name,
      username: student.username,
      class_name: student.className,
      hadir: Boolean(openedAt && submitted),
      opened_at: openedAt,
      started_lkpd_at: startedAt,
      submission_status: attempt?.status ?? "belum",
      submitted_at: attempt?.submittedAt ?? null,
      total_score: attempt?.totalScore === null || attempt?.totalScore === undefined ? null : Number(attempt.totalScore),
      exit_ticket_submitted: Boolean(ticket),
      exit_ticket_submitted_at: ticket?.submittedAt ?? null,
      ruas_opened_at: ruasOpenedAt,
    };
  });

  const data = {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      opens_at: assignment.opensAt,
      due_at: assignment.dueAt,
    },
    summary: {
      total_students: rows.length,
      hadir: rows.filter((row) => row.hadir).length,
      submitted: rows.filter((row) => row.submission_status !== "belum").length,
      exit_ticket: rows.filter((row) => row.exit_ticket_submitted).length,
    },
    students: rows,
  };

  if (c.req.query("format") === "csv") {
    const csvRows = [
      ["Nama", "Username", "Kelas", "Presensi", "Status LKPD", "Waktu kumpul", "Nilai LKPD", "Exit ticket", "Waktu exit ticket", "Kuis RUAS", "Waktu buka RUAS"],
      ...rows.map((row) => [
        row.name,
        row.username,
        row.class_name,
        row.hadir ? "Hadir" : "Belum hadir",
        row.submission_status,
        csvDate(row.submitted_at),
        row.total_score === null ? "" : String(row.total_score),
        row.exit_ticket_submitted ? "Sudah" : "Belum",
        csvDate(row.exit_ticket_submitted_at),
        row.ruas_opened_at ? "Dibuka" : "Belum",
        csvDate(row.ruas_opened_at),
      ]),
    ];
    const csv = `\uFEFF${csvRows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename=\"simak-rekap-${assignment.id}.csv\"`);
    return c.body(csv);
  }

  return c.json({
    ok: true,
    data,
  });
});
reportRoutes.get("/range", (c) => c.json({ ok: false, message: "Tahap 4." }, 501));

function csvDate(value: Date | null) {
  return value?.toISOString() ?? "";
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
