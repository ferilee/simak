import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { asc, eq, and, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { createClassSchema, joinClassSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";
import { avatarBadgeFields } from "../lib/avatar";
import { planClassPatch } from "../lib/edit-kelas";

// CRUD kelas/rombel + anggota dari username/NIS yang dicocokkan ke akun RUAS.
export const classRoutes = new Hono();

const { classes, classMembers, users } = schema;

classRoutes.post("/join", requireRole("murid"), zValidator("json", joinClassSchema), async (c) => {
  const user = c.get("user")!;
  const { joinCode } = c.req.valid("json");
  const [kelas] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.joinCode, joinCode), eq(classes.isArchived, false)))
    .limit(1);

  if (!kelas) return c.json({ ok: false, message: "Kode kelas tidak ditemukan atau sudah diarsipkan." }, 404);

  const [existing] = await db
    .select({ id: classMembers.id })
    .from(classMembers)
    .where(and(eq(classMembers.classId, kelas.id), eq(classMembers.studentId, user.userId)))
    .limit(1);

  if (!existing) {
    await db.insert(classMembers).values({ classId: kelas.id, studentId: user.userId });
  }

  return c.json({
    ok: true,
    data: {
      id: kelas.id,
      name: kelas.name,
      subject: kelas.subject,
      academic_year: kelas.academicYear,
      joined: !existing,
    },
  });
});

classRoutes.get("/", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const rows = await db.select().from(classes).where(eq(classes.teacherId, user.userId));
  // Daftar anggota per kelas ikut dikirim: pemilih murid sasaran pada form
  // penugasan "siswa tertentu" mengelompokkan murid berdasarkan kelasnya
  // dari data ini (hanya kelas milik guru yang meminta).
  const memberRows = rows.length
    ? await db
        .select({ classId: classMembers.classId, id: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.studentId))
        .where(inArray(classMembers.classId, rows.map((kelas) => kelas.id)))
        .orderBy(asc(users.name))
    : [];
  const membersByClass = new Map<number, { id: number; name: string; username: string; avatar_slug: string | null; avatar_emoji: string | null }[]>();
  for (const row of memberRows) {
    const current = membersByClass.get(row.classId) ?? [];
    current.push({ id: row.id, name: row.name, username: row.username, ...avatarBadgeFields(row.avatarSlug) });
    membersByClass.set(row.classId, current);
  }
  return c.json({
    ok: true,
    data: rows.map((kelas) => ({
      id: kelas.id,
      name: kelas.name,
      subject: kelas.subject,
      academic_year: kelas.academicYear,
      join_code: kelas.joinCode,
      is_archived: kelas.isArchived,
      members: membersByClass.get(kelas.id) ?? [],
    })),
  });
});

function createJoinCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

type ClassRow = typeof classes.$inferSelect;

// Bentuk balikan satu kelas yang sama dengan item GET / (termasuk anggota),
// dipakai PATCH dan regenerate-code agar klien dapat mengganti baris
// lokalnya utuh tanpa kehilangan daftar anggota.
async function singleClassPayload(kelas: ClassRow) {
  const memberRows = await db
    .select({ id: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.studentId))
    .where(eq(classMembers.classId, kelas.id))
    .orderBy(asc(users.name));
  return {
    id: kelas.id,
    name: kelas.name,
    subject: kelas.subject,
    academic_year: kelas.academicYear,
    join_code: kelas.joinCode,
    is_archived: kelas.isArchived,
    members: memberRows.map((row) => ({ id: row.id, name: row.name, username: row.username, ...avatarBadgeFields(row.avatarSlug) })),
  };
}

async function findOwnedClass(classId: number, teacherId: number) {
  const [kelas] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherId, teacherId)))
    .limit(1);
  return kelas;
}

