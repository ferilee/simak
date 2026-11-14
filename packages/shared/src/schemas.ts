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
    // Sumber Markdown opsional: disimpan bersama HTML hasil konversinya agar
    // blok bisa dibuka kembali di mode Markdown editor guru tanpa konversi
    // balik yang hilang-hilang. Blok lama tanpa field ini tetap sah.
    markdown: z.string().max(100_000).optional(),
    format: z.literal("markdown").optional(),
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
  // Media Interaktif (H5P v1): konten interaktif dari luar SIMAK, dua
  // sumber — berkas HTML mandiri hasil ekspor Lumi yang diunggah guru
  // (source "unggah", fileKey menunjuk objek di penyimpanan di bawah
  // awalan interaktif/) atau tautan embed pemain H5P/Moodle milik guru
  // (source "embed"). title adalah keterangan yang tampil di bawah
  // bingkai, sejajar caption gambar/video. Syarat per sumber (unggah
  // wajib fileKey; embed wajib url https) ditegakkan superRefine pada
  // union di bawah, bukan pada anggota ini, agar bentuk infer union
  // tetap presisi bagi pemakai skema.
  z.object({
    type: z.literal("interaktif"),
    source: z.enum(["unggah", "embed"]),
    title: z.string().max(500).optional(),
    fileKey: z.string().min(1).max(512).optional(),
    fileName: z.string().min(1).max(255).optional(),
    url: z.string().url().optional(),
  }),
]).superRefine((value, ctx) => {
  if (value.type !== "interaktif") return;
  if (value.source === "unggah" && !value.fileKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fileKey"],
      message: "Blok media interaktif unggahan wajib mempunyai berkas HTML.",
    });
  }
  if (value.source === "embed") {
    if (!value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Blok media interaktif tautan wajib mempunyai URL embed.",
      });
    } else if (!value.url.startsWith("https://")) {
      // http ditolak: halaman materi tidak boleh membingkai konten tak
      // terenkripsi, dan pemain tertanam harus seaman halamannya.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "URL embed media interaktif harus diawali https://.",
      });
    }
  }
});
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
    // Waktu membaca AKTIF (detik) yang dilaporkan klien khusus untuk
    // peristiwa baca_materi_tuntas — bahan gerbang keplausiban
    // ketuntasan (lib/baca-wajar di API): di bawah ambang wajar untuk
    // panjang materi, ketuntasan belum dicatat. Batas atas 6 jam
    // hanya pagar kewarasan; absen berarti 0 (tidak menguntungkan).
    activeSeconds: z.number().int().min(0).max(21600).optional(),
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
  // Kelompok materi (TP/Materi pada daftar CP & ATP); null/kosong =
  // belum dikelompokkan. Disiapkan sebagai string bersih: spasi tepi
  // dipangkas dan string kosong menjadi null, supaya saringan kelompok
  // di ruang guru tidak terpecah oleh variasi spasi.
  topicGroup: z
    .string()
    .max(120)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim() ?? null;
      return trimmed ? trimmed : null;
    }),
  description: z.string().max(5000).optional(),
  // Kunci objek sampul di penyimpanan; null pada update = hapus sampul.
  coverKey: z.string().max(512).nullable().optional(),
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

