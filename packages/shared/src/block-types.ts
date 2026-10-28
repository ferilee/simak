// Konstanta jenis blok — sumber kebenaran bersama API, web, dan skema DB.
// Nilainya harus selalu sama dengan enum pada skema Drizzle di packages/db.

export const ROLES = ["guru", "murid"] as const;
export type Role = (typeof ROLES)[number];

export const MODULE_BLOCK_TYPES = ["teks", "gambar", "video", "berkas", "sub_bab"] as const;
export type ModuleBlockType = (typeof MODULE_BLOCK_TYPES)[number];

export const WORKSHEET_ITEM_TYPES = [
  "isian_singkat",
  "pilihan_ganda",
  "uraian",
  "unggah_foto",
  "langkah_berurutan",
  "refleksi",
  "tautan_ruas",
] as const;
export type WorksheetItemType = (typeof WORKSHEET_ITEM_TYPES)[number];

// Hanya tiga jenis ini yang boleh dinilai otomatis (aturan blueprint Bagian 04).
export const AUTO_GRADED_ITEM_TYPES: WorksheetItemType[] = [
  "isian_singkat",
  "pilihan_ganda",
  "langkah_berurutan",
];

export const CONTENT_STATUS = ["draf", "terbit", "arsip"] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

export const ASSIGNMENT_STATUS = ["draf", "terbit", "ditutup"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number];

export const SUBMISSION_STATUS = ["belum", "draf", "terkumpul", "terlambat", "dinilai"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUS)[number];

export const ACTIVITY_EVENTS = [
  "buka_materi",
  "baca_materi_tuntas",
  "mulai_lkpd",
  "kumpul",
  "buka_kuis_ruas",
  "exit_ticket",
] as const;
export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

export const INTEGRITY_EVENTS = [
  "visibility_hidden",
  "window_blur",
  "copy_attempt",
  "paste_attempt",
  "context_menu",
] as const;
export type IntegrityEvent = (typeof INTEGRITY_EVENTS)[number];