classRoutes.post("/", requireRole("guru"), zValidator("json", createClassSchema), async (c) => {
  const user = c.get("user")!;
  const input = c.req.valid("json");
  let created: { id: number } | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      const [row] = await db.insert(classes).values({ ...input, teacherId: user.userId, joinCode: createJoinCode() }).$returningId();
      created = row;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  const [kelas] = await db.select().from(classes).where(and(eq(classes.id, created!.id), eq(classes.teacherId, user.userId))).limit(1);
  return c.json({
    ok: true,
    data: {
      id: kelas!.id,
      name: kelas!.name,
      subject: kelas!.subject,
      academic_year: kelas!.academicYear,
      join_code: kelas!.joinCode,
      is_archived: kelas!.isArchived,
      members: [],
    },
  }, 201);
});

classRoutes.patch("/:id", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const classId = Number(c.req.param("id"));
  if (!Number.isInteger(classId) || classId <= 0) return c.json({ ok: false, message: "ID kelas tidak valid." }, 400);
  const kelas = await findOwnedClass(classId, user.userId);
  if (!kelas) return c.json({ ok: false, message: "Kelas tidak ditemukan." }, 404);

  // Badan dibaca sebagai teks dulu: PATCH lama tidak mengirim badan sama
  // sekali dan maknanya "alihkan arsip" — rencana dari lib/edit-kelas
  // mempertahankan makna itu untuk badan kosong, dan menafsirkan bidang
  // eksplisit (label kelas / is_archived) sebagai penetapan nilai.
  const rawBody = await c.req.text().catch(() => "");
  let body: unknown = null;
  if (rawBody.trim() !== "") {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ ok: false, message: "Format data tidak valid." }, 400);
    }
  }
  const plan = planClassPatch(body);
  if (!plan.ok) return c.json({ ok: false, message: plan.message }, 400);

  const updates: Partial<{ name: string; subject: string; academicYear: string; isArchived: boolean }> = { ...plan.updates };
  if (plan.isArchived !== undefined) updates.isArchived = plan.isArchived;
  else if (plan.toggleArchived) updates.isArchived = !kelas.isArchived;
  if (Object.keys(updates).length > 0) {
    await db.update(classes).set(updates).where(eq(classes.id, classId));
  }
  const updated = await findOwnedClass(classId, user.userId);
  return c.json({ ok: true, data: await singleClassPayload(updated!) });
});

// Kode gabung baru untuk kelas milik guru pemanggil: kode lama langsung
// tidak berlaku karena kolomnya ditimpa. Kandidat memakai generator yang
// sama dengan pembuatan kelas dan diperiksa keunikannya (kolom unik);
// tabrakan/ balapan constraint dicoba ulang sampai 5 kali.
classRoutes.post("/:id/regenerate-code", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const classId = Number(c.req.param("id"));
  if (!Number.isInteger(classId) || classId <= 0) return c.json({ ok: false, message: "ID kelas tidak valid." }, 400);
  const kelas = await findOwnedClass(classId, user.userId);
  if (!kelas) return c.json({ ok: false, message: "Kelas tidak ditemukan." }, 404);

  let applied = false;
  for (let attempt = 0; attempt < 5 && !applied; attempt += 1) {
    const candidate = createJoinCode();
    if (candidate === kelas.joinCode) continue;
    const [clash] = await db.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, candidate)).limit(1);
    if (clash) continue;
    try {
      await db.update(classes).set({ joinCode: candidate }).where(eq(classes.id, classId));
      applied = true;
    } catch {
      // Constraint unik menang balapan — coba kandidat lain.
    }
  }
  if (!applied) return c.json({ ok: false, message: "Kode gabung baru belum dapat dibuat. Coba lagi." }, 500);
  const updated = await findOwnedClass(classId, user.userId);
  return c.json({ ok: true, data: await singleClassPayload(updated!) });
});
classRoutes.get("/:id/members", requireRole("guru"), (c) => c.json({ ok: true, data: [] }));
classRoutes.post("/:id/members", requireRole("guru"), (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
