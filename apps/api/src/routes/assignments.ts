import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { addAssignmentGroupMemberSchema, createAssignmentSchema, shuffleAssignmentGroupsSchema, updateAssignmentSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import {
  assignmentHasGroupWork,
  classShuffleLocked,
  ensureGroupsForAssignment,
  loadAssignmentGroupsView,
  regenerateGroupsForClass,
} from "../lib/groups";

// Penugasan ke kelas: jadwal buka/tutup dan tautan kuis RUAS.
export const assignmentRoutes = new Hono();

const { assignmentClasses, assignmentGroupMembers, assignmentGroups, assignments, classMembers, classes, exitTickets, modules, users, worksheetAttempts, worksheets } = schema;

function serializeAssignment(
  assignment: typeof assignments.$inferSelect,
  linkedClasses: { id: number; name: string; joinCode: string }[] = [],
) {
  return {
    id: assignment.id,
    module_id: assignment.moduleId,
    worksheet_id: assignment.worksheetId,
    title: assignment.title,
    instructions: assignment.instructions,
    ruas_quiz_url: assignment.ruasQuizUrl,
    work_mode: assignment.workMode,
    group_size: assignment.groupSize,
    opens_at: assignment.opensAt,
    due_at: assignment.dueAt,
    status: assignment.status,
    classes: linkedClasses.map((kelas) => ({ id: kelas.id, name: kelas.name, join_code: kelas.joinCode })),
    created_at: assignment.createdAt,
    updated_at: assignment.updatedAt,
  };
}

async function ownedAssignment(userId: number, assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.teacherId, userId)))
    .limit(1);
  return assignment;
}

async function getLinkedClasses(assignmentId: number) {
  return db
    .select({ id: classes.id, name: classes.name, joinCode: classes.joinCode })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .where(eq(assignmentClasses.assignmentId, assignmentId));
}

async function validateTeacherReferences(userId: number, moduleId?: number, worksheetId?: number) {
  if (moduleId !== undefined) {
    const [module] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.teacherId, userId)))
      .limit(1);
    if (!module) return "Modul tidak ditemukan.";
  }
  if (worksheetId !== undefined) {
    const [worksheet] = await db
      .select({ id: worksheets.id })
      .from(worksheets)
      .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, userId)))
      .limit(1);
    if (!worksheet) return "LKPD tidak ditemukan.";
  }
  return null;
}

async function validatePublishableReferences(userId: number, moduleId?: number, worksheetId?: number) {
  if (moduleId !== undefined) {
    const [module] = await db
      .select({ id: modules.id, status: modules.status })
      .from(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.teacherId, userId)))
      .limit(1);
    if (!module || module.status !== "terbit") return "Modul harus diterbitkan sebelum penugasan diterbitkan.";
  }
  if (worksheetId !== undefined) {
    const [worksheet] = await db
      .select({ id: worksheets.id, status: worksheets.status })
      .from(worksheets)
      .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, userId)))
      .limit(1);
    if (!worksheet || worksheet.status !== "terbit") return "LKPD harus diterbitkan sebelum penugasan diterbitkan.";
  }
  return null;
}

async function validateTeacherClasses(userId: number, classIds: number[]) {
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.teacherId, userId), eq(classes.isArchived, false), inArray(classes.id, classIds)));
  return rows.length === new Set(classIds).size;
}

// Predikat "sudah ada aktivitas murid" untuk satu penugasan, memakai sumber
// data yang sama dengan rekap sesi (routes/reports.ts): murid sasaran adalah
// anggota kelas tujuan penugasan (kelas yang tidak diarsipkan), dan aktivitas
// terhitung adalah exit ticket untuk penugasan ini ATAU attempt pada LKPD
// tertaut — keduanya oleh salah satu murid sasaran.
async function assignmentHasStudentActivity(assignment: typeof assignments.$inferSelect) {
  const memberRows = await db
    .select({ studentId: classMembers.studentId })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .where(and(eq(assignmentClasses.assignmentId, assignment.id), eq(classes.isArchived, false)));
  const studentIds = [...new Set(memberRows.map((row) => row.studentId))];
  if (studentIds.length === 0) return false;
  const [ticket] = await db
    .select({ id: exitTickets.id })
    .from(exitTickets)
    .where(and(eq(exitTickets.assignmentId, assignment.id), inArray(exitTickets.studentId, studentIds)))
    .limit(1);
  if (ticket) return true;
  if (assignment.worksheetId === null) return false;
  const [attempt] = await db
    .select({ id: worksheetAttempts.id })
    .from(worksheetAttempts)
    .where(and(eq(worksheetAttempts.worksheetId, assignment.worksheetId), inArray(worksheetAttempts.studentId, studentIds)))
    .limit(1);
  return Boolean(attempt);
}

