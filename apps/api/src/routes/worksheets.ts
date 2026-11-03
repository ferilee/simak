import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import {
  createWorksheetItemSchema,
  createWorksheetSchema,
  gradeWorksheetItemSchema,
  gradeWorksheetSchema,
  reorderWorksheetItemsSchema,
  updateWorksheetItemSchema,
  updateWorksheetSchema,
} from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { loadTeacherClassMemberships, resolveStudentClass } from "../lib/student-class";
import { loadAttemptMemberScores, loadContributionSummary, resolveEffectiveMemberScore } from "../lib/groups";
import { computeGradingProgress, countGradedByAttempt, gradingStatusAfterItemSave } from "../lib/grading-progress";
import { filterGradingQueueRows, groupOnlyWorksheetIds } from "../lib/grading-queue";

// LKPD + butir blok interaktifnya (Tahap 2).
// Opsi butir divalidasi worksheetItemOptionsSchema dari @simak/shared.
export const worksheetRoutes = new Hono();

const { assignmentGroupMembers, assignmentGroups, assignments, classes, modules, users, worksheetAnswers, worksheetAttempts, worksheetItems, worksheets } = schema;

type WorksheetAttemptStats = {
  started_count: number;
  submitted_count: number;
  last_activity_at: Date | null;
};

function serializeWorksheet(
  worksheet: typeof worksheets.$inferSelect,
  stats: WorksheetAttemptStats = { started_count: 0, submitted_count: 0, last_activity_at: null },
) {
  return {
    id: worksheet.id,
    module_id: worksheet.moduleId,
    title: worksheet.title,
    instructions: worksheet.instructions,
    status: worksheet.status,
    created_at: worksheet.createdAt,
    updated_at: worksheet.updatedAt,
    started_count: stats.started_count,
    submitted_count: stats.submitted_count,
    last_activity_at: stats.last_activity_at,
  };
}

function serializeItem(item: typeof worksheetItems.$inferSelect, includeAnswer = true) {
  return {
    id: item.id,
    sort_order: item.sortOrder,
    item_type: item.itemType,
    prompt: item.prompt,
    options: item.optionsJson,
    ...(includeAnswer ? { answer_key: item.answerKey, explanation: item.explanation } : {}),
    points: item.points,
  };
}

function serializeScore(score: string | null) {
  return score === null ? null : Number(score);
}

async function ownedWorksheet(userId: number, worksheetId: number) {
  const [worksheet] = await db
    .select()
    .from(worksheets)
    .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, userId)))
    .limit(1);
  return worksheet;
}

worksheetRoutes.get("/", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  // Statistik pengerjaan per LKPD dari worksheet_attempts:
  // started_count = murid unik yang sudah mulai mengerjakan (punya attempt),
  // submitted_count = murid unik yang attempt-nya terkumpul/dinilai,
  // last_activity_at = aktivitas attempt terakhir.
  const rows = await db
    .select({
      worksheet: worksheets,
      startedCount: sql<number>`count(distinct ${worksheetAttempts.studentId})`,
      submittedCount: sql<number>`count(distinct case when ${worksheetAttempts.status} in ('terkumpul', 'dinilai') then ${worksheetAttempts.studentId} end)`,
      lastActivityAt: sql<Date | null>`max(${worksheetAttempts.updatedAt})`,
    })
    .from(worksheets)
    .leftJoin(worksheetAttempts, eq(worksheetAttempts.worksheetId, worksheets.id))
    .where(eq(worksheets.teacherId, user.userId))
    .groupBy(worksheets.id);
  return c.json({
    ok: true,
    data: rows.map((row) =>
      serializeWorksheet(row.worksheet, {
        started_count: Number(row.startedCount),
        submitted_count: Number(row.submittedCount),
        last_activity_at: row.lastActivityAt,
      }),
    ),
  });
});

worksheetRoutes.post(
  "/",
  requireRole("guru"),
  zValidator("json", createWorksheetSchema),
  async (c) => {
    const user = c.get("user")!;
    const input = c.req.valid("json");
    if (input.moduleId) {
      const [module] = await db
        .select({ id: modules.id })
        .from(modules)
        .where(and(eq(modules.id, input.moduleId), eq(modules.teacherId, user.userId)))
        .limit(1);
      if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
    }
    const [created] = await db.insert(worksheets).values({ ...input, teacherId: user.userId }).$returningId();
    const [worksheet] = await db.select().from(worksheets).where(eq(worksheets.id, created!.id)).limit(1);
    return c.json({ ok: true, data: serializeWorksheet(worksheet!) }, 201);
  },
);

