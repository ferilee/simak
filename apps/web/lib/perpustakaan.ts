// Perpustakaan Bersama (Fase 1, v1.0.41) — helper murni halaman katalog
// guru: label jenis, baris meta kartu, teks konfirmasi salin, tanggal
// bagikan, dan tautan dalam ke draf salinan di ruang guru. Keputusan
// tampilannya diuji di sini; halaman (app/guru/perpustakaan) hanya
// merender. Lihat perpustakaan-bersama.test.mjs.

export type LibraryEntry = {
  kind: "module" | "worksheet";
  id: number;
  title: string;
  subject: string | null;
  teacher_id?: number;
  owner_name: string;
  kontributor_total?: number;
  shared_at: string | null;
  sudah_disalin?: boolean;
  salinan_count?: number;
  cover_key?: string | null;
  block_count?: number;
  shared_worksheet_count?: number;
  item_count?: number;
  total_points?: number;
};

/** Label tombol salin pada kartu yang sudah pernah disalin guru ini. */
export const SUDAH_DISALIN_LABEL = "✓ Sudah disalin";

/**
 * Apakah guru yang sedang masuk sudah mempunyai salinan butir katalog ini
 * (penanda dari API, dihitung dari copied_from_id salinan miliknya).
 * Kartu seperti itu menampilkan tombol salin nonaktif — server pun menolak
 * penyalinan kedua, jadi tampilannya bukan sekadar kosmetik.
 */
export function isSudahDisalin(entry: LibraryEntry): boolean {
  return entry.sudah_disalin === true;
}

export type LibraryKindFilter = "all" | "module" | "worksheet";

// ---------------------------------------------------------------------------
// Filter kontributor: ringkasan per guru penyumbang dari meta respons
// katalog (dihitung API dari seluruh semesta tayang, bukan dari saringan
// saat ini). Chip-nya menyaring daftar per guru; lencana pada kartu
// menunjukkan total butir tayang pemilik kartu itu.
// ---------------------------------------------------------------------------

export type ContributorSummary = {
  teacher_id: number;
  name: string;
  modul_count: number;
  lkpd_count: number;
  total: number;
};

/** Label chip kontributor: nama + total tayangnya dalam kurung. */
export function contributorChipLabel(contributor: ContributorSummary): string {
  return `${contributor.name} (${contributor.total})`;
}

/** Teks lencana jumlah dibagikan pada byline kartu katalog. */
export function kontributorBadgeLabel(entry: LibraryEntry): string {
  return `${entry.kontributor_total ?? 0} dibagikan`;
}

/**
 * Saringan kontributor yang tetap sah sesudah daftar kontributor dimuat
 * ulang: pilihan yang pemiliknya sudah tidak punya butir tayang (misalnya
 * butir terakhirnya ditarik) gugur kembali ke "Semua kontributor" (null).
 */
export function resolveSelectedContributor(
  selected: number | null,
  contributors: readonly ContributorSummary[],
): number | null {
  if (selected === null) return null;
  return contributors.some((contributor) => contributor.teacher_id === selected) ? selected : null;
}

export function libraryKindLabel(kind: LibraryEntry["kind"]): string {
  return kind === "module" ? "Materi" : "LKPD";
}

/** Baris meta kartu katalog: isi dan janji salinannya dalam satu baris. */
export function libraryEntryMeta(entry: LibraryEntry): string {
  if (entry.kind === "module") {
    const blocks = entry.block_count ?? 0;
    const worksheets = entry.shared_worksheet_count ?? 0;
    return worksheets > 0
      ? `${blocks} blok · ${worksheets} LKPD ikut tersalin`
      : `${blocks} blok · tanpa LKPD yang dibagikan`;
  }
  return `${entry.item_count ?? 0} soal · ${entry.total_points ?? 0} poin`;
}

/**
 * Teks dialog konfirmasi penyalinan. Untuk modul, kalimatnya jujur soal
 * LKPD yang ikut: hanya LKPD yang DIBAGIKAN pemiliknya yang tersalin.
 */
export function copyConfirmText(entry: LibraryEntry): string {
  if (entry.kind === "module") {
    const worksheets = entry.shared_worksheet_count ?? 0;
    return worksheets > 0
      ? `Salin "${entry.title}" ke akun Anda sebagai Draf? ${worksheets} LKPD yang dibagikan pada materi ini ikut tersalin.`
      : `Salin "${entry.title}" ke akun Anda sebagai Draf?`;
  }
  return `Salin "${entry.title}" ke akun Anda sebagai Draf?`;
}

