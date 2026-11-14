import { randomUUID } from "node:crypto";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { and, eq, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@simak/db";
import { presignInteraktifUploadSchema, presignUploadSchema, presignWorksheetUploadSchema } from "@simak/shared";
import { env } from "../lib/env";
import { INTERAKTIF_CSP_HEADER, INTERAKTIF_KEY_PREFIX, isInteraktifKey, looksLikeHtmlHead } from "../lib/interaktif";
import { isLibraryApprover } from "../lib/library";
import { requireAuth, requireRole } from "../middleware/auth";

const MAX_PRESIGN_SECONDS = 10 * 60;
const DOWNLOAD_PRESIGN_SECONDS = 5 * 60;
const extensionByType = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
} as const;

const { classes, classMembers, moduleBlocks, modules, worksheetAnswers, worksheetAttempts, worksheets } = schema;

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

// Presign unggah foto jawaban LKPD. Murid hanya boleh mengunggah ke LKPD
// terbit milik guru kelasnya; guru hanya ke LKPD miliknya sendiri.
uploadRoutes.post(
  "/presign-worksheet",
  requireAuth,
  zValidator("json", presignWorksheetUploadSchema),
  async (c) => {
    const user = c.get("user")!;
    const input = c.req.valid("json");
    const [worksheet] = await db
      .select({ id: worksheets.id, teacherId: worksheets.teacherId, status: worksheets.status })
      .from(worksheets)
      .where(eq(worksheets.id, input.worksheetId))
      .limit(1);
    if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

    if (user.role === "guru") {
      if (worksheet.teacherId !== user.userId) {
        return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);
      }
    } else {
      if (worksheet.status !== "terbit") {
        return c.json({ ok: false, message: "LKPD belum tersedia." }, 404);
      }
      const [access] = await db
        .select({ id: classMembers.id })
        .from(classMembers)
        .innerJoin(classes, eq(classes.id, classMembers.classId))
        .where(
          and(
            eq(classMembers.studentId, user.userId),
            eq(classes.isArchived, false),
            eq(classes.teacherId, worksheet.teacherId),
          ),
        )
        .limit(1);
      if (!access) return c.json({ ok: false, message: "LKPD belum tersedia untuk Anda." }, 403);
    }

    const key = `lkpd/${user.userId}/${input.worksheetId}/${randomUUID()}${extensionByType[input.contentType]}`;
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

// Presign unggah berkas HTML mandiri untuk blok Media Interaktif.
// Berbeda dari presign lampiran: hanya .html/.htm bertipe text/html,
// batas 25 MB, dan kuncinya hidup di bawah awalan khusus "interaktif/"
// agar route penyajiannya bisa mengurungnya (lihat lib/interaktif).
uploadRoutes.post(
  "/presign-interaktif",
  requireRole("guru"),
  zValidator("json", presignInteraktifUploadSchema),
  async (c) => {
    const user = c.get("user")!;
    const input = c.req.valid("json");
    const [module] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, input.moduleId), eq(modules.teacherId, user.userId)))
      .limit(1);
    if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);

    const extension = /\.htm$/i.test(input.filename) ? ".htm" : ".html";
    const key = `${INTERAKTIF_KEY_PREFIX}${user.userId}/${input.moduleId}/${randomUUID()}${extension}`;
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