worksheetRoutes.get("/:id/attempts", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
  const worksheet = await ownedWorksheet(user.userId, worksheetId);
  if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

  // Kelas murid untuk saringan kelas panel Pengumpulan LKPD — aturan dan
  // helper yang sama dengan daftar gabungan di routes/grading.ts. Attempt
  // kelompok ikut tampil sebagai satu unit: namanya nama kelompok dan
  // kelasnya kelas kelompok itu (bukan hasil resolusi kelas per murid).
  const [module] = worksheet.moduleId
    ? await db.select({ subject: modules.subject }).from(modules).where(eq(modules.id, worksheet.moduleId)).limit(1)
    : [];
  const [rawRows, membershipsByStudent] = await Promise.all([
    db
      .select({
        id: worksheetAttempts.id,
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
      .leftJoin(users, eq(users.id, worksheetAttempts.studentId))
      .leftJoin(assignmentGroups, eq(assignmentGroups.id, worksheetAttempts.groupId))
      .leftJoin(classes, eq(classes.id, assignmentGroups.classId))
      .where(eq(worksheetAttempts.worksheetId, worksheetId))
      .orderBy(desc(worksheetAttempts.updatedAt)),
    loadTeacherClassMemberships(user.userId),
  ]);

  // Penilaian Rapi: pada LKPD khusus penugasan kelompok, antrean hanya
  // menampilkan attempt kelompok — baris individu (duplikat anggota atau
  // pengerjaan sendiri) disembunyikan tanpa menghapus datanya. Hitungan
  // ringkas panel dihitung klien dari daftar ini, jadi menyaring di sini
  // membuat hitungan dan daftar selalu sejalan.
  const assignmentRows = await db
    .select({ worksheetId: assignments.worksheetId, workMode: assignments.workMode, status: assignments.status })
    .from(assignments)
    .where(and(eq(assignments.teacherId, user.userId), eq(assignments.worksheetId, worksheetId)));
  const rows = filterGradingQueueRows(
    rawRows.map((row) => ({ ...row, worksheetId })),
    groupOnlyWorksheetIds(assignmentRows),
  );

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

  // Kemajuan penilaian per attempt (Penilaian Rapi): jumlah butir yang
  // sudah berskor dari seluruh butir LKPD — penanda "Dinilai X dari Y
  // butir" selama penilaian dicicil dan total masih kosong.
  const visibleAttemptIds = rows.map((row) => row.id);
  const [gradedRows, itemRows] = await Promise.all([
    visibleAttemptIds.length
      ? db
          .select({ attemptId: worksheetAnswers.attemptId })
          .from(worksheetAnswers)
          .where(and(inArray(worksheetAnswers.attemptId, visibleAttemptIds), isNotNull(worksheetAnswers.score)))
      : Promise.resolve([] as { attemptId: number }[]),
    db.select({ id: worksheetItems.id }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)),
  ]);
  const gradedByAttempt = countGradedByAttempt(gradedRows);
  const totalItems = itemRows.length;

  return c.json({
    ok: true,
    data: rows.map((row) => {
      if (row.groupId !== null) {
        return {
          id: row.id,
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
          graded_count: gradedByAttempt.get(row.id) ?? 0,
          total_items: totalItems,
        };
      }
      const studentClass = resolveStudentClass(membershipsByStudent.get(row.studentId!) ?? [], module?.subject ?? null);
      return {
        id: row.id,
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
        graded_count: gradedByAttempt.get(row.id) ?? 0,
        total_items: totalItems,
      };
    }),
  });
});

