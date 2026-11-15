// Perencana murni daftar materi murid TERPANDU (v1.0.65): kartu hero
// "Materi berikutnya untukmu", pengelompokan per kelompok materi
// dengan progres, penanda status per kartu, arsip "Sudah tuntas",
// saringan, dan pencarian — semuanya di atas daftar modul yang SUDAH
// terurut oleh server pada payload /murid/today (urutan penugasan:
// rantai + ATP, bebas terakhir). Klien TIDAK mengurutkan ulang daftar
// ini; yang diputuskan di sini hanya pengelompokan, pemilihan hero,
// dan keterlihatan menurut saringan/kata cari. Semua keputusan dapat
// diuji tanpa peramban; halaman hanya menggambar hasilnya.
//
// Keadaan per modul datang utuh dari server: material_completed
// (penanda tuntas per modul dari catatan baca_materi_tuntas) dan
// locked/locked_by_title (aturan modul lib/rantai-penugasan v1.0.63).
// Status kartu dibatasi empat keadaan yang datanya memang ada —
// Tuntas, Terkunci, Giliranmu (isi hero), dan tanpa penanda (belum
// mulai). Sinyal "sedang dibaca" TIDAK dipakai: event buka_materi per
// modul hanya berarti "pernah dibuka", bukan sedang dibaca, jadi
// melabelinya "sedang dibaca" akan mengarang keadaan.

import { filterPickerOptions, parseAtpCode } from "./pemilih-cepat";

export type GuidedModuleInput = {
  id: number;
  title: string;
  subject: string;
  /** Kelompok materi mentah (modules.topic_group); null/kosong = belum berkelompok. */
  topicGroup: string | null;
  /** Penanda tuntas per modul dari server (baca_materi_tuntas murid ini). */
  materialCompleted: boolean;
  /** Aturan kunci modul v1.0.63 (terkunci hanya bila semua penugasannya terkunci). */
  locked: boolean;
  lockedByTitle: string | null;
};

export type GuidedModule<T extends GuidedModuleInput = GuidedModuleInput> = T & {
  /** Label "ATP x.y" dari judul modul (pola parseAtpCode); null bila tak berkode. */
  atpLabel: string | null;
  /** Modul ini adalah isi kartu hero — kartunya di daftar berlencana "Giliranmu". */
  isHero: boolean;
};

export type MaterialFilter = "semua" | "belum" | "tuntas";

export const MATERIAL_FILTERS: readonly { key: MaterialFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "belum", label: "Belum tuntas" },
  { key: "tuntas", label: "Tuntas" },
];

export type MaterialGroupSection<T extends GuidedModuleInput = GuidedModuleInput> = {
  /** Kunci stabil "mapel|kelompok". */
  key: string;
  subject: string;
  /** Nama kelompok tampil; "Lainnya" untuk modul tanpa kelompok / kelompok "Lainnya". */
  groupName: string;
  isLainnya: boolean;
  /** Y pada "X dari Y tuntas": SEMUA modul kelompok ini, termasuk yang terarsip. */
  totalCount: number;
  /** X pada "X dari Y tuntas": yang tuntas, termasuk yang terarsip. */
  completedCount: number;
  /** Modul BELUM-tuntas kelompok ini yang lolos saringan + kata cari, urutan server. */
  modules: GuidedModule<T>[];
};

/** Keadaan kartu hero di atas daftar materi. */
export type HeroState =
  /** Ada modul belum-tuntas tak-terkunci paling awal — itulah isi hero. */
  | "next"
  /** Semua modul yang tidak terkunci sudah tuntas (mungkin masih ada yang terkunci). */
  | "all-done"
  /** Ada modul, tetapi semuanya terkunci. */
  | "all-locked"
  /** Murid tidak punya materi sama sekali — hero tidak tampil. */
  | "none";

export type GuidedMaterialsPlan<T extends GuidedModuleInput = GuidedModuleInput> = {
  /** Isi hero pada keadaan "next"; null pada keadaan lain. */
  hero: GuidedModule<T> | null;
  heroState: HeroState;
  /** Modul terkunci terawal — bahan baris info pada keadaan "all-done"/"all-locked". */
  nextLocked: GuidedModule<T> | null;
  groups: MaterialGroupSection<T>[];
  /** Modul tuntas yang lolos saringan + kata cari (isi bagian arsip yang digambar). */
  archive: GuidedModule<T>[];
  /** SEMUA modul tuntas murid ini (angka N pada kepala "Sudah tuntas (N)"). */
  archiveTotal: number;
  /** Arsip terbuka secara bawaan: saringan "tuntas", atau pencarian yang berbuah di arsip. */
  archiveOpenByDefault: boolean;
  /** Banyak modul yang digambar (bagian kelompok + arsip) pada saringan/kata cari ini. */
  visibleTotal: number;
  /** Banyak seluruh modul murid ini (sebelum saringan/kata cari). */
  totalCount: number;
};

export const ARCHIVE_GROUP_NAME = "Lainnya";

