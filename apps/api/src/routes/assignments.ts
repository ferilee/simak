import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { addAssignmentGroupMemberSchema, copyAssignmentGroupsSchema, createAssignmentSchema, shuffleAssignmentGroupsSchema, updateAssignmentSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { assignmentTargetRuleError, loadAssignmentStudentsView } from "../lib/assignment-target";
import { loadTeacherClassMemberships } from "../lib/student-class";
import {
  assignmentHasGroupWork,
  classShuffleLocked,
  copyGroupsForClass,
  ensureGroupsForAssignment,
  groupMemberRemovalAllowed,
  loadAssignmentGroupsView,
  loadGroupAttemptStatus,
  regenerateGroupsForClass,
} from "../lib/groups";

// Penugasan ke kelas: jadwal buka/tutup dan tautan kuis RUAS.
export const assignmentRoutes = new Hono();

const { assignmentClasses, assignmentGroupMembers, assignmentGroups, assignmentStudents, assignments, classMembers, classes, exitTickets, modules, users, worksheetAttempts, worksheets } = schema;

type AssignmentStudentView = { id: number; name: string; username: string; class_name: string };

function serializeAssignment(
  assignment: typeof assignments.$inferSelect,
  linkedClasses: { id: number; name: string; joinCode: string }[] = [],
  linkedStudents: AssignmentStudentView[] = [],
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
    target_type: assignment.targetType,
    opens_at: assignment.opensAt,
    due_at: assignment.dueAt,
    status: assignment.status,
    classes: linkedClasses.map((kelas) => ({ id: kelas.id, name: kelas.name, join_code: kelas.joinCode })),
    // Murid sasaran langsung — hanya terisi untuk target_type "siswa";
    // penugasan "kelas" selalu mengirim daftar kosong.
    students: linkedStudents,
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

async function getLinkedStudentIds(assignmentId: number) {
  const rows = await db
    .select({ studentId: assignmentStudents.studentId })
    .from(assignmentStudents)
    .where(eq(assignmentStudents.assignmentId, assignmentId));
  return rows.map((row) => row.studentId);
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

// Murid sasaran langsung sah hanya bila ia anggota minimal satu kelas
// (tidak diarsipkan) milik guru yang meminta — murid dari guru lain atau
// murid tanpa kelas guru ini ditolak.
async function validateTeacherStudents(userId: number, studentIds: number[]) {
  if (studentIds.length === 0) return true;
  const rows = await db
    .select({ studentId: classMembers.studentId })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classes.teacherId, userId), eq(classes.isArchived, false), inArray(classMembers.studentId, studentIds)));
  const memberIds = new Set(rows.map((row) => row.studentId));
  return studentIds.every((studentId) => memberIds.has(studentId));
}

// Predikat "sudah ada aktivitas murid" untuk satu penugasan, memakai sumber
// data yang sama dengan rekap sesi (routes/reports.ts): murid sasaran adalah
// anggota kelas tujuan penugasan (kelas yang tidak diarsipkan) ditambah
// murid sasaran langsung (target_type "siswa"), dan aktivitas terhitung
// adalah exit ticket untuk penugasan ini ATAU attempt pada LKPD tertaut —
// keduanya oleh salah satu murid sasaran.
async function assignmentHasStudentActivity(assignment: typeof assignments.$inferSelect) {
  const memberRows = await db
    .select({ studentId: classMembers.studentId })
    .from(assignmentClasses)
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .innerJoin(classMembers, eq(classMembers.classId, classes.id))
    .where(and(eq(assignmentClasses.assignmentId, assignment.id), eq(classes.isArchived, false)));
  const directRows = await db
    .select({ studentId: assignmentStudents.studentId })
    .from(assignmentStudents)
    .where(eq(assignmentStudents.assignmentId, assignment.id));
  const studentIds = [...new Set([...memberRows.map((row) => row.studentId), ...directRows.map((row) => row.studentId)])];
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
  const studentsByAssignment = new Map<number, AssignmentStudentView[]>();
  const siswaRows = rows.filter((row) => row.targetType === "siswa");
  if (siswaRows.length > 0) {
    const membershipsByStudent = await loadTeacherClassMemberships(user.userId);
    for (const row of siswaRows) {
      studentsByAssignment.set(row.id, await loadAssignmentStudentsView(row, membershipsByStudent));
    }
  }
  return c.json({
    ok: true,
    data: rows.map((row) => serializeAssignment(row, classesByAssignment.get(row.id) ?? [], studentsByAssignment.get(row.id) ?? [])),
  });
});