worksheetRoutes.get("/:id/attempts/:attemptId", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  const attemptId = Number(c.req.param("attemptId"));
  if (![worksheetId, attemptId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID LKPD atau pengumpulan tidak valid." }, 400);
  }
  const worksheet = await ownedWorksheet(user.userId, worksheetId);
  if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

  const [attempt] = await db
    .select({
      id: worksheetAttempts.id,
      studentId: worksheetAttempts.studentId,
      studentName: users.name,
      username: users.username,
      groupId: worksheetAttempts.groupId,
      groupName: assignmentGroups.name,
      status: worksheetAttempts.status,
      submittedAt: worksheetAttempts.submittedAt,
      totalScore: worksheetAttempts.totalScore,
      teacherComment: worksheetAttempts.teacherComment,
    })
    .from(worksheetAttempts)
    .leftJoin(users, eq(users.id, worksheetAttempts.studentId))
    .leftJoin(assignmentGroups, eq(assignmentGroups.id, worksheetAttempts.groupId))
    .where(and(eq(worksheetAttempts.id, attemptId), eq(worksheetAttempts.worksheetId, worksheetId)))
    .limit(1);
  if (!attempt) return c.json({ ok: false, message: "Pengumpulan tidak ditemukan." }, 404);

  // Attempt kelompok: sertakan daftar anggotanya untuk panel penilaian,
  // diperkaya (Tahap 2) dengan ringkasan kontribusi antarteman — informasi
  // saja, tidak pernah diterapkan otomatis ke nilai — serta penyesuaian
  // nilai individu dan nilai efektif tiap anggota.
  const groupMemberRows = attempt.groupId !== null
    ? await db
        .select({ id: users.id, name: users.name, username: users.username })
        .from(assignmentGroupMembers)
        .innerJoin(users, eq(users.id, assignmentGroupMembers.studentId))
        .where(eq(assignmentGroupMembers.groupId, attempt.groupId))
        .orderBy(asc(users.name))
    : [];
  let groupMembers: (typeof groupMemberRows[number] & {
    contribution_average: number | null;
    contribution_raters: number;
    member_score: number | null;
    effective_score: number | null;
  })[] = [];
  if (attempt.groupId !== null) {
    const memberIds = groupMemberRows.map((member) => member.id);
    const [contributionSummary, memberScores] = await Promise.all([
      loadContributionSummary(attemptId, memberIds),
      loadAttemptMemberScores(attemptId),
    ]);
    groupMembers = groupMemberRows.map((member) => {
      const contribution = contributionSummary.get(member.id) ?? { average: null, raters: 0 };
      const override = memberScores.get(member.id) ?? null;
      return {
        ...member,
        contribution_average: contribution.average,
        contribution_raters: contribution.raters,
        member_score: override === null ? null : Number(override),
        effective_score: resolveEffectiveMemberScore(override, attempt.totalScore),
      };
    });
  }

  const [items, answers] = await Promise.all([
    db.select().from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)).orderBy(asc(worksheetItems.sortOrder)),
    db.select().from(worksheetAnswers).where(eq(worksheetAnswers.attemptId, attemptId)),
  ]);
  const answerByItem = new Map(answers.map((answer) => [answer.worksheetItemId, answer]));

  // Jejak penulis per jawaban (Tahap 3 mini): nama pengedit terakhir tiap
  // jawaban, untuk ditampilkan guru pada attempt kelompok. Jawaban lama
  // ber-lastEditedBy NULL → last_editor_name null.
  const editorIds = [...new Set(answers.map((answer) => answer.lastEditedBy).filter((id): id is number => id !== null))];
  const editorRows = editorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, editorIds))
    : [];
  const editorNameById = new Map(editorRows.map((editor) => [editor.id, editor.name]));

  return c.json({
    ok: true,
    data: {
      worksheet: serializeWorksheet(worksheet),
      attempt: {
        id: attempt.id,
        student_id: attempt.studentId,
        student_name: attempt.groupId !== null ? (attempt.groupName ?? "Kelompok") : attempt.studentName,
        username: attempt.groupId !== null ? "" : attempt.username,
        status: attempt.status,
        submitted_at: attempt.submittedAt,
        total_score: serializeScore(attempt.totalScore),
        teacher_comment: attempt.teacherComment,
        graded_count: answers.filter((answer) => answer.score !== null).length,
        total_items: items.length,
        is_group: attempt.groupId !== null,
        group_id: attempt.groupId,
        group_name: attempt.groupName,
        members: groupMembers,
      },
      items: items.map((item) => {
        const answer = answerByItem.get(item.id);
        return {
          ...serializeItem(item),
          answer_text: answer?.answerText ?? null,
          attachment_key: answer?.attachmentKey ?? null,
          last_editor_name: answer?.lastEditedBy ? (editorNameById.get(answer.lastEditedBy) ?? null) : null,
          answer_updated_at: answer?.updatedAt ?? null,
          score: serializeScore(answer?.score ?? null),
          teacher_note: answer?.teacherNote ?? null,
        };
      }),
    },
  });
});