/** Tanggal dibagikan, format Indonesia; string kosong bila tak dikenal. */
export function formatSharedDate(sharedAt: string | null): string {
  if (!sharedAt) return "";
  const date = new Date(sharedAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Tautan dalam ke editor draf salinan di ruang guru. */
export function copiedDraftHref(kind: LibraryEntry["kind"], newId: number): string {
  return kind === "module" ? `/guru?modul=${newId}` : `/guru?lkpd=${newId}`;
}

// ---------------------------------------------------------------------------
// Antrean persetujuan berbagi (Fase 2): status pengajuan berbagi milik
// sendiri di kartu guru, dan antrean keputusan di halaman perpustakaan
// untuk penyetuju. share_status dari API adalah sumber kebenarannya;
// is_shared hanya cadangan untuk data lama (keduanya sejalan menurut
// invarian API: is_shared tepat bila share_status = 'dibagikan').
// ---------------------------------------------------------------------------

export type ShareStatus = "pribadi" | "menunggu" | "dibagikan" | "ditolak";

/**
 * Keadaan tampil saklar Bagikan: menyala untuk 'menunggu' dan 'dibagikan'
 * (pengajuan yang sedang menunggu pun saklarnya menyala — mematikannya
 * membatalkan pengajuan), mati untuk 'pribadi' dan 'ditolak'.
 */
export function shareToggleOn(shareStatus: ShareStatus | null | undefined, isShared: boolean): boolean {
  if (shareStatus) return shareStatus === "menunggu" || shareStatus === "dibagikan";
  return isShared;
}

export type ShareStatusBadge = { label: string; tone: "amber" | "red"; hint: string | null };

/** Lencana status pengajuan di samping saklar Bagikan; null = tanpa
 *  lencana (keadaan 'pribadi'/'dibagikan' tampil seperti Fase 1). */
export function shareStatusBadge(shareStatus: ShareStatus | null | undefined): ShareStatusBadge | null {
  if (shareStatus === "menunggu") return { label: "Menunggu persetujuan", tone: "amber", hint: null };
  if (shareStatus === "ditolak") {
    return { label: "Ditolak", tone: "red", hint: "Ajukan lagi dengan menyalakan Bagikan setelah diperbaiki." };
  }
  return null;
}

export type ApprovalEntry = {
  kind: "modul" | "lkpd";
  id: number;
  title: string;
  teacher_name: string;
  share_requested_at: string | null;
  subject: string | null;
  block_count?: number;
  pending_worksheet_count?: number;
  item_count?: number;
};

/** Label jenis pada kartu antrean (istilah API antrean: modul/lkpd). */
export function approvalKindLabel(kind: ApprovalEntry["kind"]): string {
  return kind === "modul" ? "Materi" : "LKPD";
}

/** Baris meta kartu antrean: isi pengajuan dalam satu baris. */
export function approvalEntryMeta(entry: ApprovalEntry): string {
  if (entry.kind === "modul") {
    const pending = entry.pending_worksheet_count ?? 0;
    return pending > 0
      ? `${entry.block_count ?? 0} blok · ${pending} LKPD ikut menunggu`
      : `${entry.block_count ?? 0} blok · tanpa LKPD yang menunggu`;
  }
  return `${entry.item_count ?? 0} soal`;
}

/** Tanggal pengajuan diajukan, format Indonesia; kosong bila tak dikenal. */
export function formatRequestedDate(requestedAt: string | null): string {
  return formatSharedDate(requestedAt);
}

/** Ubah butir antrean menjadi butir katalog agar pratinjau halaman yang
 *  sama dapat dipakai (pratinjau penyetuju menembus gerbang API khusus). */
export function approvalToLibraryEntry(entry: ApprovalEntry): LibraryEntry {
  return {
    kind: entry.kind === "modul" ? "module" : "worksheet",
    id: entry.id,
    title: entry.title,
    subject: entry.subject,
    owner_name: entry.teacher_name,
    shared_at: null,
  };
}

/** Jalur API keputusan penyetuju untuk satu butir antrean. */
export function approvalDecisionPath(entry: ApprovalEntry): string {
  return entry.kind === "modul" ? `/library/approvals/modules/${entry.id}` : `/library/approvals/worksheets/${entry.id}`;
}

/** Jalur API penarikan butir yang sedang tayang oleh penyetuju. */
export function approvalTarikPath(entry: LibraryEntry): string {
  return entry.kind === "module" ? `/library/approvals/modules/${entry.id}/tarik` : `/library/approvals/worksheets/${entry.id}/tarik`;
}

/** Teks konfirmasi penarikan oleh penyetuju (persis yang disetujui). */
export function tarikConfirmText(): string {
  return "Tarik materi ini dari Perpustakaan Bersama? Salinan yang sudah dibuat guru lain tidak terpengaruh.";
}

// ---------------------------------------------------------------------------
// Desain ulang tampilan katalog (ala toko buku): panel hero ungu dengan
// statistik semesta, rak "Populer" dari jumlah salinan, sampul tipografis
// pastel untuk butir tanpa gambar sampul, dan panel kontributor teratas.
// Semua keputusan tampilannya murni di sini; halaman hanya merender.
// ---------------------------------------------------------------------------

export type LibraryStats = {
  total_items: number;
  total_kontributor: number;
  sudah_disalin_count: number;
};

/** Tiga label chip statistik pada panel hero, berurutan. */
export function libraryStatsChips(stats: LibraryStats): string[] {
  return [
    `${stats.total_items} materi dibagikan`,
    `${stats.total_kontributor} kontributor`,
    `${stats.sudah_disalin_count} sudah kamu salin`,
  ];
}

/**
 * Label jumlah salinan pada baris meta kartu: "Disalin {n} kali" bila
 * butir ini pernah disalin guru lain, null bila belum pernah (barisnya
 * tidak ditambah apa pun).
 */
export function salinanCountLabel(entry: LibraryEntry): string | null {
  const count = entry.salinan_count ?? 0;
  return count > 0 ? `Disalin ${count} kali` : null;
}

/**
 * Rak Populer: dari hasil katalog saat ini, ambil butir yang sudah pernah
 * disalin (salinan_count ≥ 1), urut jumlah salinan terbanyak lalu yang
 * paling baru dibagikan, paling banyak `limit` butir. Masukan tidak
 * diubah; butir tanpa ladang salinan_count (payload lama) dianggap 0.
 */
export function pickPopular(entries: readonly LibraryEntry[], limit = 8): LibraryEntry[] {
  const millis = (entry: LibraryEntry) => {
    if (!entry.shared_at) return 0;
    const time = new Date(entry.shared_at).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  return entries
    .filter((entry) => (entry.salinan_count ?? 0) >= 1)
    .sort((a, b) => (b.salinan_count ?? 0) - (a.salinan_count ?? 0) || millis(b) - millis(a))
    .slice(0, Math.max(0, limit));
}

/** Palet gradien pastel tetap untuk sampul tipografis (≥ 6 pilihan). */
export const COVER_GRADIENTS: readonly string[] = [
  "linear-gradient(135deg, #a78bfa, #7c3aed)",
  "linear-gradient(135deg, #f9a8d4, #db2777)",
  "linear-gradient(135deg, #fbbf24, #d97706)",
  "linear-gradient(135deg, #6ee7b7, #059669)",
  "linear-gradient(135deg, #7dd3fc, #2563eb)",
  "linear-gradient(135deg, #fca5a5, #dc2626)",
  "linear-gradient(135deg, #c4b5fd, #8b5cf6)",
  "linear-gradient(135deg, #5eead4, #0d9488)",
];

/** Hash deterministik sederhana (djb2) untuk pilihan palet sampul. */
export function coverGradientIndex(seed: string, paletteSize: number = COVER_GRADIENTS.length): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) >>> 0;
  }
  return paletteSize > 0 ? hash % paletteSize : 0;
}