// Presign unggah berkas HTML mandiri untuk blok Media Interaktif: hanya
// .html/.htm bertipe text/html. Batasnya 25 MB (di atas batas lampiran
// biasa 10 MB) karena ekspor Lumi memuat seluruh pustaka H5P di dalam
// satu berkas. Isi berkas diperiksa lagi saat disajikan (kepala berkas
// harus HTML) — presign hanya melihat nama/tipe/ukuran.
export const presignInteraktifUploadSchema = z.object({
  moduleId: z.number().int().positive(),
  filename: z.string().trim().min(1).max(255).refine(
    (name) => /\.html?$/i.test(name),
    "Berkas media interaktif harus berakhiran .html atau .htm.",
  ),
  contentType: z.literal("text/html"),
  size: z.number().int().positive().max(25 * 1024 * 1024),
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

// Penilaian Rapi (v1.0.34) — simpan nilai SATU butir seketika agar penilaian
// bisa dicicil: score null berarti kosongkan skor butir ini; teacherNote
// yang tidak dikirim berarti catatan dibiarkan, string (termasuk kosong)
// berarti catatan diganti. Batas atas terhadap poin butir ditegakkan di
// route, sama seperti simpan menyeluruh.
export const gradeWorksheetItemSchema = z.object({
  itemId: z.number().int().positive(),
  score: z.number().min(0).max(1000).nullable(),
  teacherNote: z.string().max(5000).optional(),
});

export const createAssignmentSchema = z.object({
  moduleId: z.number().int().positive().optional(),
  worksheetId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  instructions: z.string().max(5000).optional(),
  ruasQuizUrl: z.string().url().max(1024).optional(),
  // Mode pengerjaan LKPD: "kelompok" memakai kelompok acak otomatis dengan
  // target anggota per kelompok 2–10 (bawaan 4 ditegakkan di route/UI).
  workMode: z.enum(["individu", "kelompok"]).default("individu"),
  groupSize: z.number().int().min(2).max(10).optional(),
  // Sasaran penugasan: "kelas" memakai classIds; "siswa" memakai
  // studentIds (murid tertentu, mis. remedial/pengayaan) dan hanya boleh
  // untuk mode individu — aturan kombinasinya ditegakkan di superRefine
  // di bawah dan sekali lagi di route dengan pesan yang sama.
  targetType: z.enum(["kelas", "siswa"]).default("kelas"),
  opensAt: z.coerce.date(),
  dueAt: z.coerce.date(),
  classIds: z.array(z.number().int().positive()).max(50).refine((ids) => new Set(ids).size === ids.length, "Kelas tujuan tidak boleh duplikat.").optional(),
  studentIds: z.array(z.number().int().positive()).max(500).refine((ids) => new Set(ids).size === ids.length, "Murid sasaran tidak boleh duplikat.").optional(),
}).refine((value) => value.moduleId !== undefined || value.worksheetId !== undefined, {
  message: "Penugasan harus terhubung ke modul atau LKPD.",
  path: ["moduleId"],
}).refine((value) => value.dueAt >= value.opensAt, {
  message: "Batas pengumpulan harus setelah waktu buka.",
  path: ["dueAt"],
}).superRefine((value, context) => {
  if (value.targetType === "siswa") {
    if (value.workMode !== "individu") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Penugasan untuk siswa tertentu hanya tersedia untuk mode individu.", path: ["workMode"] });
    }
    if (!value.studentIds || value.studentIds.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih minimal satu murid sasaran.", path: ["studentIds"] });
    }
  } else if (!value.classIds || value.classIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih minimal satu kelas tujuan.", path: ["classIds"] });
  }
});

export const updateAssignmentSchema = z.object({
  moduleId: z.number().int().positive().optional(),
  worksheetId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional(),
  ruasQuizUrl: z.string().url().max(1024).optional(),
  workMode: z.enum(["individu", "kelompok"]).optional(),
  groupSize: z.number().int().min(2).max(10).nullable().optional(),
  targetType: z.enum(["kelas", "siswa"]).optional(),
  opensAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  status: z.enum(["draf", "terbit", "ditutup"]).optional(),
  classIds: z.array(z.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Kelas tujuan tidak boleh duplikat.").optional(),
  studentIds: z.array(z.number().int().positive()).max(500).refine((ids) => new Set(ids).size === ids.length, "Murid sasaran tidak boleh duplikat.").optional(),
}).superRefine((value, context) => {
  if (value.opensAt && value.dueAt && value.dueAt < value.opensAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Batas pengumpulan harus setelah waktu buka.", path: ["dueAt"] });
  }
  // Kombinasi sasaran siswa + mode kelompok di dalam satu payload langsung
  // ditolak di sini; kombinasi lewat keadaan tersimpan (mis. mengganti mode
  // pada penugasan siswa yang sudah ada) ditegakkan di route.
  if (value.targetType === "siswa" && value.workMode === "kelompok") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Penugasan untuk siswa tertentu hanya tersedia untuk mode individu.", path: ["workMode"] });
  }
  if (value.targetType === "siswa" && value.studentIds !== undefined && value.studentIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih minimal satu murid sasaran.", path: ["studentIds"] });
  }
});

export const shuffleAssignmentGroupsSchema = z.object({
  classId: z.number().int().positive(),
});

export const addAssignmentGroupMemberSchema = z.object({
  studentId: z.number().int().positive(),
});

// Tahap 2 — salin susunan kelompok dari penugasan kelompok lain (guru yang
// sama) untuk satu kelas tujuan.
export const copyAssignmentGroupsSchema = z.object({
  sourceAssignmentId: z.number().int().positive(),
  classId: z.number().int().positive(),
});

// Live kelompok (versi ringan — polling): detak presensi murid pada attempt
// kelompoknya. assignmentId mengikuti konteks penugasan halaman LKPD (tanpa
// konteks, attempt-nya individu dan detaknya dijawab live:false).
// currentItemId adalah butir yang sedang dibuka murid; null saat ia berada
// di layar tinjauan.
export const presenceHeartbeatSchema = z.object({
  assignmentId: z.number().int().positive().optional(),
  currentItemId: z.number().int().positive().nullable().optional(),
});

// Tahap 2 — penilaian kontribusi antarteman oleh murid pada attempt
// kelompoknya: satu kiriman boleh memuat beberapa nilai sekaligus
// (upsert per pasangan penilai–dinilai). Skala 1–5.
export const contributionRatingsSchema = z.object({
  ratings: z.array(z.object({
    rateeStudentId: z.number().int().positive(),
    score: z.number().int().min(1).max(5),
  })).min(1).max(100),
});

// Tahap 2 — penyesuaian nilai individu oleh guru pada attempt kelompok:
// score null berarti hapus penyesuaian (kembali mewarisi nilai kelompok).
// Batas atas terhadap total poin LKPD ditegakkan di route.
export const memberScoreSchema = z.object({
  studentId: z.number().int().positive(),
  score: z.number().min(0).max(100000).nullable(),
});

export const moduleBlockTypeSchema = z.enum(MODULE_BLOCK_TYPES);
