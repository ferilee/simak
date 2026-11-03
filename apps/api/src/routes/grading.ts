import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { memberScoreSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { loadTeacherClassMemberships, resolveStudentClass } from "../lib/student-class";
import { loadAttemptMemberScores, mapGroupAttemptsToStudents, pickEffectiveAttempt, resolveEffectiveMemberScore } from "../lib/groups";

// Ringkasan pengumpulan penugasan untuk panel guru.
export const gradingRoutes = new Hono();

gradingRoutes.use("*", requireRole("guru"));

const { assignmentClasses, assignmentGroupMembers, assignmentGroups, assignments, classMembers, classes, exitTickets, modules, users, worksheetAttemptMemberScores, worksheetAttempts, worksheetItems, worksheets } = schema;

function serializeScore(score: string | null) {
  return score === null ? null : Number(score);
}

// Daftar gabungan pengumpulan lintas semua LKPD milik guru yang login
// (mode "Semua LKPD" pada panel Pengumpulan LKPD). Kolomnya sama seperti
// daftar per-LKPD di routes/worksheets.ts, ditambah identitas LKPD asal
// setiap attempt agar rincian penilaian bisa dibuka dari daftar gabungan,
// dan kelas murid (lib/student-class) untuk saringan kelas di panel.
// Attempt kelompok (student_id NULL) ikut tampil sebagai SATU unit
// penilaian: student_name diisi nama kelompok, kelasnya adalah kelas
// kelompok itu sendiri, dan daftar nama anggota disertakan.
gradingRoutes.get("/attempts", async (c) => {
  const user = c.get("user")!;

  const [rows, membershipsByStudent] = await Promise.all([
    db
      .select({
        id: worksheetAttempts.id,
        worksheetId: worksheetAttempts.worksheetId,
        worksheetTitle: worksheets.title,
        moduleSubject: modules.subject,
        studentId: worksheetAttempts.studentId,
        studentName: users.name,
        username: users.username,
        groupId: worksheetAttempts.groupId,
        groupName: assignmentGroups.name,
        groupClassId: assignmentGroups.classId,
        groupClassName: classes.name,
        status: worksheetAttempts.status,
        submittedAt: worksheetAttempts.submittedAt,
        totalScore: worksheetAttempts.totalScore,
        updatedAt: worksheetAttempts.updatedAt,
      })
      .from(worksheetAttempts)
      .innerJoin(worksheets, eq(worksheets.id, worksheetAttempts.worksheetId))
      .leftJoin(modules, eq(modules.id, worksheets.moduleId))
      .leftJoin(users, eq(users.id, worksheetAttempts.studentId))
      .leftJoin(assignmentGroups, eq(assignmentGroups.id, worksheetAttempts.groupId))
      .leftJoin(classes, eq(classes.id, assignmentGroups.classId))
      .where(eq(worksheets.teacherId, user.userId))
      .orderBy(desc(worksheetAttempts.updatedAt)),
    loadTeacherClassMemberships(user.userId),
  ]);

  const groupIds = [...new Set(rows.flatMap((row) => (row.groupId === null ? [] : [row.groupId])))];
  const memberRows = groupIds.length
    ? await db
        .select({ groupId: assignmentGroupMembers.groupId, name: users.name })
        .from(assignmentGroupMembers)
        .innerJoin(users, eq(users.id, assignmentGroupMembers.studentId))
        .where(inArray(assignmentGroupMembers.groupId, groupIds))
        .orderBy(users.name)
    : [];
  const memberNamesByGroup = new Map<number, string[]>();
  for (const row of memberRows) {
    const list = memberNamesByGroup.get(row.groupId) ?? [];
    list.push(row.name);
    memberNamesByGroup.set(row.groupId, list);
  }

  return c.json({
    ok: true,
    data: rows.map((row) => {
      if (row.groupId !== null) {
        return {
          id: row.id,
          worksheet_id: row.worksheetId,
          worksheet_title: row.worksheetTitle,
          student_id: null,
          student_name: row.groupName ?? "Kelompok",
          username: "",
          status: row.status,
          submitted_at: row.submittedAt,
          total_score: serializeScore(row.totalScore),
          updated_at: row.updatedAt,
          class_id: row.groupClassId,
          class_name: row.groupClassName,
          is_group: true,
          group_id: row.groupId,
          group_name: row.groupName,
          member_names: memberNamesByGroup.get(row.groupId) ?? [],
        };
      }
      const studentClass = resolveStudentClass(membershipsByStudent.get(row.studentId!) ?? [], row.moduleSubject);
      return {
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
        class_id: studentClass?.id ?? null,
        class_name: studentClass?.name ?? null,
        is_group: false,
        group_id: null,
        group_name: null,
        member_names: [],
      };
    }),
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
  // Penugasan kelompok: status per murid mengikuti attempt efektif —
  // attempt bersama kelompoknya diperhitungkan persis seperti pada rekap
  // sesi (routes/reports.ts), agar kedua tampilan tidak bertentangan.
  if (assignment.workMode === "kelompok" && assignment.worksheetId !== null && uniqueStudents.length > 0) {
    const [groupRows, memberRows] = await Promise.all([
      db
        .select({ groupId: assignmentGroups.id })
        .from(assignmentGroups)
        .where(eq(assignmentGroups.assignmentId, assignmentId)),
      db
        .select({ studentId: assignmentGroupMembers.studentId, groupId: assignmentGroupMembers.groupId })
        .from(assignmentGroupMembers)
        .where(eq(assignmentGroupMembers.assignmentId, assignmentId)),
    ]);
    const groupIds = groupRows.map((row) => row.groupId);
    const groupAttempts = groupIds.length
      ? await db
          .select({ id: worksheetAttempts.id, groupId: worksheetAttempts.groupId, status: worksheetAttempts.status, submittedAt: worksheetAttempts.submittedAt, totalScore: worksheetAttempts.totalScore })
          .from(worksheetAttempts)
          .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.groupId, groupIds)))
      : [];
    const attemptsByGroup = new Map(groupAttempts.flatMap((attempt) => (attempt.groupId === null ? [] : [[attempt.groupId, attempt] as const])));
    const groupAttemptByStudent = mapGroupAttemptsToStudents(memberRows, attemptsByGroup);
    // Tahap 2: penyesuaian nilai individu (bila attempt efektifnya adalah
    // attempt kelompok) menggantikan nilai kelompok yang diwarisi.
    const groupIdByStudent = new Map(memberRows.map((row) => [row.studentId, row.groupId]));
    const overrideRows = groupAttempts.length
      ? await db
          .select({ attemptId: worksheetAttemptMemberScores.attemptId, studentId: worksheetAttemptMemberScores.studentId, score: worksheetAttemptMemberScores.score })
          .from(worksheetAttemptMemberScores)
          .where(inArray(worksheetAttemptMemberScores.attemptId, groupAttempts.map((attempt) => attempt.id)))
      : [];
    const overrideByAttemptStudent = new Map(overrideRows.map((row) => [`${row.attemptId}:${row.studentId}`, row.score]));
    for (const student of uniqueStudents) {
      const groupSnapshot = groupAttemptByStudent.get(student.id);
      const effective = pickEffectiveAttempt(attemptByStudent.get(student.id), groupSnapshot);
      if (effective) {
        let totalScore = effective.totalScore;
        if (groupSnapshot && effective === groupSnapshot) {
          const groupAttemptId = attemptsByGroup.get(groupIdByStudent.get(student.id)!)?.id;
          const override = groupAttemptId === undefined ? null : (overrideByAttemptStudent.get(`${groupAttemptId}:${student.id}`) ?? null);
          const effectiveScore = resolveEffectiveMemberScore(override, effective.totalScore);
          totalScore = effectiveScore === null ? null : effectiveScore.toFixed(2);
        }
        attemptByStudent.set(student.id, { studentId: student.id, ...effective, totalScore });
      }
    }
  }
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

// Tahap 2 — penyesuaian nilai individu pada attempt kelompok. Hanya untuk
// attempt kelompok milik LKPD guru yang meminta; score null menghapus
// penyesuaian (anggota kembali mewarisi nilai total kelompok). Batas atas
// nilai adalah jumlah poin semua butir LKPD.
gradingRoutes.put("/attempts/:attemptId/member-scores", zValidator("json", memberScoreSchema), async (c) => {
  const user = c.get("user")!;
  const attemptId = Number(c.req.param("attemptId"));
  if (!Number.isInteger(attemptId) || attemptId <= 0) return c.json({ ok: false, message: "ID pengumpulan tidak valid." }, 400);

  const [attempt] = await db
    .select({
      id: worksheetAttempts.id,
      worksheetId: worksheetAttempts.worksheetId,
      groupId: worksheetAttempts.groupId,
      totalScore: worksheetAttempts.totalScore,
    })
    .from(worksheetAttempts)
    .innerJoin(worksheets, eq(worksheets.id, worksheetAttempts.worksheetId))
    .where(and(eq(worksheetAttempts.id, attemptId), eq(worksheets.teacherId, user.userId)))
    .limit(1);
  if (!attempt) return c.json({ ok: false, message: "Pengumpulan tidak ditemukan." }, 404);
  if (attempt.groupId === null) {
    return c.json({ ok: false, message: "Penyesuaian nilai hanya berlaku untuk pengumpulan kelompok." }, 400);
  }
  const { studentId, score } = c.req.valid("json");
  const [membership] = await db
    .select({ id: assignmentGroupMembers.id })
    .from(assignmentGroupMembers)
    .where(and(eq(assignmentGroupMembers.groupId, attempt.groupId), eq(assignmentGroupMembers.studentId, studentId)))
    .limit(1);
  if (!membership) {
    return c.json({ ok: false, message: "Murid ini bukan anggota kelompok pengumpulan ini." }, 400);
  }
  if (score !== null) {
    const items = await db
      .select({ points: worksheetItems.points })
      .from(worksheetItems)
      .where(eq(worksheetItems.worksheetId, attempt.worksheetId));
    const maxScore = items.reduce((sum, item) => sum + item.points, 0);
    if (score > maxScore) {
      return c.json({ ok: false, message: `Nilai harus berada antara 0 dan ${maxScore} (total poin LKPD ini).` }, 400);
    }
    await db
      .insert(worksheetAttemptMemberScores)
      .values({ attemptId, studentId, score: score.toFixed(2) })
      .onDuplicateKeyUpdate({ set: { score: score.toFixed(2) } });
  } else {
    await db
      .delete(worksheetAttemptMemberScores)
      .where(and(
        eq(worksheetAttemptMemberScores.attemptId, attemptId),
        eq(worksheetAttemptMemberScores.studentId, studentId),
      ));
  }
  const memberScores = await loadAttemptMemberScores(attemptId);
  const override = memberScores.get(studentId) ?? null;
  return c.json({
    ok: true,
    data: {
      attempt_id: attemptId,
      student_id: studentId,
      member_score: override === null ? null : Number(override),
      effective_score: resolveEffectiveMemberScore(override, attempt.totalScore),
    },
  });
});