assignmentRoutes.post("/", zValidator("json", createAssignmentSchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");
  const referenceError = await validateTeacherReferences(user.userId, input.moduleId, input.worksheetId);
  if (referenceError) return c.json({ ok: false, message: referenceError }, 404);
  const targetRuleError = assignmentTargetRuleError({
    targetType: input.targetType,
    workMode: input.workMode,
    classIds: input.classIds,
    studentIds: input.studentIds,
  });
  if (targetRuleError) return c.json({ ok: false, message: targetRuleError }, 400);
  if (input.targetType === "siswa") {
    if (!(await validateTeacherStudents(user.userId, input.studentIds ?? []))) {
      return c.json({ ok: false, message: "Ada murid sasaran yang bukan anggota kelas yang Anda kelola." }, 400);
    }
  } else if (!(await validateTeacherClasses(user.userId, input.classIds ?? []))) {
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
      targetType: input.targetType,
      opensAt: input.opensAt,
      dueAt: input.dueAt,
    }).$returningId();
    assignmentId = created!.id;
    if (input.targetType === "siswa") {
      await tx.insert(assignmentStudents).values((input.studentIds ?? []).map((studentId) => ({ assignmentId, studentId })));
    } else {
      await tx.insert(assignmentClasses).values((input.classIds ?? []).map((classId) => ({ assignmentId, classId })));
    }
  });

  const assignment = await ownedAssignment(user.userId, assignmentId);
  const membershipsByStudent = assignment!.targetType === "siswa" ? await loadTeacherClassMemberships(user.userId) : new Map();
  return c.json({
    ok: true,
    data: serializeAssignment(
      assignment!,
      await getLinkedClasses(assignmentId),
      assignment!.targetType === "siswa" ? await loadAssignmentStudentsView(assignment!, membershipsByStudent) : [],
    ),
  }, 201);
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
    const contentKeys = ["moduleId", "worksheetId", "title", "instructions", "ruasQuizUrl", "workMode", "groupSize", "opensAt", "dueAt", "classIds", "targetType", "studentIds"] as const;
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
  // penugasan–LKPD yang menjadi dasar rekap dan pengumpulan. Jenis sasaran
  // dan daftar murid sasaran mengikuti kunci yang sama (predikat aktivitas
  // yang sama). Field lain (judul, petunjuk, tautan RUAS, jadwal, status)
  // tetap boleh berubah.
  const targetTypeChanged = input.targetType !== undefined && input.targetType !== current.targetType;
  if (current.status === "terbit" && (input.moduleId !== undefined || input.worksheetId !== undefined || input.classIds !== undefined || input.targetType !== undefined || input.studentIds !== undefined)) {
    const linkedClasses = await getLinkedClasses(assignmentId);
    const linkedStudentIds = await getLinkedStudentIds(assignmentId);
    const moduleChanged = input.moduleId !== undefined && input.moduleId !== (current.moduleId ?? undefined);
    const worksheetChanged = input.worksheetId !== undefined && input.worksheetId !== (current.worksheetId ?? undefined);
    const classesChanged = input.classIds !== undefined
      && (input.classIds.length !== linkedClasses.length || input.classIds.some((id) => !linkedClasses.some((kelas) => kelas.id === id)));
    const studentsChanged = input.studentIds !== undefined
      && (input.studentIds.length !== linkedStudentIds.length || input.studentIds.some((id) => !linkedStudentIds.includes(id)));
    if ((moduleChanged || worksheetChanged || classesChanged || targetTypeChanged || studentsChanged) && (await assignmentHasStudentActivity(current))) {
      if (targetTypeChanged || studentsChanged) {
        return c.json({ ok: false, message: "Sasaran penugasan tidak dapat diubah karena sudah ada murid yang mengerjakan penugasan ini." }, 409);
      }
      return c.json({ ok: false, message: "Modul, LKPD, dan kelas tujuan tidak dapat diubah karena sudah ada murid yang mengerjakan penugasan ini." }, 409);
    }
  }
  const referenceError = await validateTeacherReferences(user.userId, input.moduleId, input.worksheetId);
  if (referenceError) return c.json({ ok: false, message: referenceError }, 404);
  if (input.classIds && !(await validateTeacherClasses(user.userId, input.classIds))) {
    return c.json({ ok: false, message: "Ada kelas tujuan yang tidak Anda kelola atau sudah diarsipkan." }, 400);
  }
  if (input.studentIds && !(await validateTeacherStudents(user.userId, input.studentIds))) {
    return c.json({ ok: false, message: "Ada murid sasaran yang bukan anggota kelas yang Anda kelola." }, 400);
  }
  // Aturan kombinasi sasaran ditegakkan atas keadaan EFEKTIF sesudah PATCH
  // (jenis sasaran/mode dari payload bila ada, selain itu dari simpanan;
  // daftar sasaran dari payload bila ada, selain itu dari tautan tersimpan).
  const effectiveTargetType = input.targetType ?? current.targetType;
  const effectiveWorkMode = input.workMode ?? current.workMode;
  const effectiveClassIds = input.classIds ?? (await getLinkedClasses(assignmentId)).map((kelas) => kelas.id);
  const effectiveStudentIds = input.studentIds ?? (await getLinkedStudentIds(assignmentId));
  const effectiveRuleError = assignmentTargetRuleError({
    targetType: effectiveTargetType,
    workMode: effectiveWorkMode,
    classIds: effectiveClassIds,
    studentIds: effectiveStudentIds,
  });
  if (effectiveRuleError) return c.json({ ok: false, message: effectiveRuleError }, 400);
  if (input.status === "terbit" || (input.status === undefined && current.status === "terbit")) {
    const publishError = await validatePublishableReferences(user.userId, input.moduleId ?? current.moduleId ?? undefined, input.worksheetId ?? current.worksheetId ?? undefined);
    if (publishError) return c.json({ ok: false, message: publishError }, 400);
  }
  const opensAt = input.opensAt ?? current.opensAt;
  const dueAt = input.dueAt ?? current.dueAt;
  if (dueAt < opensAt) return c.json({ ok: false, message: "Batas pengumpulan harus setelah waktu buka." }, 400);

  const { classIds, studentIds, ...assignmentInput } = input;
  await db.transaction(async (tx) => {
    if (Object.keys(assignmentInput).length > 0) {
      await tx.update(assignments).set(assignmentInput).where(eq(assignments.id, assignmentId));
    }
    // Sinkronisasi daftar sasaran mengikuti jenis sasaran efektif: daftar
    // milik jenis yang aktif diganti bila payload membawanya (atau jenisnya
    // baru berganti), dan daftar milik jenis yang ditinggalkan dikosongkan.
    if (effectiveTargetType === "siswa") {
      if (studentIds || targetTypeChanged) {
        await tx.delete(assignmentStudents).where(eq(assignmentStudents.assignmentId, assignmentId));
        if (effectiveStudentIds.length > 0) {
          await tx.insert(assignmentStudents).values(effectiveStudentIds.map((studentId) => ({ assignmentId, studentId })));
        }
      }
      if (targetTypeChanged) {
        await tx.delete(assignmentClasses).where(eq(assignmentClasses.assignmentId, assignmentId));
      }
    } else {
      if (classIds || targetTypeChanged) {
        await tx.delete(assignmentClasses).where(eq(assignmentClasses.assignmentId, assignmentId));
        if (effectiveClassIds.length > 0) {
          await tx.insert(assignmentClasses).values(effectiveClassIds.map((classId) => ({ assignmentId, classId })));
        }
      }
      if (targetTypeChanged) {
        await tx.delete(assignmentStudents).where(eq(assignmentStudents.assignmentId, assignmentId));
      }
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
  const membershipsByStudent = updated!.targetType === "siswa" ? await loadTeacherClassMemberships(user.userId) : new Map();
  return c.json({
    ok: true,
    data: serializeAssignment(
      updated!,
      await getLinkedClasses(assignmentId),
      updated!.targetType === "siswa" ? await loadAssignmentStudentsView(updated!, membershipsByStudent) : [],
    ),
  });
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

assignmentRoutes.post("/:id/groups/copy", zValidator("json", copyAssignmentGroupsSchema), async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return c.json({ ok: false, message: "ID penugasan tidak valid." }, 400);
  const assignment = await ownedAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  if (assignment.workMode !== "kelompok") {
    return c.json({ ok: false, message: "Penugasan ini bukan penugasan kelompok." }, 400);
  }
  const { sourceAssignmentId, classId } = c.req.valid("json");
  if (sourceAssignmentId === assignmentId) {
    return c.json({ ok: false, message: "Penugasan sumber tidak boleh penugasan ini sendiri." }, 400);
  }
  const source = await ownedAssignment(user.userId, sourceAssignmentId);
  if (!source) return c.json({ ok: false, message: "Penugasan sumber tidak ditemukan." }, 404);
  if (source.workMode !== "kelompok") {
    return c.json({ ok: false, message: "Penugasan sumber bukan penugasan kelompok." }, 400);
  }
  const linkedClasses = await getLinkedClasses(assignmentId);
  if (!linkedClasses.some((kelas) => kelas.id === classId)) {
    return c.json({ ok: false, message: "Kelas ini bukan kelas tujuan penugasan." }, 400);
  }
  const [sourceGroup] = await db
    .select({ id: assignmentGroups.id })
    .from(assignmentGroups)
    .where(and(eq(assignmentGroups.assignmentId, sourceAssignmentId), eq(assignmentGroups.classId, classId)))
    .limit(1);
  if (!sourceGroup) {
    return c.json({ ok: false, message: "Penugasan sumber belum mempunyai kelompok untuk kelas ini." }, 400);
  }
  const [existingGroup] = await db
    .select({ id: assignmentGroups.id })
    .from(assignmentGroups)
    .where(and(eq(assignmentGroups.assignmentId, assignmentId), eq(assignmentGroups.classId, classId)))
    .limit(1);
  if (existingGroup && (await classShuffleLocked(assignment, classId))) {
    return c.json({ ok: false, message: "Kelompok kelas ini tidak dapat diganti karena sudah ada kelompok yang mulai mengerjakan." }, 409);
  }
  await copyGroupsForClass(assignment, source, classId);
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

// Tahap 2 — keluarkan anggota dari kelompoknya. Hanya boleh selama attempt
// kelompok itu pada LKPD penugasan belum ada atau masih draf; jawaban yang
// sudah dibuat murid tetap tersimpan sebagai milik kelompok (jawaban
// menempel pada attempt, bukan pada anggota). Murid yang dikeluarkan
// kembali berstatus belum berkelompok dan dapat ditambahkan ke kelompok
// lain lewat endpoint tambah anggota — pasangan keduanya = memindahkan
// anggota.
assignmentRoutes.delete("/:id/groups/:groupId/members/:studentId", async (c) => {
  const user = c.get("user")!;
  const assignmentId = Number(c.req.param("id"));
  const groupId = Number(c.req.param("groupId"));
  const studentId = Number(c.req.param("studentId"));
  if (![assignmentId, groupId, studentId].every((value) => Number.isInteger(value) && value > 0)) {
    return c.json({ ok: false, message: "ID penugasan, kelompok, atau murid tidak valid." }, 400);
  }
  const assignment = await ownedAssignment(user.userId, assignmentId);
  if (!assignment) return c.json({ ok: false, message: "Penugasan tidak ditemukan." }, 404);
  const [group] = await db
    .select({ id: assignmentGroups.id })
    .from(assignmentGroups)
    .where(and(eq(assignmentGroups.id, groupId), eq(assignmentGroups.assignmentId, assignmentId)))
    .limit(1);
  if (!group) return c.json({ ok: false, message: "Kelompok tidak ditemukan pada penugasan ini." }, 404);
  const [membership] = await db
    .select({ id: assignmentGroupMembers.id })
    .from(assignmentGroupMembers)
    .where(and(eq(assignmentGroupMembers.groupId, groupId), eq(assignmentGroupMembers.studentId, studentId)))
    .limit(1);
  if (!membership) return c.json({ ok: false, message: "Murid ini bukan anggota kelompok tersebut." }, 404);
  const attemptStatus = await loadGroupAttemptStatus(assignment, groupId);
  if (!groupMemberRemovalAllowed(attemptStatus)) {
    return c.json({ ok: false, message: "Anggota tidak dapat dikeluarkan karena kelompoknya sudah mengumpulkan." }, 409);
  }
  await db.delete(assignmentGroupMembers).where(eq(assignmentGroupMembers.id, membership.id));
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
