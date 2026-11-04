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
  class_id?: number | null;
  class_name?: string | null;
  student_name?: string;
  is_group?: boolean;
  group_id?: number | null;
  group_name?: string | null;
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

// --- Urutan tampilan panel (Urutan Pengumpulan, v1.0.38) ---
// Permintaan guru: pengumpulan kelompok tampil menaik menurut nomor
// kelompoknya (Kelompok 1, 2, 3, …), pengumpulan individu menurut abjad
// nama murid. Attempt kelompok selalu sebelum individu (hanya terasa pada
// LKPD campuran; daftar murni tidak berubah polanya). Keadaan penilaian
// TIDAK lagi menggeser urutan — status tetap terlihat pada kartu dan
// saringan status tetap bekerja sebagai saringan, bukan pengurut.

/** Attempt kelompok? Kedua sumber daftar API menandai is_group / group_id. */
export function isGroupGradingAttempt(attempt: GradingAttemptLike): boolean {
  return attempt.is_group === true || (attempt.group_id !== null && attempt.group_id !== undefined);
}

/**
 * Nomor urut kelompok dari nama kelompoknya: angka terakhir pada nama
 * ("Kelompok 12" → 12, supaya pengurutan numerik — bukan leksikografis).
 * Untuk attempt kelompok API juga mengisi student_name dengan nama
 * kelompok, jadi itu cadangan bacanya bila group_name kosong. Null bila
 * attempt bukan kelompok atau namanya tidak mengandung angka.
 */
