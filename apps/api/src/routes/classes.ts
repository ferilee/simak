import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { createClassSchema, joinClassSchema } from "@simak/shared";
import { requireRole } from "../middleware/auth";

// CRUD kelas/rombel + anggota dari username/NIS yang dicocokkan ke akun RUAS.
export const classRoutes = new Hono();

const { classes, classMembers } = schema;

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
  return c.json({
    ok: true,
    data: rows.map((kelas) => ({
      id: kelas.id,
      name: kelas.name,
      subject: kelas.subject,
      academic_year: kelas.academicYear,
      join_code: kelas.joinCode,
      is_archived: kelas.isArchived,
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
