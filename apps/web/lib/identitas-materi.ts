// Chip label identitas materi untuk daftar sisi guru: judul materi/LKPD
// antar mapel dan semester bertabrakan nomor ATP-nya (ATP 1.1 ada di
// Eksponen X, Barisan XI, KKA, dan Informatika), jadi sistem menempelkan
// identitas terstruktur sebagai chip/prefix TANPA mengubah judul lama:
//
//   token penuh   "X1-MAT-Eksponen · ATP 1.1"  (konvensi judul baru)
//   chip baris    "X1-MAT · Eksponen · 1.1"
//   prefix opsi   "[X1 · 1.1]"                 (di dalam <optgroup>)
//   prefix picker "X1-MAT · 1.1"               (PemilihCepat, bisa dicari)
//
// X1 = Kelas X semester 1 (XI2 = Kelas XI semester 2, dst.); kode mapel
// 3 huruf (Matematika→MAT, KKA→KKA, Informatika→INF; mapel lain → 3
// huruf pertama namanya). Pemetaan (mapel, kelompok, ATP) → kelas +
// semester TIDAK tersedia di sisi web (panel CP & ATP mengambil datanya
// dari API), jadi tabel di bawah adalah CERMINAN MINIMAL data kurikulum
// API (apps/api/src/lib/kurikulum.ts) yang kesamaannya dikunci uji
// statis di lib/identitas-materi.test.mjs — pola yang sama dengan
// cerminan XP_LEVELS. Unsur yang tidak ditemukan/ambigu dikosongkan
// (degradasi anggun), tidak pernah ditebak. Chip HANYA dirender di
// halaman guru; tampilan murid tidak memakai berkas ini sama sekali.

import {
  lkpdAtpNumber,
  parseAtpNumber,
  type LkpdOptionModuleLike,
  type LkpdOptionWorksheetLike,
} from "./grup-lkpd";
import { subjectMatchKeys } from "./kelompok-materi";

export type AtpNumber = { major: number; minor: number };

export { parseAtpNumber };

// --- Kode mapel -----------------------------------------------------------

const SUBJECT_CODE_MAP: Record<string, string> = {
  matematika: "MAT",
  kka: "KKA",
  "koding dan kecerdasan artifisial": "KKA",
  informatika: "INF",
};

/**
 * Kode mapel 3 huruf: peta eksplisit untuk mapel baku SIMAK, selain itu
 * 3 huruf pertama nama mapel dalam huruf besar (hanya huruf yang
 * dihitung). Null bila nama mapel kosong/tanpa huruf.
 */
export function subjectCode(subject: string | null | undefined): string | null {
  const raw = (subject ?? "").trim();
  if (raw === "") return null;
  for (const key of subjectMatchKeys(raw)) {
    const code = SUBJECT_CODE_MAP[key];
    if (code) return code;
  }
  const letters = raw.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return null;
  return letters.slice(0, 3).toUpperCase();
}

// --- Cerminan pemetaan kurikulum: (mapel, kelompok) → kelas + semester ---

export type KelasSemesterEntry = {
  subject: string;
  group: string;
  grade: "Kelas X" | "Kelas XI";
  semester: "Ganjil" | "Genap";
  /**
   * Kode ATP yang termasuk entri ini. Hanya diisi bila kelompok yang
   * sama muncul di lebih dari satu set pada mapel itu (Literasi Digital
   * Informatika terbagi Ganjil/Genap menurut nomor ATP) — entri tanpa
   * daftar ini mengklaim seluruh kode kelompoknya.
   */
  atpCodes?: readonly string[];
};

/**
 * CERMINAN daftar kelompok per set dari CURRICULUM_SETS di
 * apps/api/src/lib/kurikulum.ts (sumber kebenaran server). Web tidak
 * bisa mengimpor berkas API, jadi kesamaannya dikunci oleh uji statis
 * di lib/identitas-materi.test.mjs yang membaca berkas API dan
 * memeriksa setiap (mapel, kelompok, kode ATP) terhadap tabel ini.
 * Urutan mengikuti urutan set di berkas API.
 */
