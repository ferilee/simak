import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@simak/db";
import { requireRole } from "../middleware/auth";
import { loadAssignmentSubject, studentCanAccessModule } from "../lib/assignment-target";
import { avatarBadgeFields } from "../lib/avatar";
import { loadTeacherClassMemberships, resolveStudentClass } from "../lib/student-class";
import {
  JOURNAL_MOODS,
  JOURNAL_PROMPTS,
  collectUnreviewedEntryIds,
  collectVisibleStudentIds,
  countUnreviewedEntries,
  journalEntryOwnedBy,
  journalMoodByKey,
  journalPromptText,
  planTeacherJournalOverview,
  reduceJournalStats,
  todayWib,
  validateJournalCreate,
  validateJournalPatch,
  validateJournalResponse,
  type TeacherJournalDirectInput,
  type TeacherJournalMemberInput,
} from "../lib/jurnal";

// Jurnal Belajar (Hub Murid Tahap 3) — dua router berbagi berkas:
// - muridJurnalRoutes (peran murid, terpasang di /murid): tulis/baca/
//   sunting/hapus entri MILIK SENDIRI. Kepemilikan diperiksa di server
//   pada setiap operasi (predikat journalEntryOwnedBy); entri orang
//   lain menjawab 404 yang sama dengan entri tidak ada — keberadaannya
//   tidak dibocorkan. Murid TIDAK punya jalur tulis apa pun atas
//   tanggapan guru maupun penanda ditinjau.
// - guruJurnalRoutes (peran guru, terpasang di /guru): membaca jurnal
//   murid dalam jangkauannya menurut aturan Pantau Hasil/Rekap
//   (penugasan guru → kelas sasaran → murid, plus sasaran langsung),
//   menandai entri yang dibuka sebagai sudah ditinjau, dan menyimpan
//   SATU tanggapan singkat per entri (bimbingan satu arah — bukan
//   diskusi, tanpa nilai). Itulah satu-satunya jalur tulis sisi guru.

const { assignmentClasses, assignmentStudents, assignments, classes, classMembers, journalEntries, modules, users } = schema;

type JournalEntryRow = typeof journalEntries.$inferSelect;

