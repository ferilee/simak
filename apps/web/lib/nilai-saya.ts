// Penanda "Baru" untuk halaman Nilai Saya murid (v1.0.35): nilai yang
// terbit SESUDAH kunjungan terakhir murid ke halaman Nilai Saya diberi
// chip "Baru" selama kunjungan berikutnya.
//
// Keadaan "kunjungan terakhir" sengaja hanya hidup di perangkat murid
// (localStorage) — bukan migrasi, bukan tabel: penanda ini murni penanda
// baca di klien, jadi hilang bila murid berganti perangkat adalah perilaku
// yang dapat diterima dan disengaja. Halaman Nilai Saya MEMBACA baseline
// untuk memutuskan chip, lalu MEMAJUKANNYA ke waktu sekarang sesudah
// keputusan render diambil (chip tetap tampil sepanjang kunjungan itu dan
// bersih pada kunjungan berikutnya). Beranda murid hanya MEMBACA baseline
// yang sama untuk titik penanda — tidak pernah memajukannya, supaya titik
// tidak padam sebelum murid benar-benar membuka halaman Nilai Saya.
//
// Kunjungan pertama sama sekali (baseline belum ada): tidak ada chip —
// kunjungan itu sendiri yang menetapkan baseline.

export const NILAI_SAYA_LAST_VISIT_KEY = "simak:nilai-saya:last-visit";

export type NilaiSayaRowLike = {
  assignment_id: number;
  graded_at: string;
};

export type BaruDecision = {
  /** Id penugasan yang barisnya mendapat chip "Baru" pada kunjungan ini. */
  baruIds: Set<number>;
  /** Baseline yang disimpan untuk kunjungan berikutnya (ISO). */
  nextBaseline: string;
};

/**
 * Keputusan penanda "Baru" (murni): baris yang graded_at-nya KETAT sesudah
 * baseline ditandai; yang tepat sama dengan baseline tidak (sudah terlihat
 * pada kunjungan yang menetapkan baseline itu). Baseline kosong atau rusak
 * diperlakukan sebagai kunjungan pertama: tanpa tanda.
 */
export function decideBaruMarkers(
  rows: readonly NilaiSayaRowLike[],
  baselineIso: string | null,
  now: Date,
): BaruDecision {
  const nextBaseline = now.toISOString();
  if (baselineIso === null) return { baruIds: new Set(), nextBaseline };
  const baselineMs = Date.parse(baselineIso);
  if (Number.isNaN(baselineMs)) return { baruIds: new Set(), nextBaseline };
  const baruIds = new Set<number>();
  for (const row of rows) {
    const gradedMs = Date.parse(row.graded_at);
    if (!Number.isNaN(gradedMs) && gradedMs > baselineMs) baruIds.add(row.assignment_id);
  }
  return { baruIds, nextBaseline };
}

/** Baca baseline kunjungan terakhir; null bila belum ada atau penyimpanan tidak tersedia. */
export function readNilaiSayaBaseline(): string | null {
  try {
    return window.localStorage.getItem(NILAI_SAYA_LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

/** Simpan baseline baru; kegagalan penyimpanan diabaikan (penanda hanya kosmetik). */
export function writeNilaiSayaBaseline(value: string): void {
  try {
    window.localStorage.setItem(NILAI_SAYA_LAST_VISIT_KEY, value);
  } catch {
    // Abaikan — tanpa penyimpanan, kunjungan berikutnya dianggap pertama.
  }
}