assignmentRoutes.use("*", requireRole("guru"));

assignmentRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await db.select().from(assignments).where(eq(assignments.teacherId, user.userId)).orderBy(desc(assignments.opensAt));
  const links = rows.length
    ? await db
        .select({ assignmentId: assignmentClasses.assignmentId, id: classes.id, name: classes.name, joinCode: classes.joinCode })
        .from(assignmentClasses)
        .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
        .where(inArray(assignmentClasses.assignmentId, rows.map((row) => row.id)))
    : [];
  const classesByAssignment = new Map<number, { id: number; name: string; joinCode: string }[]>();
  for (const link of links) {
    const current = classesByAssignment.get(link.assignmentId) ?? [];
    current.push({ id: link.id, name: link.name, joinCode: link.joinCode });
    classesByAssignment.set(link.assignmentId, current);
  }
  return c.json({ ok: true, data: rows.map((row) => serializeAssignment(row, classesByAssignment.get(row.id) ?? [])) });
});

assignmentRoutes.post("/", zValidator("json", createAssignmentSchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");
  const referenceError = await validateTeacherReferences(user.userId, input.moduleId, input.worksheetId);
  if (referenceError) return c.json({ ok: false, message: referenceError }, 404);
  if (!(await validateTeacherClasses(user.userId, input.classIds))) {
    return c.json({ ok: false, message: "Ada kelas tujuan yang tidak Anda kelola atau sudah diarsipkan." }, 400);
  }

  let assignmentId = 0;
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(assignments).values({
      teacherId: user.userId,
      moduleId: input.moduleId,
      worksheetId: input.worksheetId,
      title: input.title,
      instructions: input.instructions,
      ruasQuizUrl: input.ruasQuizUrl,
      workMode: input.workMode,
      groupSize: input.workMode === "kelompok" ? (input.groupSize ?? 4) : (input.groupSize ?? null),
      opensAt: input.opensAt,
      dueAt: input.dueAt,
    }).$returningId();
    assignmentId = created!.id;
    await tx.insert(assignmentClasses).values(input.classIds.map((classId) => ({ assignmentId, classId })));
  });

  const assignment = await ownedAssignment(user.userId, assignmentId);
  return c.json({ ok: true, data: serializeAssignment(assignment!, await getLinkedClasses(assignmentId)) }, 201);
});

