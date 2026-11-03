// Kemajuan penilaian per butir untuk attempt LKPD (Penilaian Rapi,
// v1.0.34): penilaian kini bisa dicicil — skor + catatan tiap butir
// tersimpan seketika, dan total attempt hanya terisi bila SEMUA butir
// sudah punya skor. Fungsi di sini murni (tanpa basis data) supaya aturan
// penyelesaiannya bisa diuji langsung.
//
// Aturan penyelesaian meniru persis simpan menyeluruh yang sudah ada
// (PATCH /worksheets/:id/attempts/:attemptId): total adalah jumlah skor
// semua butir, dan attempt menjadi "dinilai" hanya pada keadaan lengkap.
// Selama belum lengkap total tetap null dan status tidak berubah — kecuali
// attempt yang sebelumnya "dinilai" kehilangan kelengkapannya (sebuah
// skor dihapus), yang dikembalikan ke "terkumpul" agar keadaan "dinilai"
// selalu berarti semua butir berskorn dan total terisi.

export type GradingProgress = {
  /** Jumlah butir yang sudah mempunyai skor (non-null). */
  gradedCount: number;
  /** Jumlah seluruh butir LKPD yang dinilai. */
  totalItems: number;
  /** Lengkap bila ada minimal satu butir dan semuanya sudah berskor. */
  complete: boolean;
  /** Jumlah skor semua butir bila lengkap; null selama belum lengkap. */
  totalScore: number | null;
};

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Hitung kemajuan dari peta skor per butir. Butir tanpa baris jawaban —
 * atau barisnya berskor null — dihitung belum dinilai; butir di luar
 * daftar `itemIds` (tidak mungkin lewat route, tapi aman) diabaikan.
 */
export function computeGradingProgress(
  itemIds: readonly number[],
  scoresByItem: ReadonlyMap<number, number | null>,
): GradingProgress {
  let gradedCount = 0;
  let sum = 0;
  for (const itemId of itemIds) {
    const score = scoresByItem.get(itemId);
    if (score !== null && score !== undefined) {
      gradedCount++;
      sum += score;
    }
  }
  const totalItems = itemIds.length;
  const complete = totalItems > 0 && gradedCount === totalItems;
  return {
    gradedCount,
    totalItems,
    complete,
    totalScore: complete ? roundScore(sum) : null,
  };
}

/**
 * Hitung jumlah jawaban berskor per attempt dari baris jawaban yang sudah
 * disaring non-null oleh pemanggil — untuk penanda kemajuan "Dinilai X
 * dari Y butir" pada daftar pengumpulan.
 */
export function countGradedByAttempt(
  rows: readonly { attemptId: number }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.attemptId, (counts.get(row.attemptId) ?? 0) + 1);
  }
  return counts;
}

export type WorksheetAttemptStatus = "draf" | "terkumpul" | "dinilai";

/**
 * Status attempt sesudah sebuah skor butir disimpan. Lengkap → "dinilai";
 * sebelumnya "dinilai" tetapi tak lagi lengkap → kembali "terkumpul";
 * selain itu status dipertahankan apa adanya.
 */
export function gradingStatusAfterItemSave(
  currentStatus: WorksheetAttemptStatus,
  progress: GradingProgress,
): WorksheetAttemptStatus {
  if (progress.complete) return "dinilai";
  if (currentStatus === "dinilai") return "terkumpul";
  return currentStatus;
}
