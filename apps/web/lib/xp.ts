// Tampilan poin XP di ruang murid: tipe ringkasan yang dikirim
// GET /murid/today (dihitung server dari buku besar xp_ledger lewat
// lib/xp di API) + kalimat kemajuan murni untuk kartu XP. Web tidak
// menghitung ulang level — angka dan nama level selalu dari server;
// di sini hanya kata-katanya yang disusun.

export type XpSummary = {
  total: number;
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
