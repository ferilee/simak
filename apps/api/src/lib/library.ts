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

// ---------------------------------------------------------------------------
// Antrean persetujuan berbagi (Fase 2): guru LAIN yang membagikan materi
// harus disetujui dulu oleh penyetuju Perpustakaan Bersama (pemilik
// platform) sebelum tayang. SIMAK tidak mempunyai peran admin, jadi
// kewenangan menyetujui datang dari konfigurasi: username penyetuju di
// variabel lingkungan SIMAK_LIBRARY_APPROVER.
//
// - Mode NONAKTIF (env kosong): state machine ini tidak dipakai sama
//   sekali — route berbagi menjalankan nextShareState persis seperti
//   Fase 1 (tayang langsung), tanpa kecuali.
// - Mode AKTIF: berbagi dari guru bukan penyetuju berhenti di 'menunggu'
//   sampai diputuskan; berbagi milik penyetuju sendiri tetap langsung
//   tayang. Invarian di semua jalur tulis: is_shared bernilai true tepat
//   bila share_status = 'dibagikan'; shared_at terisi saat masuk
//   'dibagikan' dan dibersihkan saat keluar darinya.
// ---------------------------------------------------------------------------

export type ShareStatus = "pribadi" | "menunggu" | "dibagikan" | "ditolak";

/** Seluruh ladang berbagi satu baris (modul atau LKPD) dalam satu nilai. */
export type ShareFields = ShareState & {
  shareStatus: ShareStatus;
  shareRequestedAt: Date | null;
};

/** Username penyetuju yang terkonfigurasi, dinormalkan (trim + huruf
 *  kecil); null bila mode persetujuan nonaktif. */
