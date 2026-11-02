// Helper murni untuk panel "Pengumpulan LKPD" (Langkah 5, halaman guru):
// hitungan ringkas, urutan antrean penilaian, pemilih pengumpulan berikutnya
// yang belum dinilai, total nilai sementara, dan nilai cepat per soal.
// Dipisah dari komponen React supaya bisa diuji langsung dengan bun.
//
// Catatan keadaan attempt dari API: status "draf" (belum dikumpulkan),
// "terkumpul" (sudah dikumpulkan, total_score masih null), dan "dinilai"
// (sudah dinilai, total_score terisi — status digeser server saat nilai
// disimpan). Jadi "sudah terkumpul" mencakup status terkumpul DAN dinilai.

export type GradingAttemptLike = {
  id: number;
  status: string;
  total_score: number | null;
  worksheet_id?: number;
};

export type GradingCounts = {
  terkumpul: number;
  belumDinilai: number;
  sudahDinilai: number;
};

/** Sudah dikumpulkan tetapi belum punya nilai — antrean kerja penilaian. */
export function isUngradedAttempt(attempt: GradingAttemptLike): boolean {
  return attempt.status === "terkumpul" && attempt.total_score === null;
}

/** Sudah dinilai: total nilai terisi (status server menjadi "dinilai"). */
export function isGradedAttempt(attempt: GradingAttemptLike): boolean {
  return attempt.total_score !== null;
}

/** Sudah dikumpulkan, apa pun keadaan nilainya (terkumpul atau dinilai). */
export function isSubmittedAttempt(attempt: GradingAttemptLike): boolean {
  return attempt.status === "terkumpul" || attempt.status === "dinilai";
}

export function countGradingAttempts(attempts: GradingAttemptLike[]): GradingCounts {
  return {
    terkumpul: attempts.filter(isSubmittedAttempt).length,
    belumDinilai: attempts.filter(isUngradedAttempt).length,
    sudahDinilai: attempts.filter(isGradedAttempt).length,
  };
}

/**
 * Kelompok urutan antrean: 0 = belum dinilai, 1 = draf, 2 = sudah dinilai.
 * Sisa keadaan yang tidak lazim (mis. status "dinilai" tanpa total) jatuh ke
 * kelompok terakhir supaya tidak menyusup ke antrean belum dinilai.
 */
export function gradingGroupIndex(attempt: GradingAttemptLike): number {
  if (isUngradedAttempt(attempt)) return 0;
  if (attempt.status === "draf") return 1;
  return 2;
}

/**
 * Urutan tampilan panel: belum dinilai dulu, lalu draf, terakhir yang sudah
 * dinilai. Stabil — urutan masuk (API: updated_at menurun) dipertahankan di
 * dalam kelompok yang sama. Tidak mengubah array asal.
 */
export function sortGradingAttempts<T extends GradingAttemptLike>(attempts: T[]): T[] {
  return attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort((a, b) => gradingGroupIndex(a.attempt) - gradingGroupIndex(b.attempt) || a.index - b.index)
    .map((entry) => entry.attempt);
}

/**
 * Pengumpulan berikutnya yang masih belum dinilai menurut urutan tampilan,
 * melewati attempt yang baru saja disimpan (excludeId). Karena yang belum
 * dinilai selalu terurut paling depan, kandidatnya adalah yang pertama
 * ditemukan dari awal daftar. Null bila tidak ada lagi.
 */
export function pickNextUngradedAttempt<T extends GradingAttemptLike>(displayList: T[], excludeId: number | null): T | null {
  return displayList.find((attempt) => attempt.id !== excludeId && isUngradedAttempt(attempt)) ?? null;
}

/** Saringan status panel (sama seperti yang dipakai daftar di halaman guru). */
export function matchesGradingStatusFilter(attempt: GradingAttemptLike, filter: string): boolean {
  if (filter === "draf") return attempt.status === "draf";
  if (filter === "terkumpul") return attempt.status === "terkumpul";
  if (filter === "belum_dinilai") return isUngradedAttempt(attempt);
  if (filter === "sudah_dinilai") return isGradedAttempt(attempt);
  return true;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Format angka nilai seperti tampilan "Nilai {total_score}" di daftar: maksimal 2 desimal, tanpa nol ekor. */
export function formatScoreValue(value: number): string {
  return String(roundScore(value));
}

/**
 * Total sementara dari draf nilai yang sedang diketik: draf kosong atau
 * bukan angka dihitung 0. Mengembalikan { current, max } yang sudah dibulatkan
 * ke 2 desimal.
 */
export function runningTotal(
  items: { id: number; points: number }[],
  drafts: Record<number, string | undefined>,
): { current: number; max: number } {
  let current = 0;
  let max = 0;
  for (const item of items) {
    max += item.points;
    const raw = drafts[item.id]?.trim() ?? "";
    if (raw !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) current += parsed;
    }
  }
  return { current: roundScore(current), max: roundScore(max) };
}

/** Nilai draf untuk tombol cepat per soal: nol, setengah poin (2 desimal), dan poin penuh. */
export function quickScoreDrafts(points: number): { zero: string; half: string; full: string } {
  return {
    zero: "0",
    half: formatScoreValue(points / 2),
    full: formatScoreValue(points),
  };
}
