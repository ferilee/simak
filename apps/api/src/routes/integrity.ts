import { and, desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { integrityEventSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { loadAssignmentSubject, studentIsAssignmentTarget } from "../lib/assignment-target";
import { loadTeacherClassMemberships, resolveStudentClass } from "../lib/student-class";

const integrityRoutes = new Hono();
const { assignments, integrityEvents, users } = schema;

integrityRoutes.post(
  "/",
  requireRole("murid"),
  zValidator("json", integrityEventSchema),
  async (c) => {
    const user = c.get("user")!;
    const input = c.req.valid("json");
    const [assignment] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.id, input.assignmentId), eq(assignments.status, "terbit")))
      .limit(1);
    const access = assignment && (await studentIsAssignmentTarget(assignment.id, user.userId)) ? assignment : undefined;
    if (!access) return c.json({ ok: false, message: "Penugasan tidak tersedia untuk Anda." }, 404);

    // Satu sinyal yang sama dalam jendela pendek tidak perlu disimpan berulang.
    const recentSince = new Date(Date.now() - 10_000);
    const [recent] = await db
      .select({ id: integrityEvents.id })
      .from(integrityEvents)
      .where(and(
        eq(integrityEvents.assignmentId, input.assignmentId),
        eq(integrityEvents.studentId, user.userId),
        eq(integrityEvents.event, input.event),
        gte(integrityEvents.createdAt, recentSince),
      ))
      .limit(1);
    if (!recent) {
      await db.insert(integrityEvents).values({
        studentId: user.userId,
        assignmentId: input.assignmentId,
        event: input.event,
      });
    }
    return c.json({ ok: true, data: { recorded: !recent } });
  },
);

integrityRoutes.get("/alerts", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const assignmentId = c.req.query("assignmentId");
  const assignmentFilter = assignmentId ? Number(assignmentId) : undefined;
  if (assignmentId && (assignmentFilter === undefined || assignmentFilter <= 0 || !Number.isInteger(assignmentFilter))) {
    return c.json({ ok: false, message: "assignmentId tidak valid." }, 400);
  }

  // Kelas tiap murid diselesaikan dengan aturan yang sama seperti panel
  // penilaian (lib/student-class): keanggotaan kelas guru dimuat satu kueri,
  // mapel pembandingnya berasal dari modul LKPD penugasan asal sinyal.
  const [rows, membershipsByStudent] = await Promise.all([
    db
      .select({
        assignment_id: assignments.id,
        assignment_title: assignments.title,
        assignment_module_id: assignments.moduleId,
        assignment_worksheet_id: assignments.worksheetId,
        student_id: users.id,
        student_name: users.name,
        username: users.username,
        event: integrityEvents.event,
        created_at: integrityEvents.createdAt,
      })
      .from(integrityEvents)
      .innerJoin(assignments, eq(assignments.id, integrityEvents.assignmentId))
      .innerJoin(users, eq(users.id, integrityEvents.studentId))
      .where(and(
        eq(assignments.teacherId, user.userId),
        assignmentFilter ? eq(assignments.id, assignmentFilter) : undefined,
      ))
      .orderBy(desc(integrityEvents.createdAt))
      .limit(500),
    loadTeacherClassMemberships(user.userId),
  ]);

  const subjectByAssignment = new Map<number, string | null>();
  const assignmentRefs = new Map<number, { moduleId: number | null; worksheetId: number | null }>();
  for (const row of rows) {
    if (!assignmentRefs.has(row.assignment_id)) {
      assignmentRefs.set(row.assignment_id, { moduleId: row.assignment_module_id, worksheetId: row.assignment_worksheet_id });
    }
  }
  await Promise.all([...assignmentRefs.entries()].map(async ([assignmentId, ref]) => {
    subjectByAssignment.set(assignmentId, await loadAssignmentSubject(ref));
  }));

  const grouped = new Map<string, {
    assignment_id: number;
    assignment_title: string;
    student_id: number;
    student_name: string;
    username: string;
    last_event: Date;
    events: Map<string, number>;
  }>();
  for (const row of rows) {
    const key = `${row.assignment_id}:${row.student_id}`;
    const current = grouped.get(key) ?? {
      assignment_id: row.assignment_id,
      assignment_title: row.assignment_title,
      student_id: row.student_id,
      student_name: row.student_name,
      username: row.username,
      last_event: row.created_at,
      events: new Map<string, number>(),
    };
    current.events.set(row.event, (current.events.get(row.event) ?? 0) + 1);
    if (row.created_at > current.last_event) current.last_event = row.created_at;
    grouped.set(key, current);
  }

  const data = [...grouped.values()].map((alert) => {
    const total = [...alert.events.values()].reduce((sum, value) => sum + value, 0);
    const clipboard = (alert.events.get("copy_attempt") ?? 0) + (alert.events.get("paste_attempt") ?? 0);
    const risk = total >= 6 || clipboard >= 3 ? "peringatan" : total >= 3 ? "perlu_ditinjau" : "info";
    const studentClass = resolveStudentClass(
      membershipsByStudent.get(alert.student_id) ?? [],
      subjectByAssignment.get(alert.assignment_id) ?? null,
    );
    return {
      assignment_id: alert.assignment_id,
      assignment_title: alert.assignment_title,
      student_id: alert.student_id,
      student_name: alert.student_name,
      username: alert.username,
      class_id: studentClass?.id ?? null,
      class_name: studentClass?.name ?? null,
      total_events: total,
      risk,
      last_event: alert.last_event,
      events: [...alert.events.entries()].map(([event, count]) => ({ event, count })),
    };
  });
  data.sort((left, right) => new Date(right.last_event).getTime() - new Date(left.last_event).getTime());
  return c.json({ ok: true, data });
});

export { integrityRoutes };