worksheetRoutes.patch(
  "/:id/attempts/:attemptId",
  requireRole("guru"),
  zValidator("json", gradeWorksheetSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    const attemptId = Number(c.req.param("attemptId"));
    if (![worksheetId, attemptId].every((value) => Number.isInteger(value) && value > 0)) {
      return c.json({ ok: false, message: "ID LKPD atau pengumpulan tidak valid." }, 400);
    }
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

    const [attempt] = await db
      .select({ id: worksheetAttempts.id })
      .from(worksheetAttempts)
      .where(and(eq(worksheetAttempts.id, attemptId), eq(worksheetAttempts.worksheetId, worksheetId)))
      .limit(1);
    if (!attempt) return c.json({ ok: false, message: "Pengumpulan tidak ditemukan." }, 404);

    const input = c.req.valid("json");
    const items = await db.select({ id: worksheetItems.id, points: worksheetItems.points }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
    const pointsByItem = new Map(items.map((item) => [item.id, item.points]));
    if (input.answers.some((answer) => !pointsByItem.has(answer.itemId))) {
      return c.json({ ok: false, message: "Ada nilai untuk soal yang bukan bagian dari LKPD ini." }, 400);
    }
    if (input.answers.some((answer) => answer.score > pointsByItem.get(answer.itemId)!)) {
      return c.json({ ok: false, message: "Nilai tidak boleh melebihi poin soal." }, 400);
    }

    for (const answer of input.answers) {
      const [existing] = await db
        .select({ id: worksheetAnswers.id })
        .from(worksheetAnswers)
        .where(and(eq(worksheetAnswers.attemptId, attemptId), eq(worksheetAnswers.worksheetItemId, answer.itemId)))
        .limit(1);
      if (existing) {
        await db.update(worksheetAnswers).set({ score: answer.score.toFixed(2), teacherNote: answer.teacherNote }).where(eq(worksheetAnswers.id, existing.id));
      } else {
        await db.insert(worksheetAnswers).values({
          attemptId,
          worksheetItemId: answer.itemId,
          score: answer.score.toFixed(2),
          teacherNote: answer.teacherNote,
        });
      }
    }

    const totalScore = input.answers.reduce((sum, answer) => sum + answer.score, 0);
    await db.update(worksheetAttempts).set({
      status: "dinilai",
      totalScore: totalScore.toFixed(2),
      teacherComment: input.teacherComment,
    }).where(eq(worksheetAttempts.id, attemptId));
    return c.json({ ok: true, data: { status: "dinilai", total_score: totalScore } });
  },
);

// Penilaian Rapi — simpan nilai SATU butir seketika (autosave penilaian
// cicilan). Upsert baris jawabannya persis seperti simpan menyeluruh di
// atas — termasuk membuat baris baru bila murid tidak menjawab butir ini —
// lalu kelengkapan dihitung ulang dari skor tersimpan semua butir: bila
// semua butir berskor, total diisi dan attempt menjadi "dinilai" (hasil
// akhir identik dengan simpan menyeluruh); selama belum lengkap total
// tetap null sehingga murid belum melihat nilai apa pun. Komentar umum
// attempt tidak disentuh di sini. Skor null mengosongkan skor butir (dan
// dapat menurunkan attempt yang tadinya "dinilai" kembali ke "terkumpul").
worksheetRoutes.patch(
  "/:id/attempts/:attemptId/items",
  requireRole("guru"),
  zValidator("json", gradeWorksheetItemSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    const attemptId = Number(c.req.param("attemptId"));
    if (![worksheetId, attemptId].every((value) => Number.isInteger(value) && value > 0)) {
      return c.json({ ok: false, message: "ID LKPD atau pengumpulan tidak valid." }, 400);
    }
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

    const [attempt] = await db
      .select({ id: worksheetAttempts.id, status: worksheetAttempts.status })
      .from(worksheetAttempts)
      .where(and(eq(worksheetAttempts.id, attemptId), eq(worksheetAttempts.worksheetId, worksheetId)))
      .limit(1);
    if (!attempt) return c.json({ ok: false, message: "Pengumpulan tidak ditemukan." }, 404);

    const input = c.req.valid("json");
    const items = await db.select({ id: worksheetItems.id, points: worksheetItems.points }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
    const pointsByItem = new Map(items.map((item) => [item.id, item.points]));
    if (!pointsByItem.has(input.itemId)) {
      return c.json({ ok: false, message: "Ada nilai untuk soal yang bukan bagian dari LKPD ini." }, 400);
    }
    if (input.score !== null && input.score > pointsByItem.get(input.itemId)!) {
      return c.json({ ok: false, message: "Nilai tidak boleh melebihi poin soal." }, 400);
    }

    const scoreValue = input.score === null ? null : input.score.toFixed(2);
    const noteProvided = input.teacherNote !== undefined;
    const noteValue = noteProvided ? (input.teacherNote!.trim() === "" ? null : input.teacherNote!) : undefined;
    const [existing] = await db
      .select({ id: worksheetAnswers.id })
      .from(worksheetAnswers)
      .where(and(eq(worksheetAnswers.attemptId, attemptId), eq(worksheetAnswers.worksheetItemId, input.itemId)))
      .limit(1);
    if (existing) {
      await db.update(worksheetAnswers).set({
        score: scoreValue,
        ...(noteProvided ? { teacherNote: noteValue } : {}),
      }).where(eq(worksheetAnswers.id, existing.id));
    } else {
      await db.insert(worksheetAnswers).values({
        attemptId,
        worksheetItemId: input.itemId,
        score: scoreValue,
        teacherNote: noteValue ?? null,
      });
    }

    const savedAnswers = await db
      .select({ worksheetItemId: worksheetAnswers.worksheetItemId, score: worksheetAnswers.score })
      .from(worksheetAnswers)
      .where(eq(worksheetAnswers.attemptId, attemptId));
    const scoresByItem = new Map(savedAnswers.map((answer) => [answer.worksheetItemId, answer.score === null ? null : Number(answer.score)]));
    const progress = computeGradingProgress(items.map((item) => item.id), scoresByItem);
    const nextStatus = gradingStatusAfterItemSave(attempt.status, progress);
    if (progress.complete) {
      await db.update(worksheetAttempts).set({
        status: "dinilai",
        totalScore: progress.totalScore!.toFixed(2),
      }).where(eq(worksheetAttempts.id, attemptId));
    } else if (nextStatus !== attempt.status) {
      await db.update(worksheetAttempts).set({
        status: nextStatus,
        totalScore: null,
      }).where(eq(worksheetAttempts.id, attemptId));
    }

    return c.json({
      ok: true,
      data: {
        item_id: input.itemId,
        score: input.score,
        graded_count: progress.gradedCount,
        total_items: progress.totalItems,
        complete: progress.complete,
        status: nextStatus,
        total_score: progress.totalScore,
      },
    });
  },
);

worksheetRoutes.patch(
  "/:id",
  requireRole("guru"),
  zValidator("json", updateWorksheetSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
    const worksheet = await ownedWorksheet(user.userId, worksheetId);
    if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    await db.update(worksheets).set(c.req.valid("json")).where(eq(worksheets.id, worksheetId));
    const [updated] = await db.select().from(worksheets).where(eq(worksheets.id, worksheetId)).limit(1);
    return c.json({ ok: true, data: serializeWorksheet(updated!) });
  },
);

worksheetRoutes.get("/:id/items", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
  const rows = await db.select().from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)).orderBy(asc(worksheetItems.sortOrder));
  return c.json({ ok: true, data: rows.map((item) => serializeItem(item)) });
});