export function libraryApproverUsername(configured: string | null | undefined): string | null {
  const normalized = (configured ?? "").trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

/** Apakah mode persetujuan aktif (ada penyetuju yang terkonfigurasi). */
export function libraryApprovalActive(configured: string | null | undefined): boolean {
  return libraryApproverUsername(configured) !== null;
}

/**
 * Apakah pengguna ini penyetuju Perpustakaan Bersama: mode aktif DAN
 * username sesinya sama dengan yang terkonfigurasi (perbandingan
 * menormalkan spasi pinggir dan huruf besar/kecil di kedua sisi).
 */
export function isLibraryApprover(
  user: { username: string } | null | undefined,
  configured: string | null | undefined,
): boolean {
  const target = libraryApproverUsername(configured);
  if (target === null || !user) return false;
  return user.username.trim().toLowerCase() === target;
}

/**
 * Mesin keadaan saklar Bagikan pada mode persetujuan AKTIF.
 * `approvalRequired` = pemilik bukan penyetuju. Mematikan saklar selalu
 * bebas (penarikan tidak butuh persetujuan) dan membersihkan semuanya.
 * Menyalakan dari 'menunggu'/'dibagikan' adalah no-op yang mempertahankan
 * cap waktu yang ada (requested_at tidak digeser oleh penekanan ulang).
 * Bila persetujuan tidak diperlukan (pemilik = penyetuju), hasilnya sama
 * dengan tayang langsung nextShareState, diperkaya ladang statusnya.
 */
export function nextShareTransition(
  current: ShareFields,
  shared: boolean,
  approvalRequired: boolean,
  now: Date,
): ShareFields {
  if (!shared) {
    return { shareStatus: "pribadi", isShared: false, sharedAt: null, shareRequestedAt: null };
  }
  if (current.shareStatus === "dibagikan") {
    return { ...current, isShared: true, shareRequestedAt: null };
  }
  if (current.shareStatus === "menunggu" && approvalRequired) {
    return { ...current, isShared: false, sharedAt: null };
  }
  if (approvalRequired) {
    return { shareStatus: "menunggu", isShared: false, sharedAt: null, shareRequestedAt: now };
  }
  return { shareStatus: "dibagikan", isShared: true, sharedAt: now, shareRequestedAt: null };
}

/** Ladang berbagi lengkap untuk satu status tujuan pada waktu `now` —
 *  dipakai jalur keputusan penyetuju, penarikan, dan rangkaian modul,
 *  yang semuanya mendarat pada keadaan bersih (cap waktu hanya terisi
 *  pada status yang memang mencatatnya). */
export function shareFieldsForStatus(status: ShareStatus, now: Date): ShareFields {
  switch (status) {
    case "dibagikan":
      return { shareStatus: "dibagikan", isShared: true, sharedAt: now, shareRequestedAt: null };
    case "menunggu":
      return { shareStatus: "menunggu", isShared: false, sharedAt: null, shareRequestedAt: now };
    case "ditolak":
      return { shareStatus: "ditolak", isShared: false, sharedAt: null, shareRequestedAt: null };
    case "pribadi":
      return { shareStatus: "pribadi", isShared: false, sharedAt: null, shareRequestedAt: null };
  }
}

/** Nilai kolom basis data untuk satu keadaan berbagi (nama kolom Drizzle). */
export function shareTransitionValues(fields: ShareFields) {
  return {
    isShared: fields.isShared,
    sharedAt: fields.sharedAt,
    shareStatus: fields.shareStatus,
    shareRequestedAt: fields.shareRequestedAt,
  };
}

/**
 * Rencana rangkaian saklar modul (mode aktif): LKPD modul yang masih
 * 'pribadi' atau 'ditolak' mengikuti keadaan BARU modulnya ('menunggu'
 * atau 'dibagikan'); yang sudah 'menunggu'/'dibagikan' tidak disentuh.
 * Mengembalikan id LKPD yang ikut berpindah (kosong bila modul tidak
 * masuk salah satu dari dua keadaan itu).
 */
export function planShareCascadeIds<T extends { id: number; shareStatus: ShareStatus }>(
  worksheets: readonly T[],
  moduleNextStatus: ShareStatus,
): number[] {
  if (moduleNextStatus !== "menunggu" && moduleNextStatus !== "dibagikan") return [];
  return worksheets
    .filter((worksheet) => worksheet.shareStatus === "pribadi" || worksheet.shareStatus === "ditolak")
    .map((worksheet) => worksheet.id);
}

/**
 * Rencana bawaan persetujuan modul: LKPD modul yang masih 'menunggu'
 * ikut menjadi 'dibagikan' bersama modulnya, dalam transaksi yang sama.
 * Penolakan TIDAK memakai rencana ini — menolak modul hanya menolak
 * modulnya; LKPD-nya yang 'menunggu' tetap berdiri sebagai pengajuan
 * sendiri di antrean (asimetri yang disengaja: persetujuan membawa,
 * penolakan bedah).
 */
export function planApprovalCarryIds<T extends { id: number; shareStatus: ShareStatus }>(
  worksheets: readonly T[],
): number[] {
  return worksheets.filter((worksheet) => worksheet.shareStatus === "menunggu").map((worksheet) => worksheet.id);
}

export const APPROVALS_FORBIDDEN_MESSAGE = "Hanya penyetuju Perpustakaan Bersama yang dapat membuka antrean persetujuan.";

/** Gerbang semua endpoint persetujuan: hanya penyetuju, hanya saat mode aktif. */
export function approvalsGuard(approver: boolean): CopyGuardResult {
  if (!approver) return { ok: false, status: 403, message: APPROVALS_FORBIDDEN_MESSAGE };
  return { ok: true };
}

export const DECISION_ALREADY_MADE_MESSAGE = "Pengajuan ini sudah diputuskan.";

/**
 * Gerbang keputusan persetujuan: butir harus ada (404 gaya katalog —
 * keberadaan pengajuan guru lain tidak dibocorkan ke non-penyetuju, dan
 * gerbang penyetuju sudah berjalan lebih dulu) dan masih 'menunggu'.
 */
export function decisionGuard(
  item: { shareStatus: ShareStatus } | null | undefined,
  notFoundMessage: string,
): CopyGuardResult {
  if (!item) return { ok: false, status: 404, message: notFoundMessage };
  if (item.shareStatus !== "menunggu") return { ok: false, status: 409, message: DECISION_ALREADY_MADE_MESSAGE };
  return { ok: true };
}

export const TARIK_NOT_LIVE_MESSAGE = "Materi ini tidak sedang tayang di Perpustakaan Bersama.";
export const TARIK_OWN_MESSAGE = "Ini materi Anda sendiri; matikan lewat saklar Bagikan.";

/**
 * Gerbang penarikan oleh penyetuju: butir harus ada, BUKAN milik penyetuju
 * sendiri (milik sendiri diatur lewat saklar Bagikan biasa — pemeriksaan
 * ini lebih dulu, mengikuti kebiasaan copyGuard), dan sedang tayang.
 */
export function tarikGuard(
  item: { teacherId: number; shareStatus: ShareStatus } | null | undefined,
  approverUserId: number,
  notFoundMessage: string,
): CopyGuardResult {
  if (!item) return { ok: false, status: 404, message: notFoundMessage };
  if (item.teacherId === approverUserId) return { ok: false, status: 400, message: TARIK_OWN_MESSAGE };
  if (item.shareStatus !== "dibagikan") return { ok: false, status: 409, message: TARIK_NOT_LIVE_MESSAGE };
  return { ok: true };
}

export type ApprovalQueueRow = {
  kind: "module" | "worksheet";
  id: number;
  title: string;
  ownerName: string;
  shareRequestedAt: Date | null;
  subject: string | null;
  blockCount: number | null;
  pendingWorksheetCount: number | null;
  itemCount: number | null;
};

export type ApprovalQueueEntry = {
  kind: "modul" | "lkpd";
  id: number;
  title: string;
  teacher_name: string;
  share_requested_at: Date | null;
  subject: string | null;
  block_count?: number;
  pending_worksheet_count?: number;
  item_count?: number;
};

export function buildApprovalQueueEntry(row: ApprovalQueueRow): ApprovalQueueEntry {
  if (row.kind === "module") {
    return {
      kind: "modul",
      id: row.id,
      title: row.title,
      teacher_name: row.ownerName,
      share_requested_at: row.shareRequestedAt,
      subject: row.subject,
      block_count: row.blockCount ?? 0,
      pending_worksheet_count: row.pendingWorksheetCount ?? 0,
    };
  }
  return {
    kind: "lkpd",
    id: row.id,
    title: row.title,
    teacher_name: row.ownerName,
    share_requested_at: row.shareRequestedAt,
    subject: row.subject,
    item_count: row.itemCount ?? 0,
  };
}

function requestedAtMillis(entry: ApprovalQueueEntry): number {
  return entry.share_requested_at ? entry.share_requested_at.getTime() : 0;
}

/**
 * Gabungan antrean persetujuan: modul dan LKPD dalam satu daftar, yang
 * diajukan PALING LAMA di atas (keputusan mengikuti urutan kedatangan).
 */
export function mergeApprovalQueue(moduleEntries: ApprovalQueueEntry[], worksheetEntries: ApprovalQueueEntry[]): ApprovalQueueEntry[] {
  return [...moduleEntries, ...worksheetEntries].sort((a, b) => requestedAtMillis(a) - requestedAtMillis(b));
}

export type CopyGuardResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; message: string };

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
 * Gerbang penyalinan ulang: guru yang SUDAH mempunyai salinan dari sumber
 * ini (baris miliknya dengan copied_from_id = id sumber, dalam keadaan
 * apa pun — draf/terbit/arsip) tidak boleh menyalinnya lagi. Berjalan
 * SESUDAH copyGuard agar pesan "milik sendiri"/404 tetap didahulukan.
 */
