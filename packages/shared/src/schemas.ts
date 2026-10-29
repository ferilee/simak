import { z } from "zod";
import { ACTIVITY_EVENTS, CONTENT_STATUS, INTEGRITY_EVENTS, MODULE_BLOCK_TYPES, ROLES, WORKSHEET_ITEM_TYPES } from "./block-types";

// ---------- Autentikasi ----------
// Kata sandi hanya diteruskan untuk diverifikasi ke sumber akun RUAS.
// SIMAK tidak pernah menyimpannya (lihat blueprint Bagian 05).
export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

// ---------- Konten blok modul (disimpan di module_blocks.content_json) ----------
// MariaDB tidak menegakkan skema JSON, jadi validasi Zod di API adalah satu-satunya penjaga.

export const moduleBlockContentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("teks"),
    html: z.string().max(100_000),
  }),
  z.object({
    type: z.literal("gambar"),
    attachmentKey: z.string().min(1),
    caption: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("video"),
    youtubeUrl: z.string().url(),
    caption: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("berkas"),
    attachmentKey: z.string().min(1),
    label: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("sub_bab"),
    title: z.string().min(1).max(200),
  }),
]);
export type ModuleBlockContent = z.infer<typeof moduleBlockContentSchema>;

// ---------- Opsi butir LKPD (disimpan di worksheet_items.options_json) ----------

export const worksheetItemOptionsSchema = z.discriminatedUnion("itemType", [
  z.object({
    itemType: z.literal("isian_singkat"),
    // Toleransi angka untuk penilaian otomatis, mis. 0.01 untuk dua desimal.
    tolerance: z.number().min(0).default(0),
    caseSensitive: z.boolean().default(false),
    unit: z.string().max(20).optional(),
  }),
  z.object({
    itemType: z.literal("pilihan_ganda"),
    options: z.array(z.string().min(1).max(500)).min(2).max(6),
  }),
  z.object({
    itemType: z.literal("uraian"),
    placeholder: z.string().max(200).optional(),
  }),
  z.object({
    itemType: z.literal("unggah_foto"),
    maxFiles: z.number().int().min(1).max(5).default(1),
    instruction: z.string().max(500).optional(),
  }),
  z.object({
    itemType: z.literal("langkah_berurutan"),
    // Langkah dalam urutan acak untuk ditampilkan; urutan benar ada di answer_key.
    steps: z.array(z.string().min(1).max(300)).min(2).max(10),
  }),
  z.object({
    itemType: z.literal("refleksi"),
  }),
  z.object({
    itemType: z.literal("tautan_ruas"),
    url: z.string().url(),
    label: z.string().min(1).max(100).default("Buka Kuis di RUAS"),
  }),
]);
export type WorksheetItemOptions = z.infer<typeof worksheetItemOptionsSchema>;

// ---------- Exit ticket 3-2-1 ----------

export const exitTicketSchema = z.object({
  understood3: z.string().min(1).max(2000),
  examples2: z.string().min(1).max(2000),
  confusing1: z.string().min(1).max(2000),
});
export type ExitTicketInput = z.infer<typeof exitTicketSchema>;

// ---------- Aktivitas / presensi ----------

// Peristiwa berbasis penugasan wajib membawa assignmentId; peristiwa
// tuntas membaca berbasis modul membawa moduleId sebagai gantinya.
export const activitySchema = z
  .object({
    assignmentId: z.number().int().positive().optional(),
    moduleId: z.number().int().positive().optional(),
    event: z.enum(ACTIVITY_EVENTS),
  })
  .superRefine((value, ctx) => {
    if (value.event === "baca_materi_tuntas") {
      if (value.moduleId === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moduleId"], message: "moduleId wajib untuk peristiwa baca_materi_tuntas." });
      }
    } else if (value.assignmentId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["assignmentId"], message: "assignmentId wajib untuk peristiwa berbasis penugasan." });
    }
  });

export const integrityEventSchema = z.object({
  assignmentId: z.number().int().positive(),
  event: z.enum(INTEGRITY_EVENTS),
});

// ---------- Kelas ----------

export const createClassSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  academicYear: z.string().min(4).max(20),
});

export const roleSchema = z.enum(ROLES);

// ---------- Modul materi ----------

export const createModuleSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
});

