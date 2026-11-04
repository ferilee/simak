// Perpustakaan Bersama (Fase 1, v1.0.41): guru dapat membagikan modul dan
// LKPD miliknya ke semua guru SIMAK lain; guru lain menelusuri katalog,
// mempratinjau, lalu MENYALIN item ke akunnya sendiri sebagai Draf (salinan
// dalam — blok/butir/kunci/rubrik ikut; berkas lampiran dirujuk apa adanya,
// bukan digandakan). Modelnya salin, bukan pakai-langsung: salinan dan
// sumber tidak saling memengaruhi sesudah penyalinan.
//
// Aturan yang dijaga di sini (ditetapkan bersama guru):
// - Bawaan privat: is_shared hanya menyala lewat saklar eksplisit pemilik.
// - Tayang langsung: tidak ada antrean kurasi; yang dibagikan langsung
//   terlihat semua guru lain (kecuali pemiliknya sendiri — katalog tidak
//   memuat materi sendiri).
// - Data murid TIDAK PERNAH ikut: yang berpindah hanya isi konten.
// - Atribusi: nama guru sumber tampil di katalog dan DIBEKUKAN sebagai teks
//   pada salinan (copied_from_teacher_name), jadi tetap terbaca walau
//   sumbernya berubah nama atau berhenti dibagikan.
//
// Fungsi-fungsi ini murni agar dapat diuji tanpa basis data
// (lihat perpustakaan-bersama.test.mjs); route memeriksa kepemilikan dan
// keadaan basis data, lalu memakai pembangun nilai di sini.

export type ShareState = {
  isShared: boolean;
  sharedAt: Date | null;
};

/** Keadaan saklar sesudah ditekan: menyala → shared_at = sekarang;
 *  mati → shared_at kembali NULL. */
export function nextShareState(shared: boolean, now: Date): ShareState {
  return shared ? { isShared: true, sharedAt: now } : { isShared: false, sharedAt: null };
}

export type CopyGuardResult = { ok: true } | { ok: false; status: 400 | 404; message: string };

/**
 * Gerbang penyalinan dari katalog. Sumber yang tidak ada ATAU tidak
 * dibagikan sama-sama 404 (katalog tidak membocorkan keberadaan materi
 * privat); menyalin materi sendiri ditolak 400 dengan pesan yang jelas.
 * Pemeriksaan "milik sendiri" berjalan lebih dulu agar pemiliknya mendapat
 * penjelasan yang benar walau materinya sedang tidak dibagikan.
 */
export function copyGuard(
  source: { teacherId: number; isShared: boolean } | null | undefined,
  userId: number,
  notFoundMessage: string,
): CopyGuardResult {
  if (source && source.teacherId === userId) {
    return { ok: false, status: 400, message: "Ini materi Anda sendiri." };
  }
  if (!source || !source.isShared) {
    return { ok: false, status: 404, message: notFoundMessage };
  }
  return { ok: true };
}

/**
 * Gerbang pratinjau katalog: sama seperti penyalinan, pratinjau hanya untuk
 * materi yang dibagikan MILIK GURU LAIN. Milik sendiri pun 404 dari katalog
 * (katalog menurut definisi hanya memuat guru lain; pemilik mempratinjau
 * materinya dari ruang kerjanya sendiri).
 */
export function previewGuard(
  source: { teacherId: number; isShared: boolean } | null | undefined,
  userId: number,
  notFoundMessage: string,
): CopyGuardResult {
  if (!source || !source.isShared || source.teacherId === userId) {
    return { ok: false, status: 404, message: notFoundMessage };
  }
  return { ok: true };
}

export type LibraryModuleRow = {
  id: number;
  title: string;
  subject: string;
  ownerName: string;
  sharedAt: Date | null;
  blockCount: number;
  sharedWorksheetCount: number;
};

export type LibraryWorksheetRow = {
  id: number;
  title: string;
  subject: string | null;
  ownerName: string;
  sharedAt: Date | null;
  itemCount: number;
  totalPoints: number;
};

export type LibraryEntry = {
  kind: "module" | "worksheet";
  id: number;
  title: string;
  subject: string | null;
  owner_name: string;
  shared_at: Date | null;
  block_count?: number;
  shared_worksheet_count?: number;
  item_count?: number;
  total_points?: number;
};

export function buildLibraryModuleEntry(row: LibraryModuleRow): LibraryEntry {
  return {
    kind: "module",
    id: row.id,
    title: row.title,
    subject: row.subject,
    owner_name: row.ownerName,
    shared_at: row.sharedAt,
    block_count: row.blockCount,
    shared_worksheet_count: row.sharedWorksheetCount,
  };
}