export function alreadyCopiedGuard(alreadyCopied: boolean, message: string): CopyGuardResult {
  if (alreadyCopied) {
    return { ok: false, status: 400, message };
  }
  return { ok: true };
}

/**
 * Himpunan id sumber yang sudah disalin oleh seorang guru, dibangun dari
 * baris-baris salinan MILIKNYA (route menyaring teacher_id = peminta).
 * Hanya copied_from_id yang dibaca: keadaan salinan (draf/terbit/arsip)
 * tidak memengaruhi — salinan yang masih ada selalu dihitung.
 */
export function copiedSourceIdSet(rows: readonly { copiedFromId: number | null }[]): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.copiedFromId !== null) ids.add(row.copiedFromId);
  }
  return ids;
}

/**
 * Gerbang pratinjau katalog: sama seperti penyalinan, pratinjau hanya untuk
 * materi yang dibagikan MILIK GURU LAIN. Milik sendiri pun 404 dari katalog
 * (katalog menurut definisi hanya memuat guru lain; pemilik mempratinjau
 * materinya dari ruang kerjanya sendiri).
 *
 * Perluasan penyetuju (Fase 2): bila penampil adalah PENYETUJU, butir yang
 * masih 'menunggu' keputusan pun dapat dipratinjau — ia harus dapat
 * memeriksa isi sebelum menyetujui atau menolak. Untuk semua penampil
 * lain, butir 'menunggu' tetap 404 persis seperti materi privat.
 */
