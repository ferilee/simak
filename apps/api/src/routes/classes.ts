import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { asc, eq, and, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { createClassSchema, joinClassSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

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
        .select({ classId: classMembers.classId, id: users.id, name: users.name, username: users.username })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.studentId))
        .where(inArray(classMembers.classId, rows.map((kelas) => kelas.id)))
        .orderBy(asc(users.name))
    : [];
  const membersByClass = new Map<number, { id: number; name: string; username: string }[]>();
  for (const row of memberRows) {
    const current = membersByClass.get(row.classId) ?? [];
    current.push({ id: row.id, name: row.name, username: row.username });
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
  const [kelas] = await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.teacherId, user.userId))).limit(1);
  if (!kelas) return c.json({ ok: false, message: "Kelas tidak ditemukan." }, 404);
  await db.update(classes).set({ isArchived: !kelas.isArchived }).where(eq(classes.id, classId));
  return c.json({ ok: true, data: { id: classId, is_archived: !kelas.isArchived } });
});
classRoutes.get("/:id/members", requireRole("guru"), (c) => c.json({ ok: true, data: [] }));
classRoutes.post("/:id/members", requireRole("guru"), (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
