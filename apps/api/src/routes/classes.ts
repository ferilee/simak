import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { joinClassSchema } from "@simak/shared";
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
classRoutes.post("/", requireRole("guru"), (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
classRoutes.patch("/:id", requireRole("guru"), (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
classRoutes.get("/:id/members", requireRole("guru"), (c) => c.json({ ok: true, data: [] }));
classRoutes.post("/:id/members", requireRole("guru"), (c) => c.json({ ok: false, message: "Tahap 0." }, 501));
