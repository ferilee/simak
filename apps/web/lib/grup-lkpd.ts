// Helper murni untuk pemilih LKPD pada panel "Pengumpulan LKPD" (Langkah 5
// "Pantau hasil", halaman guru) — Paket A: saringan bertingkat dari kelas,
// dropdown berkelompok, dan arsip terpisah. Dipisah dari komponen React
// supaya bisa diuji langsung dengan bun (pola yang sama seperti
// grading-helpers.ts).
//
// Sumber data — semuanya sudah termuat di halaman guru, tanpa endpoint
// atau field API baru:
// - Kelompok dropdown berasal dari modul pasangan LKPD: subject +
//   topic_group modul menjadi label "Mapel — Kelompok Materi". LKPD tanpa
//   modul pasangan (module_id kosong / modulnya tidak ditemukan) masuk
//   kelompok "Lainnya".
// - Relasi kelas → LKPD dirangkai dari dua sumber yang sudah ada:
//   (1) penugasan yang menargetkan kelas itu — assignments.classes memuat
//   id kelas sasaran; penugasan sasaran siswa dihitung lewat class_name
//   murid sasarannya yang dicocokkan ke daftar kelas guru; dan
//   (2) pengumpulan nyata dari murid kelas itu — attempt gabungan membawa
//   worksheet_id + class_id. Jalur (2) menjaga LKPD lama yang
//   penugasannya sudah berubah/hilang tetap bisa ditemukan dari kelas
//   murid pengumpulnya.
// - Arsip: modul pasangan berstatus "arsip", LKPD-nya sendiri berstatus
//   "arsip", atau judul (LKPD/modul) mengandung "Arsip" — selalu masuk
//   kelompok terakhir "Arsip Lama", apa pun mapelnya.

export type LkpdOptionWorksheetLike = {
  id: number;
  title: string;
  module_id: number | null;
  status?: string | null;
};

export type LkpdOptionModuleLike = {
  id: number;
  title: string;
  subject: string;
  topic_group: string | null;
  status?: string | null;
};

export type LkpdOptionGroup = {
  label: string;
  worksheets: LkpdOptionWorksheetLike[];
};

export const LKPD_ARCHIVE_GROUP_LABEL = "Arsip Lama";
export const LKPD_OTHER_GROUP_LABEL = "Lainnya";