export function groupSortNumber(attempt: GradingAttemptLike): number | null {
  if (!isGroupGradingAttempt(attempt)) return null;
  const name = (attempt.group_name ?? attempt.student_name ?? "").trim();
  const match = /(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Banding dua attempt kelompok: nomor kelompok menaik; yang bernomor
 * sebelum yang tidak bernomor; tanpa nomor bernama, id kelompok menaik;
 * keduanya tidak dikenal → 0 (urutan masuk dipertahankan pemanggil).
 */
function compareGroupAttempts(a: GradingAttemptLike, b: GradingAttemptLike): number {
  const numberA = groupSortNumber(a);
  const numberB = groupSortNumber(b);
  if (numberA !== null && numberB !== null && numberA !== numberB) return numberA - numberB;
  if (numberA !== null && numberB === null) return -1;
  if (numberA === null && numberB !== null) return 1;
  const idA = a.group_id ?? null;
  const idB = b.group_id ?? null;
  if (idA !== null && idB !== null && idA !== idB) return idA - idB;
  if (idA !== null && idB === null) return -1;
  if (idA === null && idB !== null) return 1;
  return 0;
}

/**
 * Urutan tampilan panel: attempt kelompok dulu (nomor kelompok menaik),
 * lalu attempt individu (nama murid A–Z dengan locale "id", sama seperti
 * pengurutan nama lain di aplikasi ini). Nama yang sama mempertahankan
 * urutan masuk, lalu id attempt sebagai penentu terakhir. Tidak mengubah
 * array asal.
 */
export function sortGradingAttempts<T extends GradingAttemptLike>(attempts: T[]): T[] {
  return attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort((x, y) => {
      const a = x.attempt;
      const b = y.attempt;
      const groupA = isGroupGradingAttempt(a);
      const groupB = isGroupGradingAttempt(b);
      if (groupA !== groupB) return groupA ? -1 : 1;
      if (groupA) {
        const byGroup = compareGroupAttempts(a, b);
        if (byGroup !== 0) return byGroup;
      } else {
        const byName = (a.student_name ?? "").localeCompare(b.student_name ?? "", "id");
        if (byName !== 0) return byName;
      }
      return x.index - y.index || a.id - b.id;
    })
    .map((entry) => entry.attempt);
}

/**
 * Pengumpulan berikutnya yang masih belum dinilai menurut urutan tampilan
 * (nomor kelompok / abjad nama), melewati attempt yang baru saja disimpan
 * (excludeId): kandidatnya adalah yang pertama ditemukan dari awal daftar
 * tampil. Null bila tidak ada lagi.
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

// --- Saringan kelas ---
// API menempelkan kelas murid pada setiap attempt (class_id/class_name;
// null = murid belum masuk kelas guru mana pun, ditampilkan "Tanpa
// kelas"). Nilai saringan: "semua", "tanpa_kelas", atau id kelas sebagai
// string (nilai bawaan elemen <select>).

export type GradingClassOption = {
  id: number | null;
  name: string;
};

/** Nilai saringan untuk satu opsi kelas: id sebagai string, atau "tanpa_kelas". */
export function gradingClassFilterValue(option: GradingClassOption): string {
  return option.id === null ? "tanpa_kelas" : String(option.id);
}

/**
 * Kelas-kelas berbeda yang benar-benar muncul pada daftar sumber aktif,
 * terurut menurut nama; "Tanpa kelas" (id null) selalu paling akhir dan
 * hanya muncul bila ada attempt tanpa kelas.
 */
export function distinctGradingClasses(attempts: GradingAttemptLike[]): GradingClassOption[] {
  const byId = new Map<number, string>();
  let hasClassless = false;
  for (const attempt of attempts) {
    if (attempt.class_id === null || attempt.class_id === undefined) {
      hasClassless = true;
    } else if (!byId.has(attempt.class_id)) {
      byId.set(attempt.class_id, attempt.class_name ?? "");
    }
  }
  const options: GradingClassOption[] = [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  if (hasClassless) options.push({ id: null, name: "Tanpa kelas" });
  return options;
}

/** Cocok tidaknya satu attempt dengan saringan kelas terpilih. */
export function matchesGradingClassFilter(attempt: GradingAttemptLike, filter: string): boolean {
  if (filter === "semua") return true;
  if (filter === "tanpa_kelas") return attempt.class_id === null || attempt.class_id === undefined;
  return attempt.class_id === Number(filter);
}

/** Terapkan saringan kelas pada daftar sumber (tahap sesudah sumber, sebelum status). */
export function filterGradingAttemptsByClass<T extends GradingAttemptLike>(attempts: T[], filter: string): T[] {
  return attempts.filter((attempt) => matchesGradingClassFilter(attempt, filter));
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

// --- Penilaian cicilan (Penilaian Rapi, v1.0.34) ---
// Skor tiap butir kini tersimpan seketika di server; selama belum semua
// butir berskor, total attempt tetap kosong dan panel menampilkan penanda
// kemajuan "Dinilai X dari Y butir" — di kartu daftar maupun di kepala
// rincian penilaian.

/**
 * Label kemajuan penilaian cicilan; null bila belum ada butir yang dinilai
 * atau jumlah butir tidak diketahui (kartu lalu menampilkan "Belum dinilai"
 * seperti sebelumnya).
 */
export function gradingProgressLabel(gradedCount: number, totalItems: number): string | null {
  if (!Number.isFinite(gradedCount) || !Number.isFinite(totalItems)) return null;
  if (totalItems <= 0 || gradedCount <= 0) return null;
  return `Dinilai ${gradedCount} dari ${totalItems} butir`;
}

// --- Warna chip nilai cepat (Penilaian Rapi, v1.0.34) ---
// Chip yang AKTIF pada satu butir dibedakan warnanya menurut nilai yang
// dipilih: 0 = putih, ½ = gradasi putih–biru, Penuh = hijau. Skor manual
// yang tidak sama persis dengan salah satu nilai chip tidak menandai chip
// mana pun (perilaku lama).

export type QuickScoreChipKind = "zero" | "half" | "full";

/** Chip nilai cepat yang aktif untuk skor saat ini; null bila tidak ada. */
export function activeQuickScoreChip(score: number | null, points: number): QuickScoreChipKind | null {
  if (score === null || !Number.isFinite(score) || !Number.isFinite(points) || points <= 0) return null;
  const rounded = roundScore(score);
  if (rounded === 0) return "zero";
  if (rounded === roundScore(points)) return "full";
  if (rounded === roundScore(points / 2)) return "half";
  return null;
}

// --- Tampilkan bertahap (progressive reveal) daftar pengumpulan ---
// Sengaja bukan halaman bernomor: antrean penilaian (lompat otomatis ke
// yang belum dinilai berikutnya) tidak boleh bertabrakan dengan batas
// halaman. Daftar dirender sebanyak `revealedCount` item pertama dari
// daftar akhir (sudah disaring + diurutkan); tombol "Tampilkan lebih
// banyak" menambah satu halaman, dan lompat otomatis memperluas tampilan
// sampai targetnya ikut terlihat.

export const GRADING_PAGE_SIZE = 20;

/** Jumlah item yang benar-benar tampil: revealedCount dibatasi total daftar. */
export function revealedSliceCount(total: number, revealedCount: number): number {
  return Math.max(0, Math.min(total, revealedCount));
}

/** Jumlah tampil sesudah satu kali "Tampilkan lebih banyak". */
export function nextRevealedCount(current: number, pageSize: number = GRADING_PAGE_SIZE): number {
  return current + pageSize;
}

/**
 * Jumlah tampil terkecil (kelipatan ukuran halaman) yang membuat indeks
 * tertentu (0-based) pada daftar akhir ikut terlihat — dipakai lompat
 * otomatis penilaian agar target berikutnya tidak berada di luar lipatan.
 */
export function revealedCountForIndex(index: number, pageSize: number = GRADING_PAGE_SIZE): number {
  if (index < 0) return pageSize;
  return (Math.floor(index / pageSize) + 1) * pageSize;
}
