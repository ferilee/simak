// Tampilan poin XP di ruang murid: tipe ringkasan yang dikirim
// GET /murid/today (dihitung server dari buku besar xp_ledger lewat
// lib/xp di API) + kalimat kemajuan murni untuk kartu XP. Web tidak
// menghitung ulang level — angka dan nama level selalu dari server;
// di sini hanya kata-katanya yang disusun. total adalah XP seumur
// (dasar level); balance adalah saldo yang bisa ditukar (mis. avatar).

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

/** Judul panel info XP di kartu XP beranda murid. */
export const XP_INFO_TITLE = "Cara Mendapat XP";

/** Catatan penutup panel info XP: dasar pemberian + guna XP. */
export const XP_INFO_NOTE =
  "XP diberikan untuk ketuntasan — bukan benar atau salah jawabanmu. XP seumur menaikkan levelmu, dan saldo XP bisa ditukar dengan avatar.";
