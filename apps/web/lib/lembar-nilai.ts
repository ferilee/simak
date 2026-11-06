// Helper murni untuk "Lembar Nilai" (Langkah 5, halaman guru): rincian
// penilaian pengumpulan kini membuka sebagai lembar (modal) di atas
// daftar, dan guru berpindah antar pengumpulan tanpa kembali ke daftar.
// Keputusan perpindahannya dipisah dari komponen React supaya bisa diuji
// langsung dengan bun.
//
// Daftar yang dinavigasi diabstraksi menjadi { id, graded }[] menurut
// URUTAN TAMPIL daftar panel (sudah disaring + diurutkan). Makna
// "graded" di sini: entri BUKAN lagi antrean nilai — nilainya sudah
// tuntas (total terisi) ATAU pengumpulannya masih draf (belum bisa
// dinilai). Yang masih antre adalah kebalikannya, persis predikat
// isUngradedAttempt pada lib/grading-helpers (terkumpul + total kosong)
// yang juga dipakai hitungan "Belum dinilai" panel dan tab.

export type GradingSheetEntry = {
  id: number;
  graded: boolean;
};

/** Indeks tetangga satu langkah dari posisi entri saat ini; null di ujung daftar atau bila entri tidak ditemukan. */
export function neighborIndex(entries: readonly GradingSheetEntry[], currentId: number, direction: "prev" | "next"): number | null {
  const index = entries.findIndex((entry) => entry.id === currentId);
  if (index < 0) return null;
  const target = direction === "next" ? index + 1 : index - 1;
  return target >= 0 && target < entries.length ? target : null;
}

/**
 * Indeks pengumpulan berikutnya yang masih antre nilai SESUDAH posisi
 * entri saat ini (entri yang sudah tuntas/draf dilewati). Bila entri
 * saat ini tidak ada di daftar (mis. baru saja tersaring keluar karena
 * selesai dinilai), pencarian mulai dari awal daftar — meniru pemilih
 * antrean lama pickNextUngradedAttempt. -1 bila tidak ada lagi.
 */
export function nextUngradedIndex(entries: readonly GradingSheetEntry[], currentId: number): number {
  const start = entries.findIndex((entry) => entry.id === currentId);
  for (let index = start + 1; index < entries.length; index++) {
    if (!entries[index].graded) return index;
  }
  return -1;
}

/**
 * Baris kemajuan di kepala lembar: posisi 1-based entri saat ini dari
 * seluruh daftar tampil, plus sisa yang masih antre nilai pada daftar
 * yang sama. Null bila entri saat ini tidak ada di daftar (keadaan
 * sesaat sesudah saringan berubah) — pemanggil menyembunyikan barisnya.
 */
export function progressLabel(entries: readonly GradingSheetEntry[], currentId: number): string | null {
  const index = entries.findIndex((entry) => entry.id === currentId);
  if (index < 0) return null;
  const remaining = entries.filter((entry) => !entry.graded).length;
  return `Pengumpulan ${index + 1} dari ${entries.length} · ${remaining} belum dinilai`;
}
