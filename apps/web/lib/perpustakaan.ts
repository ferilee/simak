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
  block_count?: number;
  shared_worksheet_count?: number;
  item_count?: number;
  total_points?: number;
};

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