function serializeEntry(row: JournalEntryRow, moduleTitle: string | null, responderNames: ReadonlyMap<number, string>) {
  const mood = journalMoodByKey(row.mood);
  return {
    id: row.id,
    entry_date: row.entryDate,
    body: row.body,
    prompt_key: row.promptKey,
    prompt_text: journalPromptText(row.promptKey),
    mood: row.mood,
    mood_label: mood?.label ?? null,
    mood_emoji: mood?.emoji ?? null,
    linked_module_id: row.linkedModuleId,
    linked_module_title: moduleTitle,
    teacher_response: row.teacherResponse,
    teacher_response_at: row.teacherResponseAt,
    teacher_responded_by: row.teacherRespondedBy,
    teacher_responded_by_name: row.teacherRespondedBy !== null ? responderNames.get(row.teacherRespondedBy) ?? null : null,
    reviewed_at: row.reviewedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function loadEntryWithModuleTitle(entryId: number) {
  const [row] = await db
    .select({ entry: journalEntries, moduleTitle: modules.title })
    .from(journalEntries)
    .leftJoin(modules, eq(modules.id, journalEntries.linkedModuleId))
    .where(eq(journalEntries.id, entryId))
    .limit(1);
  return row;
}

/** Nama guru penanggap untuk sekumpulan baris entri (peta id → nama; kosong bila tak ada tanggapan). */
async function loadResponderNames(rows: readonly JournalEntryRow[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((row) => row.teacherRespondedBy).filter((id): id is number => id !== null))];
  const names = new Map<number, string>();
  if (ids.length) {
    const userRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
    for (const userRow of userRows) names.set(userRow.id, userRow.name);
  }
  return names;
}

/** Satu entri terserialisasi penuh (judul materi + nama penanggap); undefined bila tidak ada. */
async function loadSerializedEntry(entryId: number) {
  const row = await loadEntryWithModuleTitle(entryId);
  if (!row) return undefined;
  const names = await loadResponderNames([row.entry]);
  return serializeEntry(row.entry, row.moduleTitle, names);
}

function parseListWindow(c: { req: { query: (key: string) => string | undefined } }, defaultLimit: number, maxLimit: number) {
  const rawLimit = Number(c.req.query("limit"));
  const rawOffset = Number(c.req.query("offset"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Sisi murid
// ---------------------------------------------------------------------------

export const muridJurnalRoutes = new Hono();
muridJurnalRoutes.use("*", requireRole("murid"));

muridJurnalRoutes.get("/jurnal", async (c) => {
  const user = c.get("user")!;
  const { limit, offset } = parseListWindow(c, 50, 100);
  const [rows, countRows] = await Promise.all([
    db
      .select({ entry: journalEntries, moduleTitle: modules.title })
      .from(journalEntries)
      .leftJoin(modules, eq(modules.id, journalEntries.linkedModuleId))
      .where(eq(journalEntries.studentId, user.userId))
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt), desc(journalEntries.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: sql<number>`count(*)` }).from(journalEntries).where(eq(journalEntries.studentId, user.userId)),
  ]);
  const names = await loadResponderNames(rows.map((row) => row.entry));
  return c.json({
    ok: true,
    data: {
      entries: rows.map((row) => serializeEntry(row.entry, row.moduleTitle, names)),
      total: Number(countRows[0]?.value ?? 0),
      prompts: JOURNAL_PROMPTS,
      moods: JOURNAL_MOODS,
    },
  });
});

muridJurnalRoutes.post("/jurnal", async (c) => {
  const user = c.get("user")!;
  let input: { body?: unknown; prompt_key?: unknown; mood?: unknown; linked_module_id?: unknown };
  try { input = await c.req.json(); } catch { return c.json({ ok: false, message: "Isi entri harus berupa JSON yang valid." }, 400); }
  const validated = validateJournalCreate(input);
  if ("error" in validated) return c.json({ ok: false, message: validated.error }, 400);
  const { draft } = validated;
  // Kaitan materi hanya boleh ke modul yang memang terlihat oleh murid
  // ini (aturan keterlihatan berbasis penugasan) — id modul asing atau
  // milik rangkaian lain ditolak dengan pesan ramah yang sama.
  if (draft.linkedModuleId !== null && !(await studentCanAccessModule(user.userId, draft.linkedModuleId))) {
    return c.json({ ok: false, message: "Materi yang dikaitkan tidak tersedia untukmu." }, 400);
  }
  const [created] = await db
    .insert(journalEntries)
    .values({
      studentId: user.userId,
      entryDate: todayWib(new Date()),
      body: draft.body,
      promptKey: draft.promptKey,
      mood: draft.mood,
      linkedModuleId: draft.linkedModuleId,
    })
    .$returningId();
  const data = created ? await loadSerializedEntry(created.id) : undefined;
  if (!data) return c.json({ ok: false, message: "Entri jurnal gagal disimpan." }, 500);
  return c.json({ ok: true, data }, 201);
});

muridJurnalRoutes.patch("/jurnal/:id", async (c) => {
  const user = c.get("user")!;
  const entryId = Number(c.req.param("id"));
  if (!Number.isInteger(entryId) || entryId <= 0) return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  const existing = await loadEntryWithModuleTitle(entryId);
  if (!existing || !journalEntryOwnedBy(existing.entry.studentId, user.userId)) {
    return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  }
  let input: { body?: unknown; prompt_key?: unknown; mood?: unknown; linked_module_id?: unknown };
  try { input = await c.req.json(); } catch { return c.json({ ok: false, message: "Isi entri harus berupa JSON yang valid." }, 400); }
  const validated = validateJournalPatch(input);
  if ("error" in validated) return c.json({ ok: false, message: validated.error }, 400);
  const { patch } = validated;
  if (patch.linkedModuleId !== undefined && patch.linkedModuleId !== null && !(await studentCanAccessModule(user.userId, patch.linkedModuleId))) {
    return c.json({ ok: false, message: "Materi yang dikaitkan tidak tersedia untukmu." }, 400);
  }
  const updates: Partial<JournalEntryRow> = {};
  if (patch.body !== undefined) updates.body = patch.body;
  if (patch.promptKey !== undefined) updates.promptKey = patch.promptKey;
  if (patch.mood !== undefined) updates.mood = patch.mood;
  if (patch.linkedModuleId !== undefined) updates.linkedModuleId = patch.linkedModuleId;
  await db.update(journalEntries).set(updates).where(eq(journalEntries.id, entryId));
  const data = await loadSerializedEntry(entryId);
  if (!data) return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  return c.json({ ok: true, data });
});

muridJurnalRoutes.delete("/jurnal/:id", async (c) => {
  const user = c.get("user")!;
  const entryId = Number(c.req.param("id"));
  if (!Number.isInteger(entryId) || entryId <= 0) return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  const existing = await loadEntryWithModuleTitle(entryId);
  if (!existing || !journalEntryOwnedBy(existing.entry.studentId, user.userId)) {
    return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  }
  await db.delete(journalEntries).where(eq(journalEntries.id, entryId));
  return c.json({ ok: true, data: { id: entryId } });
});

// ---------------------------------------------------------------------------
// Sisi guru (baca + tanggapan singkat + penanda ditinjau)
// ---------------------------------------------------------------------------

export const guruJurnalRoutes = new Hono();
guruJurnalRoutes.use("*", requireRole("guru"));

/**
 * Jangkauan jurnal seorang guru — aturan Pantau Hasil/Rekap persis
 * (routes/reports.ts getTargetStudents): kelas sasaran dari penugasan
 * milik guru (kelas tidak terarsip) beserta anggotanya, ditambah murid
 * sasaran langsung yang kelas tampilnya diatasi aturan
 * lib/student-class.ts dari penugasan pertamanya. Tidak ada relasi
 * guru–murid baru yang diciptakan di sini.
 */
async function loadTeacherJournalScope(teacherId: number) {
  const classRows = await db
    .selectDistinct({ id: classes.id, name: classes.name })
    .from(assignmentClasses)
    .innerJoin(assignments, eq(assignments.id, assignmentClasses.assignmentId))
    .innerJoin(classes, eq(classes.id, assignmentClasses.classId))
    .where(and(eq(assignments.teacherId, teacherId), eq(classes.isArchived, false)));
  const classIds = classRows.map((row) => row.id);
  const memberRows: TeacherJournalMemberInput[] = classIds.length
    ? await db
        .select({ classId: classMembers.classId, studentId: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.studentId))
        .where(and(inArray(classMembers.classId, classIds), eq(users.role, "murid")))
    : [];
  const directRows = await db
    .select({ studentId: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug, assignmentId: assignments.id, moduleId: assignments.moduleId, worksheetId: assignments.worksheetId })
    .from(assignmentStudents)
    .innerJoin(assignments, eq(assignments.id, assignmentStudents.assignmentId))
    .innerJoin(users, eq(users.id, assignmentStudents.studentId))
    .where(eq(assignments.teacherId, teacherId))
    .orderBy(asc(assignments.id));
  const firstByStudent = new Map<number, (typeof directRows)[number]>();
  for (const row of directRows) if (!firstByStudent.has(row.studentId)) firstByStudent.set(row.studentId, row);
  const membershipsByStudent = await loadTeacherClassMemberships(teacherId);
  const directStudents: TeacherJournalDirectInput[] = await Promise.all(
    [...firstByStudent.values()].map(async (row) => {
      const subject = await loadAssignmentSubject({ moduleId: row.moduleId, worksheetId: row.worksheetId });
      const resolved = resolveStudentClass(membershipsByStudent.get(row.studentId) ?? [], subject);
      return { studentId: row.studentId, name: row.name, username: row.username, avatarSlug: row.avatarSlug, classId: resolved?.id ?? 0, className: resolved?.name ?? "" };
    }),
  );
  return { classes: classRows, members: memberRows, directStudents };
}

guruJurnalRoutes.get("/jurnal", async (c) => {
  const user = c.get("user")!;
  const scope = await loadTeacherJournalScope(user.userId);
  const visibleIds = collectVisibleStudentIds(scope.members, scope.directStudents);
  const statRows = visibleIds.length
    ? await db
        .select({ studentId: journalEntries.studentId, entryDate: journalEntries.entryDate, createdAt: journalEntries.createdAt, reviewedAt: journalEntries.reviewedAt })
        .from(journalEntries)
        .where(inArray(journalEntries.studentId, visibleIds))
    : [];
  const overview = planTeacherJournalOverview({
    classes: scope.classes,
    members: scope.members,
    directStudents: scope.directStudents,
    stats: reduceJournalStats(statRows),
  });
  return c.json({ ok: true, data: { classes: overview, unreviewed_total: countUnreviewedEntries(statRows) } });
});

guruJurnalRoutes.get("/jurnal/entries", async (c) => {
  const user = c.get("user")!;
  const studentId = Number(c.req.query("studentId"));
  if (!Number.isInteger(studentId) || studentId <= 0) return c.json({ ok: false, message: "studentId wajib berupa ID positif." }, 400);
  const scope = await loadTeacherJournalScope(user.userId);
  const visibleIds = collectVisibleStudentIds(scope.members, scope.directStudents);
  if (!visibleIds.includes(studentId)) {
    return c.json({ ok: false, message: "Murid ini tidak berada dalam jangkauan penugasan Anda." }, 403);
  }
  const [studentRow] = await db.select({ id: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug }).from(users).where(eq(users.id, studentId)).limit(1);
  if (!studentRow) return c.json({ ok: false, message: "Murid tidak ditemukan." }, 404);
  const student = { id: studentRow.id, name: studentRow.name, username: studentRow.username, ...avatarBadgeFields(studentRow.avatarSlug) };
  const { limit, offset } = parseListWindow(c, 100, 200);
  const [rows, countRows] = await Promise.all([
    db
      .select({ entry: journalEntries, moduleTitle: modules.title })
      .from(journalEntries)
      .leftJoin(modules, eq(modules.id, journalEntries.linkedModuleId))
      .where(eq(journalEntries.studentId, studentId))
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt), desc(journalEntries.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: sql<number>`count(*)` }).from(journalEntries).where(eq(journalEntries.studentId, studentId)),
  ]);
  // Membuka detail jurnal murid ini MENANDAI entri yang dikembalikan
  // permintaan ini sebagai sudah ditinjau (hanya yang reviewed_at-nya
  // masih NULL; idempoten — membuka lagi tidak mengubah cap waktunya).
  const now = new Date();
  const unreviewedIds = collectUnreviewedEntryIds(rows.map((row) => row.entry));
  if (unreviewedIds.length) {
    await db
      .update(journalEntries)
      .set({ reviewedAt: now })
      .where(and(inArray(journalEntries.id, unreviewedIds), isNull(journalEntries.reviewedAt)));
  }
  const justReviewed = new Set(unreviewedIds);
  const names = await loadResponderNames(rows.map((row) => row.entry));
  return c.json({
    ok: true,
    data: {
      student,
      entries: rows.map((row) =>
        serializeEntry(justReviewed.has(row.entry.id) ? { ...row.entry, reviewedAt: now } : row.entry, row.moduleTitle, names),
      ),
      total: Number(countRows[0]?.value ?? 0),
    },
  });
});