worksheetRoutes.post(
  "/:id/items",
  requireRole("guru"),
  zValidator("json", createWorksheetItemSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    const input = c.req.valid("json");
    const [created] = await db.insert(worksheetItems).values({
      worksheetId,
      sortOrder: input.sortOrder ?? 0,
      itemType: input.itemType,
      prompt: input.prompt,
      optionsJson: input.options,
      answerKey: input.answerKey,
      explanation: input.explanation,
      points: input.points,
    }).$returningId();
    const [item] = await db.select().from(worksheetItems).where(eq(worksheetItems.id, created!.id)).limit(1);
    return c.json({ ok: true, data: serializeItem(item!) }, 201);
  },
);

// Route "/order" didaftarkan sebelum "/:itemId" agar segmen "order" tidak
// tertangkap sebagai id butir.
worksheetRoutes.patch(
  "/:id/items/order",
  requireRole("guru"),
  zValidator("json", reorderWorksheetItemsSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) return c.json({ ok: false, message: "ID LKPD tidak valid." }, 400);
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    const input = c.req.valid("json");
    const existing = await db.select({ id: worksheetItems.id }).from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId));
    const existingIds = new Set(existing.map((row) => row.id));
    const requestedIds = new Set(input.itemIds);
    if (
      input.itemIds.length !== existingIds.size
      || requestedIds.size !== input.itemIds.length
      || input.itemIds.some((itemId) => !existingIds.has(itemId))
    ) {
      return c.json({ ok: false, message: "Daftar urutan butir harus memuat semua butir LKPD ini tepat satu kali." }, 400);
    }
    for (const [index, itemId] of input.itemIds.entries()) {
      await db.update(worksheetItems).set({ sortOrder: index }).where(eq(worksheetItems.id, itemId));
    }
    const rows = await db.select().from(worksheetItems).where(eq(worksheetItems.worksheetId, worksheetId)).orderBy(asc(worksheetItems.sortOrder));
    return c.json({ ok: true, data: rows.map((item) => serializeItem(item)) });
  },
);

