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

// ---------------------------------------------------------------------------
// Rombak tampilan Nilai Saya (v1.0.64): helper murni untuk kepala ringkasan
// dan perona angka nilai. Murni kosmetik — baris mana yang tampil tetap
// diputuskan server (lib/nilai-saya di API); di sini hanya warna dan
// rata-rata dari baris yang SUDAH diterima halaman.

/** Nada warna angka nilai: ≥80 hijau, 60–79 kuning, <60 merah lembut. */
export type GradeScoreTone = "hijau" | "kuning" | "merah";

export function gradeScoreTone(score: number): GradeScoreTone {
  if (score >= 80) return "hijau";
  if (score >= 60) return "kuning";
  return "merah";
}

export type GradeSummary = {
  /** Banyaknya nilai terbit yang terhitung (baris berskor akhir). */
  count: number;
  /** Rata-rata nilai akhir, dibulatkan ke 1 desimal; null bila kosong. */
  average: number | null;
};

/**
 * Ringkasan kepala halaman Nilai Saya dari baris yang sudah diterima.
 * Nilai akhir per kartu adalah `score` baris itu sendiri: untuk kartu
 * kelompok bersesuaian guru, server sudah mengisi `score` dengan nilai
 * penyesuaian murid ini; selain itu `score` adalah nilai LKPD / nilai
 * kelompok kartu itu. Baris tanpa skor (tidak pernah diterbitkan server
 * untuk halaman ini) dilewati dari hitungan maupun rata-rata.
 */
export function summarizeGrades(
  rows: readonly { score: number | null }[],
): GradeSummary {
  const scores = rows
    .map((row) => row.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  if (scores.length === 0) return { count: 0, average: null };
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return { count: scores.length, average: Math.round(mean * 10) / 10 };
}