assignmentRoutes.patch("/:id", zValidator("json", updateAssignmentSchema), async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const current = await ownedAssignment(user.userId, assignmentId);
  if (!current) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  const input = c.req.valid("json");
  // Pagar status — penugasan ditutup bersifat final: PATCH yang mengubah isi
  // apa pun ditolak. Satu-satunya pengecualian adalah PATCH yang hanya berisi
  // field status, karena UI membuka kembali penugasan ditutup lewat tombol
  // "Terbitkan" yang mengirim body { status } saja.
  if (current.status === "ditutup") {
    const contentKeys = ["moduleId", "worksheetId", "title", "instructions", "ruasQuizUrl", "workMode", "groupSize", "opensAt", "dueAt", "classIds"] as const;
    if (contentKeys.some((key) => input[key] !== undefined)) {
      return c.json({ ok: false, message: "Penugasan yang sudah ditutup tidak dapat diubah." }, 409);
    }
  }
  // Pagar mode pengerjaan — pada penugasan terbit, mode pengerjaan dan
  // ukuran kelompok terkunci begitu ada aktivitas murid: predikat yang
  // dipakai adalah assignmentHasStudentActivity yang sama dengan pagar
  // modul/LKPD/kelas di bawah (attempt individu murid sasaran atau exit
  // ticket) ATAU assignmentHasGroupWork (attempt kelompok yang sudah
  // mempunyai jawaban atau berstatus bukan draf). Mengganti mode di tengah
  // jalan akan mengacaukan pasangan attempt–penugasan yang menjadi dasar
  // pengumpulan dan rekap.
  const workModeChanged = input.workMode !== undefined && input.workMode !== current.workMode;
  const groupSizeChanged = input.groupSize !== undefined && input.groupSize !== current.groupSize;
  if (current.status === "terbit" && (workModeChanged || groupSizeChanged)) {
    if ((await assignmentHasStudentActivity(current)) || (await assignmentHasGroupWork(current))) {
      return c.json({ ok: false, message: "Mode pengerjaan dan ukuran kelompok tidak dapat diubah karena sudah ada murid yang mengerjakan penugasan ini." }, 409);
    }
  }
  // Pagar status — pada penugasan terbit yang sudah dikerjakan murid, modul,
  // LKPD, dan kelas tujuan terkunci: menggantinya akan memutuskan pasangan
  // penugasan–LKPD yang menjadi dasar rekap dan pengumpulan. Field lain
  // (judul, petunjuk, tautan RUAS, jadwal, status) tetap boleh berubah.
  if (current.status === "terbit" && (input.moduleId !== undefined || input.worksheetId !== undefined || input.classIds !== undefined)) {
    const linkedClasses = await getLinkedClasses(assignmentId);
    const moduleChanged = input.moduleId !== undefined && input.moduleId !== (current.moduleId ?? undefined);
    const worksheetChanged = input.worksheetId !== undefined && input.worksheetId !== (current.worksheetId ?? undefined);
    const classesChanged = input.classIds !== undefined
      && (input.classIds.length !== linkedClasses.length || input.classIds.some((id) => !linkedClasses.some((kelas) => kelas.id === id)));
    if ((moduleChanged || worksheetChanged || classesChanged) && (await assignmentHasStudentActivity(current))) {
      return c.json({ ok: false, message: "Modul, LKPD, dan kelas tujuan tidak dapat diubah karena sudah ada murid yang mengerjakan penugasan ini." }, 409);
    }
  }
  const referenceError = await validateTeacherReferences(user.userId, input.moduleId, input.worksheetId);
  if (referenceError) return c.json({ ok: false, message: referenceError }, 404);
  if (input.classIds && !(await validateTeacherClasses(user.userId, input.classIds))) {
    return c.json({ ok: false, message: "Ada kelas tujuan yang tidak Anda kelola atau sudah diarsipkan." }, 400);
  }
  if (input.status === "terbit" || (input.status === undefined && current.status === "terbit")) {
    const publishError = await validatePublishableReferences(user.userId, input.moduleId ?? current.moduleId ?? undefined, input.worksheetId ?? current.worksheetId ?? undefined);
    if (publishError) return c.json({ ok: false, message: publishError }, 400);
  }
  const opensAt = input.opensAt ?? current.opensAt;
  const dueAt = input.dueAt ?? current.dueAt;
  if (dueAt < opensAt) return c.json({ ok: false, message: "Batas pengumpulan harus setelah waktu buka." }, 400);

  const { classIds, ...assignmentInput } = input;
  await db.transaction(async (tx) => {
    if (Object.keys(assignmentInput).length > 0) {
      await tx.update(assignments).set(assignmentInput).where(eq(assignments.id, assignmentId));
    }
    if (classIds) {
      await tx.delete(assignmentClasses).where(eq(assignmentClasses.assignmentId, assignmentId));
      await tx.insert(assignmentClasses).values(classIds.map((classId) => ({ assignmentId, classId })));
    }
  });

  const [updated] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  // Kelompok acak otomatis: penugasan kelompok yang berstatus terbit selalu
  // dipastikan mempunyai kelompok di semua kelas tujuannya (transisi ke
  // terbit, kelas tujuan yang baru ditambahkan, maupun kelompok yang belum
  // sempat terbentuk). ensureGroupsForAssignment bersifat idempoten.
  if (updated!.workMode === "kelompok" && updated!.status === "terbit") {
    await ensureGroupsForAssignment(updated!);
  } else if (groupSizeChanged && updated!.workMode === "kelompok") {
    // Ukuran berubah saat masih draf dan kelompok sudah dibentuk lebih dulu
    // lewat panel Kelompok: bentuk ulang kelas yang belum terkunci agar
    // ukurannya mengikuti pengaturan baru.
    const linkedClasses = await getLinkedClasses(assignmentId);
    for (const kelas of linkedClasses) {
      const [existing] = await db
        .select({ id: assignmentGroups.id })
        .from(assignmentGroups)
        .where(and(eq(assignmentGroups.assignmentId, assignmentId), eq(assignmentGroups.classId, kelas.id)))
        .limit(1);
      if (existing && !(await classShuffleLocked(updated!, kelas.id))) {
        await regenerateGroupsForClass(updated!, kelas.id);
      }
    }
  }
  return c.json({ ok: true, data: serializeAssignment(updated!, await getLinkedClasses(assignmentId)) });
});