function cleanGroupName(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Nama kelompok tampil sebuah modul: topic_group terisi dan bukan
 * persis "Lainnya" → nama itu; selain itu "Lainnya" (cermin syarat
 * masuk rantai di API: kelompok "Lainnya" bukan rangkaian berurutan).
 */
export function guidedGroupName(topicGroup: string | null | undefined): string {
  const clean = cleanGroupName(topicGroup);
  return clean !== null && clean !== ARCHIVE_GROUP_NAME ? clean : ARCHIVE_GROUP_NAME;
}

/**
 * Susun rencana daftar materi terpandu dari daftar modul server.
 *
 * Aturan gambar:
 *  - Hero = modul belum-tuntas + tidak-terkunci PALING AWAL pada
 *    urutan server (ketuntasan materi per modul, bukan ketuntasan
 *    penugasan — daftar ini soal membaca).
 *  - Modul tuntas TIDAK PERNAH digambar di bagian kelompoknya; mereka
 *    terkumpul di arsip. Kepala kelompok tetap menghitung mereka
 *    (X dari Y mencakup yang terarsip). Kelompok yang seluruh modulnya
 *    tuntas tidak menggambar bagian sama sekali — isinya hidup di
 *    arsip, dan menggambar kepala kosong hanya menduplikasi arsip.
 *  - Bagian "Lainnya" (per mapel) selalu paling akhir; bagian lain
 *    mengikuti kemunculan pertama pada urutan server.
 *  - Saringan "belum" menyembunyikan arsip; "tuntas" hanya arsip.
 *    Kata cari (token bebas-urutan pada judul, filterPickerOptions)
 *    berlaku lintas kelompok; hasil tuntas tetap di arsip dan arsip
 *    terbuka secara bawaan bila berbuah.
 */
export function planGuidedMaterials<T extends GuidedModuleInput>(
  modules: readonly T[],
  filter: MaterialFilter,
  query: string,
): GuidedMaterialsPlan<T> {
  const searching = query.trim().length > 0;
  const matchedIds = new Set(filterPickerOptions(modules, query).map((module) => module.id));

  const heroRaw = modules.find((module) => !module.materialCompleted && !module.locked) ?? null;
  const heroState: HeroState =
    modules.length === 0 ? "none" : heroRaw !== null ? "next" : modules.some((module) => !module.locked) ? "all-done" : "all-locked";
  const nextLocked = modules.find((module) => module.locked) ?? null;

  const decorate = (module: T): GuidedModule<T> => {
    const code = parseAtpCode(module.title);
    return {
      ...module,
      atpLabel: code ? `ATP ${code}` : null,
      isHero: heroRaw !== null && module.id === heroRaw.id,
    };
  };
  const hero = heroRaw !== null ? decorate(heroRaw) : null;

  const matches = (module: GuidedModuleInput) => !searching || matchedIds.has(module.id);
  const visibleInGroups = (module: GuidedModuleInput) =>
    !module.materialCompleted && filter !== "tuntas" && matches(module);
  const visibleInArchive = (module: GuidedModuleInput) =>
    module.materialCompleted && filter !== "belum" && matches(module);

  // Kelompok dibangun dari SELURUH daftar (untuk hitungan kepala),
  // isinya hanya yang digambar.
  type Bucket = MaterialGroupSection<T> & { sortIndex: number };
  const buckets = new Map<string, Bucket>();
  modules.forEach((module, index) => {
    const groupName = guidedGroupName(module.topicGroup);
    const key = `${module.subject}|${groupName}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        subject: module.subject,
        groupName,
        isLainnya: groupName === ARCHIVE_GROUP_NAME,
        totalCount: 0,
        completedCount: 0,
        modules: [],
        sortIndex: index,
      };
      buckets.set(key, bucket);
    }
    bucket.totalCount++;
    if (module.materialCompleted) bucket.completedCount++;
    if (visibleInGroups(module)) bucket.modules.push(decorate(module));
  });
  const groups = [...buckets.values()]
    .filter((bucket) => bucket.modules.length > 0)
    .sort((a, b) => {
      if (a.isLainnya !== b.isLainnya) return a.isLainnya ? 1 : -1;
      return a.sortIndex - b.sortIndex;
    })
    .map(({ sortIndex: _sortIndex, ...section }) => section);

  const archive = modules.filter(visibleInArchive).map(decorate);
  const archiveTotal = modules.filter((module) => module.materialCompleted).length;
  const visibleTotal = groups.reduce((sum, section) => sum + section.modules.length, 0) + archive.length;

  return {
    hero,
    heroState,
    nextLocked: nextLocked !== null ? decorate(nextLocked) : null,
    groups,
    archive,
    archiveTotal,
    archiveOpenByDefault: filter === "tuntas" || (searching && archive.length > 0),
    visibleTotal,
    totalCount: modules.length,
  };
}

/**
 * Kartu hero hanya digambar pada keadaan jelajah biasa: tanpa kata
 * cari (pencarian adalah pencarian sengaja — hero akan menghalangi
 * hasil) dan bukan saringan "tuntas" (saringan itu berarti "hanya
 * arsip", sedangkan hero menunjuk materi belum-tuntas).
 */
export function shouldShowHero<T extends GuidedModuleInput>(plan: GuidedMaterialsPlan<T>, filter: MaterialFilter, query: string): boolean {
  if (plan.heroState === "none") return false;
  if (query.trim().length > 0) return false;
  return filter !== "tuntas";
}