export const KELAS_SEMESTER_MAP: readonly KelasSemesterEntry[] = [
  // Matematika — Kelas X, Ganjil
  { subject: "Matematika", group: "Eksponen", grade: "Kelas X", semester: "Ganjil" },
  { subject: "Matematika", group: "Sistem Pertidaksamaan Linear Dua Variabel", grade: "Kelas X", semester: "Ganjil" },
  { subject: "Matematika", group: "Fungsi Kuadrat", grade: "Kelas X", semester: "Ganjil" },
  { subject: "Matematika", group: "Fungsi Eksponen", grade: "Kelas X", semester: "Ganjil" },
  // Matematika — Kelas X, Genap
  { subject: "Matematika", group: "Perbandingan Trigonometri", grade: "Kelas X", semester: "Genap" },
  { subject: "Matematika", group: "Penyebaran Data", grade: "Kelas X", semester: "Genap" },
  { subject: "Matematika", group: "Analisis Data", grade: "Kelas X", semester: "Genap" },
  // Matematika — Kelas XI, Ganjil
  { subject: "Matematika", group: "Barisan dan Deret", grade: "Kelas XI", semester: "Ganjil" },
  { subject: "Matematika", group: "Matematika Keuangan", grade: "Kelas XI", semester: "Ganjil" },
  { subject: "Matematika", group: "Fungsi Komposisi dan Fungsi Invers", grade: "Kelas XI", semester: "Ganjil" },
  { subject: "Matematika", group: "Transformasi Grafik Fungsi", grade: "Kelas XI", semester: "Ganjil" },
  // Matematika — Kelas XI, Genap
  { subject: "Matematika", group: "Statistika Dua Variabel", grade: "Kelas XI", semester: "Genap" },
  { subject: "Matematika", group: "Kaidah Pencacahan", grade: "Kelas XI", semester: "Genap" },
  { subject: "Matematika", group: "Peluang Bersyarat", grade: "Kelas XI", semester: "Genap" },
  { subject: "Matematika", group: "Lingkaran", grade: "Kelas XI", semester: "Genap" },
  // KKA — Kelas X, Ganjil
  { subject: "KKA", group: "Berpikir Komputasional", grade: "Kelas X", semester: "Ganjil" },
  { subject: "KKA", group: "Algoritma Pemrograman", grade: "Kelas X", semester: "Ganjil" },
  { subject: "KKA", group: "Literasi dan Etika Kecerdasan Artifisial", grade: "Kelas X", semester: "Ganjil" },
  // KKA — Kelas X, Genap
  { subject: "KKA", group: "Pemanfaatan dan Pengembangan Kecerdasan Artifisial", grade: "Kelas X", semester: "Genap" },
  { subject: "KKA", group: "Literasi Digital", grade: "Kelas X", semester: "Genap" },
  { subject: "KKA", group: "Analisis Data", grade: "Kelas X", semester: "Genap" },
  // Informatika — Kelas X, Ganjil
  { subject: "Informatika", group: "Berpikir Komputasional", grade: "Kelas X", semester: "Ganjil" },
  {
    subject: "Informatika",
    group: "Literasi Digital",
    grade: "Kelas X",
    semester: "Ganjil",
    atpCodes: ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"],
  },
  // Informatika — Kelas X, Genap
  {
    subject: "Informatika",
    group: "Literasi Digital",
    grade: "Kelas X",
    semester: "Genap",
    atpCodes: ["2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15", "2.16", "2.17", "2.18"],
  },
];

/**
 * Alias nama kelompok lama/pendek → judul kelompok kanonis kurikulum.
 * Modul-modul awal SPtLDV memakai topic_group "SPtLDV" sebelum nama
 * kanonisnya dipakai di formulir; alias hanya dipakai untuk PENCARIAN
 * token kelas-semester — nama kelompok yang tampil tetap apa adanya.
 */
const TOPIC_GROUP_ALIASES: Record<string, string> = {
  sptldv: "Sistem Pertidaksamaan Linear Dua Variabel",
};

function normalizeGroupName(value: string): string {
  return value.trim().toLowerCase();
}

function tokenOf(entry: KelasSemesterEntry): string {
  const roman = entry.grade.replace(/^Kelas\s+/i, "").toUpperCase();
  return `${roman}${entry.semester === "Ganjil" ? "1" : "2"}`;
}

function entriesFor(subject: string, group: string): KelasSemesterEntry[] {
  const subjectKeys = subjectMatchKeys(subject);
  const wanted = normalizeGroupName(group);
  return KELAS_SEMESTER_MAP.filter(
    (entry) =>
      subjectMatchKeys(entry.subject).some((key) => subjectKeys.includes(key)) &&
      normalizeGroupName(entry.group) === wanted,
  );
}

