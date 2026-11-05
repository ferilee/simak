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
  owner_name: string;
  shared_at: string | null;
  sudah_disalin?: boolean;
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