// Satu-satunya jalur tulis sisi guru: menyimpan (atau mengosongkan)
// tanggapan untuk SATU entri. Hanya guru yang boleh melihat murid
// pemilik entri yang dapat menanggapinya; entri di luar jangkauan —
// sama seperti entri yang tidak ada — menjawab 404. Menyimpan
// tanggapan juga menandai entri sudah ditinjau.
guruJurnalRoutes.put("/jurnal/entries/:id/tanggapan", async (c) => {
  const user = c.get("user")!;
  const entryId = Number(c.req.param("id"));
  if (!Number.isInteger(entryId) || entryId <= 0) return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  let input: { response?: unknown };
  try { input = await c.req.json(); } catch { return c.json({ ok: false, message: "Isi tanggapan harus berupa JSON yang valid." }, 400); }
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1);
  if (!entry) return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  const scope = await loadTeacherJournalScope(user.userId);
  const visibleIds = collectVisibleStudentIds(scope.members, scope.directStudents);
  if (!visibleIds.includes(entry.studentId)) {
    return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  }
  const validated = validateJournalResponse(input);
  if ("error" in validated) return c.json({ ok: false, message: validated.error }, 400);
  const now = new Date();
  await db
    .update(journalEntries)
    .set({
      teacherResponse: validated.response,
      teacherResponseAt: validated.response === null ? null : now,
      teacherRespondedBy: validated.response === null ? null : user.userId,
      reviewedAt: entry.reviewedAt ?? now,
    })
    .where(eq(journalEntries.id, entryId));
  const data = await loadSerializedEntry(entryId);
  if (!data) return c.json({ ok: false, message: "Entri jurnal tidak ditemukan." }, 404);
  return c.json({ ok: true, data });
});