export const updateModuleSchema = createModuleSchema.partial().extend({
  status: z.enum(CONTENT_STATUS).optional(),
});

export const createModuleBlockSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  content: moduleBlockContentSchema,
  attachmentKey: z.string().max(512).optional(),
});

// Ubah blok memakai bentuk yang sama dengan buat blok (penggantian penuh);
// aturan "jenis blok tidak boleh berubah" ditegakkan di route dari blok tersimpan.
export const updateModuleBlockSchema = createModuleBlockSchema;

// Daftar LENGKAP id blok sebuah modul dalam urutan baru; kelengkapan dan
// kepemilikan himpunan id divalidasi di route terhadap isi modul.
export const reorderModuleBlocksSchema = z.object({
  blockIds: z.array(z.number().int().positive()).max(500),
});

export const joinClassSchema = z.object({
  joinCode: z.string().trim().min(1).max(12),
});

export const presignUploadSchema = z.object({
  moduleId: z.number().int().positive(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

// Presign unggah foto jawaban LKPD oleh murid — hanya berkas gambar.
export const presignWorksheetUploadSchema = z.object({
  worksheetId: z.number().int().positive(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

// ---------- LKPD ----------

export const createWorksheetSchema = z.object({
  moduleId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  instructions: z.string().max(5000).optional(),
});

export const updateWorksheetSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional(),
  status: z.enum(CONTENT_STATUS).optional(),
});

export const createWorksheetItemSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  itemType: z.enum(WORKSHEET_ITEM_TYPES),
  prompt: z.string().min(1).max(10_000),
  options: worksheetItemOptionsSchema.optional(),
  answerKey: z.string().max(10_000).optional(),
  explanation: z.string().max(10_000).optional(),
  points: z.number().int().min(0).max(1000).default(10),
});

// Ubah butir memakai bentuk yang sama dengan buat butir (penggantian penuh);
// aturan "jenis butir tidak boleh berubah" ditegakkan di route dari butir tersimpan.
export const updateWorksheetItemSchema = createWorksheetItemSchema;

// Daftar LENGKAP id butir sebuah LKPD dalam urutan baru; kelengkapan dan
// kepemilikan himpunan id divalidasi di route terhadap isi LKPD.
export const reorderWorksheetItemsSchema = z.object({
  itemIds: z.array(z.number().int().positive()).max(500),
});

export const worksheetAnswerSchema = z.object({
  itemId: z.number().int().positive(),
  answerText: z.string().max(20_000).optional(),
  attachmentKey: z.string().max(512).optional(),
});

export const worksheetAnswersSchema = z.object({
  answers: z.array(worksheetAnswerSchema).max(200),
});

export const gradeWorksheetSchema = z.object({
  teacherComment: z.string().max(5000).optional(),
  answers: z.array(z.object({
    itemId: z.number().int().positive(),
    score: z.number().min(0).max(1000),
    teacherNote: z.string().max(5000).optional(),
  })).max(200),
});

export const createAssignmentSchema = z.object({
  moduleId: z.number().int().positive().optional(),
  worksheetId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  instructions: z.string().max(5000).optional(),
  ruasQuizUrl: z.string().url().max(1024).optional(),
  opensAt: z.coerce.date(),
  dueAt: z.coerce.date(),
  classIds: z.array(z.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Kelas tujuan tidak boleh duplikat."),
}).refine((value) => value.moduleId !== undefined || value.worksheetId !== undefined, {
  message: "Penugasan harus terhubung ke modul atau LKPD.",
  path: ["moduleId"],
}).refine((value) => value.dueAt >= value.opensAt, {
  message: "Batas pengumpulan harus setelah waktu buka.",
  path: ["dueAt"],
});

export const updateAssignmentSchema = z.object({
  moduleId: z.number().int().positive().optional(),
  worksheetId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional(),
  ruasQuizUrl: z.string().url().max(1024).optional(),
  opensAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  status: z.enum(["draf", "terbit", "ditutup"]).optional(),
  classIds: z.array(z.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Kelas tujuan tidak boleh duplikat.").optional(),
}).superRefine((value, context) => {
  if (value.opensAt && value.dueAt && value.dueAt < value.opensAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Batas pengumpulan harus setelah waktu buka.", path: ["dueAt"] });
  }
});

export const moduleBlockTypeSchema = z.enum(MODULE_BLOCK_TYPES);