/**
 * Token kelas-semester ("X1", "XI2", …) untuk satu (mapel, kelompok,
 * ATP): dicari di cerminan kurikulum. Kelompok yang muncul di lebih
 * dari satu set pada mapel yang sama hanya terpecahkan bila nomor ATP
 * menunjuk tepat satu entri; selain itu (tidak ditemukan / ambigu /
 * masukan kosong) hasilnya null — token dikosongkan, tidak ditebak.
 */
export function kelasSemesterToken(
  subject: string | null | undefined,
  topicGroup: string | null | undefined,
  atpNumber: AtpNumber | null,
): string | null {
  const rawSubject = (subject ?? "").trim();
  const rawGroup = (topicGroup ?? "").trim();
  if (rawSubject === "" || rawGroup === "") return null;
  let candidates = entriesFor(rawSubject, rawGroup);
  if (candidates.length === 0) {
    const alias = TOPIC_GROUP_ALIASES[normalizeGroupName(rawGroup)];
    if (alias) candidates = entriesFor(rawSubject, alias);
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return tokenOf(candidates[0]!);
  if (atpNumber === null) return null;
  const code = `${atpNumber.major}.${atpNumber.minor}`;
  const narrowed = candidates.filter((entry) => entry.atpCodes?.includes(code));
  return narrowed.length === 1 ? tokenOf(narrowed[0]!) : null;
}

// --- Rangkaian identitas ---------------------------------------------------

export type IdentityParts = {
  /** Token kelas-semester, mis. "X1"; null bila tak terpetakan. */
  kelasSemester: string | null;
  /** Kode mapel 3 huruf, mis. "MAT"; null bila mapel kosong. */
  subjectCode: string | null;
  /** Nama kelompok materi apa adanya dari modul; null bila kosong. */
  topicGroup: string | null;
  /** Nomor ATP "x.y"; null bila tak terbaca dari judul. */
  atp: string | null;
  /** Chip baris daftar: "X1-MAT · Eksponen · 1.1" (unsur hilang gugur). */
  chip: string | null;
  /** Prefix opsi <select> di dalam <optgroup>: "[X1 · 1.1]"; hanya bila kelas-semester diketahui. */
  optionPrefix: string | null;
  /** Prefix PemilihCepat (tampil + bisa dicari): "X1-MAT · 1.1". */
  pickerPrefix: string | null;
};

function buildIdentity(
  subject: string | null | undefined,
  topicGroup: string | null | undefined,
  atpNumber: AtpNumber | null,
): IdentityParts {
  const code = subjectCode(subject);
  const kelasSemester = kelasSemesterToken(subject, topicGroup, atpNumber);
  const group = (topicGroup ?? "").trim() === "" ? null : (topicGroup ?? "").trim();
  const atp = atpNumber ? `${atpNumber.major}.${atpNumber.minor}` : null;
  const head = [kelasSemester, code].filter((part): part is string => part !== null).join("-");
  const chipParts = [head === "" ? null : head, group, atp].filter((part): part is string => part !== null);
  const optionParts = [kelasSemester, atp].filter((part): part is string => part !== null);
  const pickerParts = [head === "" ? null : head, atp].filter((part): part is string => part !== null);
  return {
    kelasSemester,
    subjectCode: code,
    topicGroup: group,
    atp,
    chip: chipParts.length > 0 ? chipParts.join(" · ") : null,
    optionPrefix: kelasSemester !== null ? `[${optionParts.join(" · ")}]` : null,
    pickerPrefix: head !== "" ? pickerParts.join(" · ") : null,
  };
}

/** Identitas satu modul dari datanya sendiri (mapel, kelompok, ATP di judul modul). */
export function moduleIdentity(module: LkpdOptionModuleLike): IdentityParts {
  return buildIdentity(module.subject, module.topic_group, parseAtpNumber(module.title));
}

/**
 * Identitas satu LKPD: mapel + kelompok dari modul pasangannya, nomor
 * ATP efektif mengikuti aturan lkpdAtpNumber (judul LKPD didahulukan,
 * judul modul cadangan). LKPD tanpa modul hanya membawa nomor ATP-nya.
 */
export function worksheetIdentity(
  worksheet: LkpdOptionWorksheetLike,
  module: LkpdOptionModuleLike | null,
): IdentityParts {
  return buildIdentity(module?.subject, module?.topic_group, lkpdAtpNumber(worksheet, module));
}
