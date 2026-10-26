import { randomUUID } from "node:crypto";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { and, eq, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { presignUploadSchema } from "@simak/shared";
import { env } from "../lib/env";
import { requireAuth, requireRole } from "../middleware/auth";

const MAX_PRESIGN_SECONDS = 10 * 60;
const DOWNLOAD_PRESIGN_SECONDS = 5 * 60;
const extensionByType = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
} as const;

const { classes, classMembers, moduleBlocks, modules } = schema;

// RustFS endpoint internal dipakai untuk koneksi layanan. URL presign memakai
// endpoint publik agar browser dapat mengunggah langsung tanpa kredensial.
const storageOptions = {
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.RUSTFS_ACCESS_KEY,
    secretAccessKey: env.RUSTFS_SECRET_KEY,
  },
};

const storage = new S3Client({
  endpoint: env.RUSTFS_PUBLIC_ENDPOINT ?? env.RUSTFS_ENDPOINT,
  ...storageOptions,
});
const internalStorage = new S3Client({ endpoint: env.RUSTFS_ENDPOINT, ...storageOptions });

export async function ensureStorageBucket() {
  try {
    await internalStorage.send(new HeadBucketCommand({ Bucket: env.RUSTFS_BUCKET }));
  } catch (error) {
    const status = error instanceof Object && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    if (status !== 404) throw error;
    await internalStorage.send(new CreateBucketCommand({ Bucket: env.RUSTFS_BUCKET }));
  }
}

export const uploadRoutes = new Hono();

uploadRoutes.post(
  "/presign",
  requireRole("guru"),
  zValidator("json", presignUploadSchema),
  async (c) => {
    const user = c.get("user")!;
    const input = c.req.valid("json");
    const [module] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, input.moduleId), eq(modules.teacherId, user.userId)))
      .limit(1);
    if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);

    const key = `materi/${user.userId}/${input.moduleId}/${randomUUID()}${extensionByType[input.contentType]}`;
    const command = new PutObjectCommand({
      Bucket: env.RUSTFS_BUCKET,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.size,
    });
    const uploadUrl = await getSignedUrl(storage, command, { expiresIn: MAX_PRESIGN_SECONDS });

    return c.json({
      ok: true,
      data: {
        upload_url: uploadUrl,
        attachment_key: key,
        expires_in: MAX_PRESIGN_SECONDS,
        content_type: input.contentType,
      },
    });
  },
);

uploadRoutes.get("/download", requireAuth, async (c) => {
  const user = c.get("user")!;
  const key = c.req.query("key");
  const moduleId = Number(c.req.query("moduleId"));
  if (!key || !Number.isInteger(moduleId) || moduleId <= 0) {
    return c.json({ ok: false, message: "Lampiran tidak valid." }, 400);
  }

  const [module] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  if (user.role === "murid") {
    if (module.status !== "terbit") return c.json({ ok: false, message: "Lampiran tidak tersedia." }, 404);
    const [access] = await db
      .select({ id: classMembers.id })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .where(
        and(
          eq(classMembers.studentId, user.userId),
          eq(classes.isArchived, false),
          or(eq(classes.teacherId, module.teacherId), eq(classes.subject, module.subject)),
        ),
      )
      .limit(1);
    if (!access) return c.json({ ok: false, message: "Lampiran belum tersedia untuk Anda." }, 403);
  } else if (user.role === "guru" && module.teacherId !== user.userId) {
    return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  }

  const [block] = await db
    .select({ id: moduleBlocks.id })
    .from(moduleBlocks)
    .where(and(eq(moduleBlocks.moduleId, moduleId), eq(moduleBlocks.attachmentKey, key)))
    .limit(1);
  if (!block) return c.json({ ok: false, message: "Lampiran tidak ditemukan." }, 404);

  const command = new GetObjectCommand({ Bucket: env.RUSTFS_BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(storage, command, { expiresIn: DOWNLOAD_PRESIGN_SECONDS });
  return c.json({ ok: true, data: { download_url: downloadUrl, expires_in: DOWNLOAD_PRESIGN_SECONDS } });
});