/** Nomor ATP dari teks judul: pola "ATP x.y" (huruf besar/kecil bebas). Null bila tidak ada. */
export function parseAtpNumber(text: string | null | undefined): { major: number; minor: number } | null {
  if (!text) return null;
  const match = /ATP\s+(\d+)\.(\d+)/i.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * Nomor ATP efektif satu LKPD: judul LKPD didahulukan (pola judul baku
 * "LKPD ATP x.y — …"), judul modul pasangan menjadi cadangan (pola
 * "… (ATP x.y)").
 */
export function lkpdAtpNumber(
  worksheet: LkpdOptionWorksheetLike,
  module: LkpdOptionModuleLike | null,
): { major: number; minor: number } | null {
  return parseAtpNumber(worksheet.title) ?? parseAtpNumber(module?.title);
}

/**
 * LKPD arsip: modul pasangannya terarsip, LKPD-nya sendiri terarsip, atau
 * judul LKPD/modulnya mengandung "Arsip" (mis. warisan "LKPD A — …
 * (Arsip Lama)"). Arsip selalu tampil di kelompok terakhir, terpisah dari
 * kelompok mapelnya.
 */
export function isArchivedLkpd(
  worksheet: LkpdOptionWorksheetLike,
  module: LkpdOptionModuleLike | null,
): boolean {
  if (worksheet.status === "arsip" || module?.status === "arsip") return true;
  if (/arsip/i.test(worksheet.title)) return true;
  return module !== null && /arsip/i.test(module.title);
}

/** Label kelompok satu LKPD dari modul pasangannya: "Mapel — Kelompok Materi". */
export function lkpdGroupLabel(module: LkpdOptionModuleLike | null): string {
  if (!module) return LKPD_OTHER_GROUP_LABEL;
  const subject = module.subject.trim();
  if (subject === "") return LKPD_OTHER_GROUP_LABEL;
  const topic = (module.topic_group ?? "").trim();
  return topic === "" ? subject : `${subject} — ${topic}`;
}

/**
 * Banding dua LKPD dalam satu kelompok: yang bernomor ATP dulu, menaik
 * menurut nomor ATP (major lalu minor); sisanya menurut abjad judul
 * (locale "id"); judul sama → id menaik agar urutannya stabil.
 */
function compareLkpdOptions(
  a: LkpdOptionWorksheetLike,
  b: LkpdOptionWorksheetLike,
  moduleById: ReadonlyMap<number, LkpdOptionModuleLike>,
): number {
  const moduleA = a.module_id !== null ? moduleById.get(a.module_id) ?? null : null;
  const moduleB = b.module_id !== null ? moduleById.get(b.module_id) ?? null : null;
  const atpA = lkpdAtpNumber(a, moduleA);
  const atpB = lkpdAtpNumber(b, moduleB);
  if (atpA !== null && atpB !== null) {
    if (atpA.major !== atpB.major) return atpA.major - atpB.major;
    if (atpA.minor !== atpB.minor) return atpA.minor - atpB.minor;
  } else if (atpA !== null) {
    return -1;
  } else if (atpB !== null) {
    return 1;
  }
  const byTitle = a.title.localeCompare(b.title, "id");
  return byTitle !== 0 ? byTitle : a.id - b.id;
}

/**
 * Ember pengelompokan LKPD menurut aturan bersama: label dari modul
 * pasangan (lkpdGroupLabel), arsip (isArchivedLkpd) selalu ke ember
 * "Arsip Lama". Dipakai bersama oleh pemilih Langkah 5 dan daftar
 * berkelompok Langkah 2 agar aturannya tidak menyimpang.
 */
function bucketLkpdByGroup<T extends LkpdOptionWorksheetLike>(
  worksheets: readonly T[],
  modules: readonly LkpdOptionModuleLike[],
): Map<string, T[]> {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const buckets = new Map<string, T[]>();
  for (const worksheet of worksheets) {
    const module = worksheet.module_id !== null ? moduleById.get(worksheet.module_id) ?? null : null;
    const label = isArchivedLkpd(worksheet, module) ? LKPD_ARCHIVE_GROUP_LABEL : lkpdGroupLabel(module);
    const bucket = buckets.get(label) ?? [];
    bucket.push(worksheet);
    buckets.set(label, bucket);
  }
  return buckets;
}

/** Urutan label kelompok: abjad (locale "id"), "Arsip Lama" selalu paling akhir. */
function orderedGroupLabels(buckets: ReadonlyMap<string, unknown>): string[] {
  const labels = [...buckets.keys()]
    .filter((label) => label !== LKPD_ARCHIVE_GROUP_LABEL)
    .sort((a, b) => a.localeCompare(b, "id"));
  if (buckets.has(LKPD_ARCHIVE_GROUP_LABEL)) labels.push(LKPD_ARCHIVE_GROUP_LABEL);
  return labels;
}

/**
 * Kelompokkan daftar LKPD untuk dirender sebagai <optgroup>: kelompok
 * mapel terurut abjad labelnya, "Arsip Lama" selalu paling akhir, dan
 * kelompok kosong tidak ditampilkan. Tidak mengubah array asal.
 */
export function groupLkpdOptions(
  worksheets: readonly LkpdOptionWorksheetLike[],
  modules: readonly LkpdOptionModuleLike[],
): LkpdOptionGroup[] {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const buckets = bucketLkpdByGroup(worksheets, modules);
  return orderedGroupLabels(buckets).map((label) => ({
    label,
    worksheets: [...(buckets.get(label) ?? [])].sort((a, b) => compareLkpdOptions(a, b, moduleById)),
  }));
}

// --- Saringan bertingkat kelas → LKPD ---
// Nilai saringan mengikuti saringan kelas panel yang sudah ada:
// "semua", "tanpa_kelas", atau id kelas sebagai string.

export type LkpdClassAssignmentLike = {
  worksheet_id: number | null;
  classes: { id: number }[];
  students?: { class_name: string }[];
};

export type LkpdClassAttemptLike = {
  worksheet_id?: number;
  class_id?: number | null;
};

/**
 * Himpunan id LKPD yang relevan untuk nilai saringan kelas terpilih:
 * gabungan LKPD penugasan yang menargetkan kelas itu dan LKPD yang punya
 * pengumpulan dari murid kelas itu. Mengembalikan null bila saringannya
 * "semua" (atau nilainya tidak dikenal) — artinya jangan menyaring.
 * Untuk "tanpa_kelas" hanya jalur pengumpulan yang berlaku (penugasan
 * selalu menargetkan kelas/siswa berkelas).
 */
export function worksheetIdsForClassFilter(
  filter: string,
  assignments: readonly LkpdClassAssignmentLike[],
  attempts: readonly LkpdClassAttemptLike[],
  classes: readonly { id: number; name: string }[] = [],
): Set<number> | null {
  if (filter === "semua") return null;
  const ids = new Set<number>();
  if (filter === "tanpa_kelas") {
    for (const attempt of attempts) {
      if ((attempt.class_id === null || attempt.class_id === undefined) && attempt.worksheet_id !== undefined) {
        ids.add(attempt.worksheet_id);
      }
    }
    return ids;
  }
  const classId = Number(filter);
  if (!Number.isFinite(classId)) return null;
  const className = classes.find((kelas) => kelas.id === classId)?.name ?? null;
  for (const assignment of assignments) {
    if (assignment.worksheet_id === null) continue;
    if (assignment.classes.some((kelas) => kelas.id === classId)) {
      ids.add(assignment.worksheet_id);
    } else if (className !== null && (assignment.students ?? []).some((student) => student.class_name === className)) {
      ids.add(assignment.worksheet_id);
    }
  }
  for (const attempt of attempts) {
    if (attempt.class_id === classId && attempt.worksheet_id !== undefined) {
      ids.add(attempt.worksheet_id);
    }
  }
  return ids;
}

/** Terapkan himpunan id hasil saringan kelas pada daftar LKPD; null = tanpa saringan. */
export function filterWorksheetsByIds<T extends { id: number }>(
  worksheets: readonly T[],
  ids: ReadonlySet<number> | null,
): T[] {
  if (ids === null) return [...worksheets];
  return worksheets.filter((worksheet) => ids.has(worksheet.id));
}

/**
 * Sumber panel yang berlaku sesudah saringan kelas diterapkan: LKPD
 * terpilih yang tersaring keluar gugur kembali ke "semua" ("Semua LKPD").
 * Tanpa saringan (ids null) sumber tidak berubah.
 */
export function resolveGradingSource(
  source: number | "semua",
  visibleIds: ReadonlySet<number> | null,
): number | "semua" {
  if (source === "semua" || visibleIds === null) return source;
  return visibleIds.has(source) ? source : "semua";
}

// --- Langkah 2 "Siapkan LKPD": daftar kartu berkelompok + dropdown modul ---
// Aturan pengelompokannya sama persis dengan pemilih Langkah 5 di atas
// (ember + urutan label bersama): label "Mapel — Kelompok Materi" dari
// modul pasangan, arsip selalu kelompok terakhir "Arsip Lama", kelompok
// kosong tidak dirender. Bedanya hanya urutan DI DALAM kelompok untuk
// daftar kartu: dropdown urutan Langkah 2 yang sudah ada ("Terakhir
// diubah" / "Judul A–Z" / "Paling banyak dikerjakan") kini berlaku per
// kelompok, dengan urutan kanonis ATP (compareLkpdOptions) sebagai
// penentu seri — jadi makna kontrolnya tidak berubah, hanya lingkupnya
// menyempit dari daftar datar menjadi per seksi.

export type LkpdListSortMode = "terbaru" | "judul" | "dikerjakan";

export type LkpdListWorksheetLike = LkpdOptionWorksheetLike & {
  started_count?: number | null;
  updated_at?: string | null;
};

export type LkpdListGroup<T extends LkpdListWorksheetLike = LkpdListWorksheetLike> = {
  label: string;
  worksheets: T[];
};

function lkpdUpdatedValue(worksheet: LkpdListWorksheetLike): number {
  const time = worksheet.updated_at ? new Date(worksheet.updated_at).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function compareLkpdListItems<T extends LkpdListWorksheetLike>(
  a: T,
  b: T,
  sort: LkpdListSortMode,
  moduleById: ReadonlyMap<number, LkpdOptionModuleLike>,
): number {
  if (sort === "judul") {
    const byTitle = a.title.localeCompare(b.title, "id");
    if (byTitle !== 0) return byTitle;
  } else if (sort === "dikerjakan") {
    const byStarted = (b.started_count ?? 0) - (a.started_count ?? 0);
    if (byStarted !== 0) return byStarted;
    const byTitle = a.title.localeCompare(b.title, "id");
    if (byTitle !== 0) return byTitle;
  } else {
    const byUpdated = lkpdUpdatedValue(b) - lkpdUpdatedValue(a);
    if (byUpdated !== 0) return byUpdated;
  }
  return compareLkpdOptions(a, b, moduleById);
}

/**
 * Kelompokkan daftar LKPD Langkah 2 (yang sudah tersaring oleh
 * pencarian/status/modul) menjadi seksi-seksi untuk dirender: label dan
 * urutan kelompok mengikuti aturan bersama, isi tiap kelompok diurutkan
 * menurut mode urutan Langkah 2 yang aktif. Kelompok yang kosong
 * sesudah penyaringan tidak muncul. Tidak mengubah array asal.
 */
export function groupLkpdListSections<T extends LkpdListWorksheetLike>(
  worksheets: readonly T[],
  modules: readonly LkpdOptionModuleLike[],
  sort: LkpdListSortMode,
): LkpdListGroup<T>[] {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const buckets = bucketLkpdByGroup(worksheets, modules);
  return orderedGroupLabels(buckets).map((label) => ({
    label,
    worksheets: [...(buckets.get(label) ?? [])].sort((a, b) => compareLkpdListItems(a, b, sort, moduleById)),
  }));
}

/** Modul arsip: statusnya "arsip" atau judulnya mengandung "Arsip". */
export function isArchivedModule(module: LkpdOptionModuleLike): boolean {
  return module.status === "arsip" || /arsip/i.test(module.title);
}

export type LkpdModuleGroup = {
  label: string;
  modules: LkpdOptionModuleLike[];
};

/** Banding dua modul dalam satu kelompok dropdown: nomor ATP dari judul menaik, lalu abjad judul, lalu id. */
function compareModulesForFilter(a: LkpdOptionModuleLike, b: LkpdOptionModuleLike): number {
  const atpA = parseAtpNumber(a.title);
  const atpB = parseAtpNumber(b.title);
  if (atpA !== null && atpB !== null) {
    if (atpA.major !== atpB.major) return atpA.major - atpB.major;
    if (atpA.minor !== atpB.minor) return atpA.minor - atpB.minor;
  } else if (atpA !== null) {
    return -1;
  } else if (atpB !== null) {
    return 1;
  }
  const byTitle = a.title.localeCompare(b.title, "id");
  return byTitle !== 0 ? byTitle : a.id - b.id;
}

/**
 * Kelompokkan modul untuk dropdown saringan "Semua modul" Langkah 2:
 * <optgroup> per label bersama ("Mapel — Kelompok Materi" dari subject +
 * topic_group modul itu sendiri), modul terurut ATP menaik di dalam
 * kelompok, modul arsip ke kelompok terakhir "Arsip Lama", kelompok
 * kosong tidak ditampilkan. Opsi "Semua modul" dirender komponen di
 * luar kelompok-kelompok ini. Tidak mengubah array asal.
 */
export function groupModulesForFilter(
  modules: readonly LkpdOptionModuleLike[],
): LkpdModuleGroup[] {
  const buckets = new Map<string, LkpdOptionModuleLike[]>();
  for (const module of modules) {
    const label = isArchivedModule(module) ? LKPD_ARCHIVE_GROUP_LABEL : lkpdGroupLabel(module);
    const bucket = buckets.get(label) ?? [];
    bucket.push(module);
    buckets.set(label, bucket);
  }
  return orderedGroupLabels(buckets).map((label) => ({
    label,
    modules: [...(buckets.get(label) ?? [])].sort(compareModulesForFilter),
  }));
}
