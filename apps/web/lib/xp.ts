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