// Unduh foto jawaban murid — hanya guru pemilik LKPD, dan key harus benar-benar
// dipakai oleh sebuah jawaban pada attempt LKPD tersebut.
uploadRoutes.get("/download-answer", requireRole("guru"), async (c) => {
  const user = c.get("user")!;
  const key = c.req.query("key");
  const worksheetId = Number(c.req.query("worksheetId"));
  if (!key || !Number.isInteger(worksheetId) || worksheetId <= 0) {
    return c.json({ ok: false, message: "Lampiran tidak valid." }, 400);
  }

  const [worksheet] = await db
    .select({ id: worksheets.id })
    .from(worksheets)
    .where(and(eq(worksheets.id, worksheetId), eq(worksheets.teacherId, user.userId)))
    .limit(1);
  if (!worksheet) return c.json({ ok: false, message: "LKPD tidak ditemukan." }, 404);

  const [answer] = await db
    .select({ id: worksheetAnswers.id })
    .from(worksheetAnswers)
    .innerJoin(worksheetAttempts, eq(worksheetAttempts.id, worksheetAnswers.attemptId))
    .where(and(eq(worksheetAnswers.attachmentKey, key), eq(worksheetAttempts.worksheetId, worksheetId)))
    .limit(1);
  if (!answer) return c.json({ ok: false, message: "Foto jawaban tidak ditemukan." }, 404);

  const command = new GetObjectCommand({ Bucket: env.RUSTFS_BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(storage, command, { expiresIn: DOWNLOAD_PRESIGN_SECONDS });
  return c.json({ ok: true, data: { download_url: downloadUrl, expires_in: DOWNLOAD_PRESIGN_SECONDS } });
});

// Penyajian berkas HTML Media Interaktif (mode unggah). HTML unggahan
// adalah JavaScript arbitrer, jadi route ini adalah satu-satunya pintu
// keluarnya dan ia membalas dengan pengurungan penuh:
// Content-Security-Policy: sandbox allow-scripts membuat dokumennya
// ber-asal buram (tidak bisa menyentuh cookie, DOM, atau penyimpanan
// asal SIMAK), X-Content-Type-Options: nosniff mengunci tipenya, dan
// web merangkainya dengan iframe sandbox="allow-scripts" pula.
// Syarat sajian sama ketatnya dengan /download — sesi sah, akses ke
// modulnya sah — DITAMBAH: kunci harus di bawah awalan interaktif/ dan
// benar-benar dirujuk sebuah blok interaktif modul itu, dan kepala
// berkasnya harus lolos pemeriksaan HTML ringan (lib/interaktif).
uploadRoutes.get("/interaktif", requireAuth, async (c) => {
  const user = c.get("user")!;
  const key = c.req.query("key");
  const moduleId = Number(c.req.query("moduleId"));
  if (!key || !Number.isInteger(moduleId) || moduleId <= 0) {
    return c.json({ ok: false, message: "Media interaktif tidak valid." }, 400);
  }
  if (!isInteraktifKey(key)) {
    return c.json({ ok: false, message: "Media interaktif tidak ditemukan." }, 404);
  }

  const [module] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!module) return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
  if (user.role === "murid") {
    if (module.status !== "terbit") return c.json({ ok: false, message: "Media interaktif tidak tersedia." }, 404);
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
    if (!access) return c.json({ ok: false, message: "Media interaktif belum tersedia untuk Anda." }, 403);
  } else if (user.role === "guru" && module.teacherId !== user.userId && !module.isShared) {
    const approverPreview = module.shareStatus === "menunggu" && isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER);
    if (!approverPreview) {
      return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
    }
  }

  const blocks = await db
    .select({ type: moduleBlocks.type, attachmentKey: moduleBlocks.attachmentKey, contentJson: moduleBlocks.contentJson })
    .from(moduleBlocks)
    .where(eq(moduleBlocks.moduleId, moduleId));
  const referenced = blocks.some((block) => {
    if (block.attachmentKey === key) return block.type === "interaktif";
    if (block.type !== "interaktif" || block.contentJson === null) return false;
    const content = block.contentJson as Record<string, unknown>;
    return content.source === "unggah" && content.fileKey === key;
  });
  if (!referenced) return c.json({ ok: false, message: "Media interaktif tidak ditemukan." }, 404);

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const object = await internalStorage.send(new GetObjectCommand({ Bucket: env.RUSTFS_BUCKET, Key: key }));
    if (!object.Body) return c.json({ ok: false, message: "Media interaktif tidak ditemukan." }, 404);
    const fetched = await object.Body.transformToByteArray();
    // Salin ke larik berpenyangga ArrayBuffer tegas agar tipe badan
    // respons Hono terpenuhi apa adanya.
    bytes = new Uint8Array(fetched.byteLength);
    bytes.set(fetched);
  } catch {
    return c.json({ ok: false, message: "Media interaktif tidak ditemukan." }, 404);
  }
  if (!looksLikeHtmlHead(bytes)) {
    return c.json({ ok: false, message: "Berkas media interaktif bukan HTML yang sah." }, 415);
  }

  return c.body(bytes, 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": INTERAKTIF_CSP_HEADER,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
});

uploadRoutes.get("/download", requireAuth, async (c) => {
  const user = c.get("user")!;
  const key = c.req.query("key");
  const moduleId = Number(c.req.query("moduleId"));
  if (!key || !Number.isInteger(moduleId) || moduleId <= 0) {
    return c.json({ ok: false, message: "Lampiran tidak valid." }, 400);
  }

  // Berkas HTML Media Interaktif TIDAK pernah keluar lewat unduhan
  // bertanda tangan penyimpanan: satu-satunya jalannya adalah route
  // /uploads/interaktif yang membalas dengan CSP sandbox. Tanpa
  // penjaga ini, kunci interaktif yang sah dirujuk blok akan lolos
  // pemeriksaan rujukan di bawah dan tersaji mentah dari asal
  // penyimpanan tanpa kurungan apa pun.
  if (isInteraktifKey(key)) {
    return c.json({ ok: false, message: "Lampiran tidak ditemukan." }, 404);
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
  } else if (user.role === "guru" && module.teacherId !== user.userId && !module.isShared) {
    // Guru lain hanya boleh mengambil lampiran modul yang sedang DIBAGIKAN
    // ke Perpustakaan Bersama (untuk pratinjau katalog); modul privat guru
    // lain tetap tertutup persis seperti sebelumnya. Satu-satunya perluasan:
    // PENYETUJU Perpustakaan Bersama boleh mengambil lampiran modul yang
    // sedang MENUNGGU persetujuannya, agar pengajuan dapat dipratinjau
    // utuh dari antrean sebelum diputuskan.
    const approverPreview = module.shareStatus === "menunggu" && isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER);
    if (!approverPreview) {
      return c.json({ ok: false, message: "Modul tidak ditemukan." }, 404);
    }
  }

  // Key sah bila salah satu dari: sampul modul ini, lampiran sebuah blok
  // modul ini (kolom attachment_key), atau kunci gambar sisipan yang
  // tertanam sebagai data-attachment-key di dalam isi HTML blok modul ini.
  // Di luar itu key ditolak — otorisasi tidak dilonggarkan ke modul lain.
  const keyIsCover = module.coverKey !== null && module.coverKey === key;
  let keyAllowed = keyIsCover;
  if (!keyAllowed) {
    const blocks = await db
      .select({ attachmentKey: moduleBlocks.attachmentKey, contentJson: moduleBlocks.contentJson })
      .from(moduleBlocks)
      .where(eq(moduleBlocks.moduleId, moduleId));
    keyAllowed = blocks.some(
      (block) =>
        block.attachmentKey === key
        || (block.contentJson !== null && JSON.stringify(block.contentJson).includes(key)),
    );
  }
  if (!keyAllowed) return c.json({ ok: false, message: "Lampiran tidak ditemukan." }, 404);

  const command = new GetObjectCommand({ Bucket: env.RUSTFS_BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(storage, command, { expiresIn: DOWNLOAD_PRESIGN_SECONDS });
  return c.json({ ok: true, data: { download_url: downloadUrl, expires_in: DOWNLOAD_PRESIGN_SECONDS } });
});