/** Benih pilihan sampul satu butir: mapelnya, atau judulnya bila tanpa mapel. */
export function coverSeed(entry: LibraryEntry): string {
  return entry.subject ?? entry.title;
}

/** Gradien sampul tipografis satu butir — deterministik per mapel/judul. */
export function coverGradient(entry: LibraryEntry): string {
  return COVER_GRADIENTS[coverGradientIndex(coverSeed(entry))] ?? COVER_GRADIENTS[0]!;
}

/** Huruf awal besar untuk sampul tipografis (huruf pertama judul). */
export function coverInitial(title: string): string {
  const trimmed = title.trim();
  if (trimmed === "") return "?";
  const first = [...trimmed][0] ?? "?";
  return first.toUpperCase();
}

/** Lima kontributor teratas untuk panel samping (masukan sudah terurut API). */
export function topContributors(
  contributors: readonly ContributorSummary[],
  limit = 5,
): ContributorSummary[] {
  return contributors.slice(0, Math.max(0, limit));
}

/** Lebar batang mini kontributor: totalnya relatif terhadap yang teratas. */
export function contributorBarPercent(contributor: ContributorSummary, topTotal: number): number {
  if (topTotal <= 0) return 0;
  return Math.min(100, Math.round((contributor.total / topTotal) * 100));
}