export function previewGuard(
  source: { teacherId: number; isShared: boolean; shareStatus?: ShareStatus } | null | undefined,
  userId: number,
  notFoundMessage: string,
  viewer?: { isApprover?: boolean },
): CopyGuardResult {
  if (!source || source.teacherId === userId) {
    return { ok: false, status: 404, message: notFoundMessage };
  }
  if (source.isShared) return { ok: true };
  if (viewer?.isApprover === true && source.shareStatus === "menunggu") return { ok: true };
  return { ok: false, status: 404, message: notFoundMessage };
}

export type LibraryModuleRow = {
  id: number;
  title: string;
  subject: string;
  teacherId: number;
  ownerName: string;
  kontributorTotal: number;
  sharedAt: Date | null;
  coverKey: string | null;
  blockCount: number;
  sharedWorksheetCount: number;
  sudahDisalin: boolean;
  salinanCount: number;
};

export type LibraryWorksheetRow = {
  id: number;
  title: string;
  subject: string | null;
  teacherId: number;
  ownerName: string;
  kontributorTotal: number;
  sharedAt: Date | null;
  itemCount: number;
  totalPoints: number;
  sudahDisalin: boolean;
  salinanCount: number;
};

export type LibraryEntry = {
  kind: "module" | "worksheet";
  id: number;
  title: string;
  subject: string | null;
  teacher_id: number;
  owner_name: string;
  kontributor_total: number;
  shared_at: Date | null;
  sudah_disalin: boolean;
  salinan_count: number;
  cover_key: string | null;
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
    teacher_id: row.teacherId,
    owner_name: row.ownerName,
    kontributor_total: row.kontributorTotal,
    shared_at: row.sharedAt,
    sudah_disalin: row.sudahDisalin,
    salinan_count: row.salinanCount,
    cover_key: row.coverKey,
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
    teacher_id: row.teacherId,
    owner_name: row.ownerName,
    kontributor_total: row.kontributorTotal,
    shared_at: row.sharedAt,
    sudah_disalin: row.sudahDisalin,
    salinan_count: row.salinanCount,
    cover_key: null,
    item_count: row.itemCount,
    total_points: row.totalPoints,
  };
}

/**
 * Agregasi hitungan salinan per butir sumber: baris-baris hasil GROUP BY
 * copied_from_id (satu query per jenis untuk semua id di halaman katalog)
 * dilipat menjadi peta id sumber → jumlah salinan yang MASIH ADA. Salinan
 * milik guru mana pun terhitung; salinan yang sudah dihapus tidak lagi
 * berupa baris sehingga otomatis tidak terhitung. Baris berkelompok yang
 * copied_from_id-nya NULL (bukan salinan) dibuang.
 */
export function countCopiesBySourceId(
  rows: readonly { copiedFromId: number | null; count: number }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.copiedFromId === null || row.count <= 0) continue;
    counts.set(row.copiedFromId, (counts.get(row.copiedFromId) ?? 0) + row.count);
  }
  return counts;
}

export type LibraryStats = {
  total_items: number;
  total_kontributor: number;
  sudah_disalin_count: number;
};