// ---------------------------------------------------------------------------
// Kelompok penugasan (mode "kelompok") — panel guru.
// ---------------------------------------------------------------------------

assignmentRoutes.get("/:id/groups", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const assignment = await ownedAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  return c.json({
    ok: true,
    data: {
      assignment_id: assignment.id,
      work_mode: assignment.workMode,
      group_size: assignment.groupSize,
      classes: await loadAssignmentGroupsView(assignment),
    },
  });
});

assignmentRoutes.post("/:id/groups/generate", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const assignment = await ownedAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  if (assignment.workMode !== "kelompok") {
    return c.json({ ok: false, message: "Penugasan ini bukan penugasan kelompok." }, 400);
  }
  await ensureGroupsForAssignment(assignment);
  return c.json({
    ok: true,
    data: {
      assignment_id: assignment.id,
      work_mode: assignment.workMode,
      group_size: assignment.groupSize,
      classes: await loadAssignmentGroupsView(assignment),
    },
  });
});

assignmentRoutes.post("/:id/groups/shuffle", zValidator("json", shuffleAssignmentGroupsSchema), async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const assignment = await ownedAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  if (assignment.workMode !== "kelompok") {
    return c.json({ ok: false, message: "Penugasan ini bukan penugasan kelompok." }, 400);
  }
  const { classId } = c.req.valid("json");
  const linkedClasses = await getLinkedClasses(assignmentId);
  if (!linkedClasses.some((kelas) => kelas.id === classId)) {
    return c.json({ ok: false, message: "Kelas ini bukan kelas tujuan penugasan." }, 400);
  }
  if (await classShuffleLocked(assignment, classId)) {
    return c.json({ ok: false, message: "Kelompok kelas ini tidak dapat diacak ulang karena sudah ada kelompok yang mulai mengerjakan." }, 409);
  }
  await regenerateGroupsForClass(assignment, classId);
  return c.json({
    ok: true,
    data: {
      assignment_id: assignment.id,
      work_mode: assignment.workMode,
      group_size: assignment.groupSize,
      classes: await loadAssignmentGroupsView(assignment),
    },
  });
});

assignmentRoutes.post("/:id/groups/:groupId/members", zValidator("json", addAssignmentGroupMemberSchema), async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  const groupId = Number(c.req.param("groupId"));
  if (![assignmentId, groupId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID penugasan atau kelompok tidak valid." }, 400);
  }
  const assignment = await ownedAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  const [group] = await db
    .select({ id: assignmentGroups.id, classId: assignmentGroups.classId })
    .from(assignmentGroups)
    .where(and(eq(assignmentGroups.id, groupId), eq(assignmentGroups.assignmentId, assignmentId)))
    .limit(1);
  if (!group) return c.json({ ok: false, message: "Kelompok tidak ditemukan pada penugasan ini." }, 404);
  const { studentId } = c.req.valid("json");
  const [membership] = await db
    .select({ id: classMembers.id })
    .from(classMembers)
    .where(and(eq(classMembers.classId, group.classId), eq(classMembers.studentId, studentId)))
    .limit(1);
  if (!membership) {
    return c.json({ ok: false, message: "Murid ini bukan anggota kelas kelompok tersebut." }, 400);
  }
  const [alreadyGrouped] = await db
    .select({ id: assignmentGroupMembers.id })
    .from(assignmentGroupMembers)
    .where(and(eq(assignmentGroupMembers.assignmentId, assignmentId), eq(assignmentGroupMembers.studentId, studentId)))
    .limit(1);
  if (alreadyGrouped) {
    return c.json({ ok: false, message: "Murid ini sudah tergabung dalam kelompok lain pada penugasan ini." }, 409);
  }
  const [student] = await db.select({ id: users.id }).from(users).where(eq(users.id, studentId)).limit(1);
  if (!student) return c.json({ ok: false, message: "Murid tidak ditemukan." }, 404);
  await db.insert(assignmentGroupMembers).values({ groupId, assignmentId, studentId });
  return c.json({
    ok: true,
    data: {
      assignment_id: assignment.id,
      work_mode: assignment.workMode,
      group_size: assignment.groupSize,
      classes: await loadAssignmentGroupsView(assignment),
    },
  });
});
