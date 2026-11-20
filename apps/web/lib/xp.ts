// Tampilan poin XP di ruang murid: tipe ringkasan yang dikirim
// GET /murid/today (dihitung server dari buku besar xp_ledger lewat
// lib/xp di API) + kalimat kemajuan murni untuk kartu XP. Angka dan
// nama level yang tampil selalu dari server; di sini kata-katanya
// disusun. Satu pengecualian terukur: helper levelProgress di bawah
// menghitung pecahan progres dari total server memakai cerminan
// tangga level yang dikunci uji terhadap berkas API (pola yang sama
// dengan cerminan XP_EARN_WAYS). total adalah XP seumur (dasar
// level); balance adalah saldo yang bisa ditukar (mis. avatar).

export type XpSummary = {
  total: number;
  balance: number;
  levelIndex: number;
  levelName: string;
  nextLevelName: string | null;
  nextLevelAt: number | null;
  xpToNext: number | null;
  progressPct: number;
};

/** Kalimat di bawah bilah kemajuan kartu XP. */
export function xpProgressLabel(xp: XpSummary): string {
  if (xp.nextLevelName === null || xp.xpToNext === null) return "Level tertinggi tercapai 🏆";
  return `${xp.xpToNext} XP lagi ke ${xp.nextLevelName}`;
}

/**
 * Cara memperoleh XP, untuk panel info "Cara Mendapat XP" di kartu XP
 * beranda murid. Angka-angkanya adalah CERMINAN XP_POINTS di
 * apps/api/src/lib/xp.ts (sumber kebenaran server) — web tidak bisa
 * mengimpor berkas API, jadi kesamaannya dikunci oleh uji statis di
 * lib/xp.test.mjs yang membaca berkas API dan membandingkan nilainya.
 * Urutan tampil: materi, exit ticket, lalu LKPD.
 */
export const XP_EARN_WAYS = [
  { event: "materi_tuntas", label: "Baca materi sampai tuntas", points: 10 },
  { event: "exit_ticket", label: "Isi exit ticket", points: 15 },
  { event: "lkpd_terkumpul", label: "Kumpulkan LKPD", points: 25 },
] as const;

/**
 * Tangga level XP — CERMINAN XP_LEVELS di apps/api/src/lib/xp.ts
 * (sumber kebenaran server). Web tidak bisa mengimpor berkas API, jadi
 * kesamaannya dikunci oleh uji statis di lib/progres-level.test.mjs
 * yang membaca berkas API dan membandingkan setiap ambang + nama.
 * Tabel ini hanya dipakai helper murni levelProgress di bawah untuk
 * tampilan progres yang kasat (pecahan halus + kalimat sisa) — nama
 * level dan total yang tampil di beranda tetap dari ringkasan server.
 */
export const XP_LEVELS = [
  { min: 0, name: "Pembelajar Baru" },
  { min: 50, name: "Penjelajah" },
  { min: 120, name: "Pencari Pola" },
  { min: 250, name: "Penakluk LKPD" },
  { min: 450, name: "Ahli Materi" },
  { min: 700, name: "Master SIMAK" },
] as const;

export type LevelProgress = {
  total: number;
  levelIndex: number;
  levelName: string;
  isTopLevel: boolean;
  nextLevelName: string | null;
  /** XP yang sudah terkumpul di dalam level saat ini (total − ambang level). */
  xpIntoLevel: number;
  /** Rentang XP level saat ini (ambang berikut − ambang ini); null di level tertinggi. */
  levelSpan: number | null;
  /** Kemajuan di dalam level sebagai pecahan 0..1; tepat 1 di level tertinggi. */
  fraction: number;
  /** Sisa XP menuju level berikutnya; null di level tertinggi. */
  xpToNext: number | null;
  /** "Sisa X XP ke <level berikut>", atau "Level tertinggi" di puncak tangga. */
  label: string;
};

/**
 * Progres level murni dari total XP seumur: level saat ini, pecahan
 * kemajuan di dalam level, dan sisa XP ke level berikutnya. Di level
 * tertinggi tidak ada batang yang menggantung — fraction tepat 1,
 * xpToNext null, dan labelnya keadaan "Level tertinggi".
 */
export function levelProgress(totalInput: number): LevelProgress {
  const total = Math.max(0, Math.floor(totalInput) || 0);
  let levelIndex = 0;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (total >= XP_LEVELS[i]!.min) levelIndex = i;
  }
  const current = XP_LEVELS[levelIndex]!;
  const next = XP_LEVELS[levelIndex + 1];
  if (!next) {
    return {
      total,
      levelIndex,
      levelName: current.name,
      isTopLevel: true,
      nextLevelName: null,
      xpIntoLevel: total - current.min,
      levelSpan: null,
      fraction: 1,
      xpToNext: null,
      label: "Level tertinggi",
    };
  }
  const levelSpan = next.min - current.min;
  const xpIntoLevel = total - current.min;
  return {
    total,
    levelIndex,
    levelName: current.name,
    isTopLevel: false,
    nextLevelName: next.name,
    xpIntoLevel,
    levelSpan,
    fraction: Math.min(1, Math.max(0, xpIntoLevel / levelSpan)),
    xpToNext: next.min - total,
    label: `Sisa ${next.min - total} XP ke ${next.name}`,
  };
}

/**
 * Poin baku satu jenis perolehan dari cerminan XP_EARN_WAYS (yang
 * dikunci sama dengan XP_POINTS server): dipakai momen yang respons
 * API-nya tidak membawa angka perolehan — ketuntasan materi di
 * POST /activity hanya menjawab completed, jadi panel perayaannya
 * memakai besaran baku materi_tuntas dari konstanta bersama ini.
 */
export function xpPointsFor(event: string): number | null {
  return XP_EARN_WAYS.find((way) => way.event === event)?.points ?? null;
}

/** Judul panel info XP di kartu XP beranda murid. */
export const XP_INFO_TITLE = "Cara Mendapat XP";

/** Catatan penutup panel info XP: dasar pemberian + guna XP. */
export const XP_INFO_NOTE =
  "XP diberikan untuk ketuntasan — bukan benar atau salah jawabanmu. XP seumur menaikkan levelmu, dan saldo XP bisa ditukar dengan avatar.";