/**
 * Statistik hero katalog, dihitung dari SELURUH semesta tayang (butir
 * is_shared milik guru lain) dan tidak mengikuti saringan aktif:
 * total butir tayang, jumlah kontributor (panjang ringkasan kontributor),
 * dan berapa butir semesta yang sudah disalin penampil (irisan himpunan
 * sumber salinan milik penampil dengan id-id semesta, per jenis).
 */
export function buildLibraryStats(input: {
  universeModuleIds: readonly number[];
  universeWorksheetIds: readonly number[];
  totalKontributor: number;
  viewerCopiedModuleIds: ReadonlySet<number>;
  viewerCopiedWorksheetIds: ReadonlySet<number>;
}): LibraryStats {
  let sudahDisalin = 0;
  for (const id of input.universeModuleIds) {
    if (input.viewerCopiedModuleIds.has(id)) sudahDisalin += 1;
  }
  for (const id of input.universeWorksheetIds) {
    if (input.viewerCopiedWorksheetIds.has(id)) sudahDisalin += 1;
  }
  return {
    total_items: input.universeModuleIds.length + input.universeWorksheetIds.length,
    total_kontributor: input.totalKontributor,
    sudah_disalin_count: sudahDisalin,
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

// ---------------------------------------------------------------------------
// Filter kontributor + lencana jumlah dibagikan: katalog dapat disaring
// per guru penyumbang, dan setiap kartu menampilkan berapa banyak materi
// guru itu yang SEDANG tayang. Semesta hitungnya sama persis dengan
// semesta katalog (is_shared = true milik guru LAIN dari penampil), dan
// ringkasannya dihitung dari seluruh semesta — bukan dari hasil saringan
// saat ini — agar chip kontributor tidak berubah-ubah saat menyaring.
// Butir 'menunggu'/'ditolak'/pribadi tidak pernah terhitung: menurut
// invarian berbagi, is_shared hanya menyala untuk yang 'dibagikan'.
// ---------------------------------------------------------------------------

export type ContributorSummary = {
  teacher_id: number;
  name: string;
  modul_count: number;
  lkpd_count: number;
  total: number;
};

/**
 * Gabungkan hitungan modul dan LKPD yang tayang per guru menjadi
 * ringkasan kontributor. Baris hitungan nol (dan guru tanpa butir tayang
 * sama sekali) tidak muncul. Urutan: total terbanyak dulu, seri dipecah
 * menurut nama menaik (locale "id").
 */
export function buildContributorSummaries(
  moduleCounts: readonly { teacherId: number; count: number }[],
  worksheetCounts: readonly { teacherId: number; count: number }[],
  namesById: ReadonlyMap<number, string>,
): ContributorSummary[] {
  const byTeacher = new Map<number, { modul: number; lkpd: number }>();
  for (const row of moduleCounts) {
    if (row.count <= 0) continue;
    const existing = byTeacher.get(row.teacherId) ?? { modul: 0, lkpd: 0 };
    existing.modul = row.count;
    byTeacher.set(row.teacherId, existing);
  }
  for (const row of worksheetCounts) {
    if (row.count <= 0) continue;
    const existing = byTeacher.get(row.teacherId) ?? { modul: 0, lkpd: 0 };
    existing.lkpd = row.count;
    byTeacher.set(row.teacherId, existing);
  }
  const summaries: ContributorSummary[] = [];
  for (const [teacherId, counts] of byTeacher) {
    const total = counts.modul + counts.lkpd;
    if (total <= 0) continue;
    summaries.push({
      teacher_id: teacherId,
      name: namesById.get(teacherId) ?? "Guru",
      modul_count: counts.modul,
      lkpd_count: counts.lkpd,
      total,
    });
  }
  summaries.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "id"));
  return summaries;
}

/**
 * Parse parameter teacher_id pada katalog: tidak dikirim → tanpa saringan
 * (teacherId null); dikirim tapi bukan bilangan bulat positif → tidak sah
 * (route menjawab 400 "Kontributor tidak valid.").
 */
export function parseContributorParam(
  raw: string | undefined,
): { valid: true; teacherId: number | null } | { valid: false } {
  if (raw === undefined) return { valid: true, teacherId: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { valid: false };
  return { valid: true, teacherId: id };
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