worksheetRoutes.patch(
  "/:id/items/:itemId",
  requireRole("guru"),
  zValidator("json", updateWorksheetItemSchema),
  async (c) => {
    const user = c.get("user")!;
    const worksheetId = Number(c.req.param("id"));
    const itemId = Number(c.req.param("itemId"));
    if (![worksheetId, itemId].every((value) => Number.isInteger(value) && value > 0)) {
      return c.json({ ok: false, message: "ID LKPD atau butir tidak valid." }, 400);
    }
    if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
    const [item] = await db
      .select()
      .from(worksheetItems)
      .where(and(eq(worksheetItems.id, itemId), eq(worksheetItems.worksheetId, worksheetId)))
      .limit(1);
    if (!item) return c.json({ ok: false, message: "Butir tidak ditemukan." }, 404);
    const input = c.req.valid("json");
    if (input.itemType !== item.itemType) {
      return c.json({ ok: false, message: "Jenis butir tidak dapat diubah. Hapus butir ini lalu buat butir baru bila ingin mengganti jenisnya." }, 400);
    }
    await db.update(worksheetItems).set({
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      prompt: input.prompt,
      optionsJson: input.options ?? null,
      answerKey: input.answerKey ?? null,
      explanation: input.explanation ?? null,
      points: input.points,
    }).where(eq(worksheetItems.id, itemId));
    const [updated] = await db.select().from(worksheetItems).where(eq(worksheetItems.id, itemId)).limit(1);
    return c.json({ ok: true, data: serializeItem(updated!) });
  },
);

worksheetRoutes.delete("/:id/items/:itemId", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const worksheetId = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));
  if (![worksheetId, itemId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID LKPD atau butir tidak valid." }, 400);
  }
  if (!(await ownedWorksheet(user.userId, worksheetId))) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
  const [item] = await db
    .select({ id: worksheetItems.id })
    .from(worksheetItems)
    .where(and(eq(worksheetItems.id, itemId), eq(worksheetItems.worksheetId, worksheetId)))
    .limit(1);
  if (!item) return c.json({ ok: false, message: "Butir tidak ditemukan." }, 404);
  // Butir yang sudah dijawab murid adalah bagian dari riwayat penilaian;
  // menghapusnya akan merusak jawaban dan skor yang sudah tercatat.
  const [answer] = await db
    .select({ id: worksheetAnswers.id })
    .from(worksheetAnswers)
    .where(eq(worksheetAnswers.worksheetItemId, itemId))
    .limit(1);
  if (answer) {
    return c.json({ ok: false, message: "Butir ini sudah memiliki jawaban murid dan tidak dapat dihapus." }, 409);
  }
  await db.delete(worksheetItems).where(eq(worksheetItems.id, itemId));
  return c.json({ ok: true, data: { id: itemId } });
});