export function buildLibraryWorksheetEntry(row: LibraryWorksheetRow): LibraryEntry {
  return {
    kind: "worksheet",
    id: row.id,
    title: row.title,
    subject: row.subject,
    owner_name: row.ownerName,
    shared_at: row.sharedAt,
    item_count: row.itemCount,
    total_points: row.totalPoints,
  };
}

function sharedAtMillis(entry: LibraryEntry): number {
  return entry.shared_at ? entry.shared_at.getTime() : 0;
}

/**
 * Gabungan katalog: modul dan LKPD dalam satu daftar, yang paling baru
 * dibagikan di atas. shared_at NULL (tidak seharusnya terjadi pada baris
 * is_shared=1, tetapi dibela) tenggelam ke paling bawah.
 */
export function mergeLibraryEntries(moduleEntries: LibraryEntry[], worksheetEntries: LibraryEntry[]): LibraryEntry[] {
  return [...moduleEntries, ...worksheetEntries].sort((a, b) => sharedAtMillis(b) - sharedAtMillis(a));
}

/**
 * Rencana salin modul: dari semua LKPD yang menempel pada modul sumber,
 * hanya yang DIBAGIKAN yang ikut tersalin (sesuai urutan masukan). LKPD
 * yang tidak dibagikan tidak pernah ikut — pemiliknya mungkin hanya ingin
 * membagikan materinya saja.
 */
export function planModuleCopyWorksheets<T extends { id: number; isShared: boolean }>(worksheets: T[]): number[] {
  return worksheets.filter((worksheet) => worksheet.isShared).map((worksheet) => worksheet.id);
}

export type ModuleSource = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  coverKey: string | null;
};

/**
 * Nilai sisipan salinan modul: pemilik = penyalin, status dipaksa "draf",
 * versi mulai lagi dari 1 (salinan adalah modul baru), tidak dibagikan,
 * sampul dirujuk apa adanya (kunci penyimpanan yang sama), dan jejak
 * salinan dibekukan dari sumbernya.
 */
export function moduleCopyValues(source: ModuleSource, copierId: number, ownerName: string) {
  return {
    teacherId: copierId,
    title: source.title,
    subject: source.subject,
    description: source.description,
    coverKey: source.coverKey,
    status: "draf" as const,
    version: 1,
    isShared: false,
    sharedAt: null,
    copiedFromId: source.id,
    copiedFromTeacherName: ownerName,
  };
}

export type ModuleBlockSource = {
  sortOrder: number;
  type: "teks" | "gambar" | "video" | "berkas" | "sub_bab";
  contentJson: Record<string, unknown>;
  attachmentKey: string | null;
};

/** Blok tersalin apa adanya — isi dan kunci lampirannya dirujuk, bukan digandakan. */
export function moduleBlockCopyValues(block: ModuleBlockSource, newModuleId: number) {
  return {
    moduleId: newModuleId,
    sortOrder: block.sortOrder,
    type: block.type,
    contentJson: block.contentJson,
    attachmentKey: block.attachmentKey,
  };
}

export type WorksheetSource = {
  id: number;
  title: string;
  instructions: string | null;
};

/**
 * Nilai sisipan salinan LKPD: pemilik = penyalin, status "draf", tidak
 * dibagikan, jejak salinan dibekukan. moduleId diisi pemanggil: id modul
 * salinan baru bila LKPD ini ikut dalam salinan modul, atau NULL bila
 * disalin tersendiri dari katalog.
 */
export function worksheetCopyValues(source: WorksheetSource, copierId: number, moduleId: number | null, ownerName: string) {
  return {
    moduleId,
    teacherId: copierId,
    title: source.title,
    instructions: source.instructions,
    status: "draf" as const,
    isShared: false,
    sharedAt: null,
    copiedFromId: source.id,
    copiedFromTeacherName: ownerName,
  };
}

export type WorksheetItemSource = {
  sortOrder: number;
  itemType: "isian_singkat" | "pilihan_ganda" | "uraian" | "unggah_foto" | "langkah_berurutan" | "refleksi" | "tautan_ruas";
  prompt: string;
  optionsJson: Record<string, unknown> | null;
  answerKey: string | null;
  explanation: string | null;
  rubricMax: number;
  points: number;
};

/** Butir tersalin dengan SEMUA ladangnya — kunci dan rubrik termasuk,
 *  karena LKPD tanpa kunci tidak berguna bagi guru penerima. */
export function worksheetItemCopyValues(item: WorksheetItemSource, newWorksheetId: number) {
  return {
    worksheetId: newWorksheetId,
    sortOrder: item.sortOrder,
    itemType: item.itemType,
    prompt: item.prompt,
    optionsJson: item.optionsJson,
    answerKey: item.answerKey,
    explanation: item.explanation,
    rubricMax: item.rubricMax,
    points: item.points,
  };
}
