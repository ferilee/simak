import { db, schema } from "@simak/db";

// Poin XP murid (gamifikasi): penghargaan hanya untuk KETUNTASAN yang
// tercatat di server — bukan untuk kebenaran jawaban (itu wilayah
// penilaian guru). Setiap penghargaan adalah satu baris buku besar
// xp_ledger; kunci unik (student_id, event, source_id) di tabel itu
// membuat sumber yang sama tidak pernah membayar dua kali. Total XP
// adalah jumlah buku besar, jadi tidak ada penghitung yang menyimpang.

const { xpLedger } = schema;

export const XP_POINTS = {
  materi_tuntas: 10,
  lkpd_terkumpul: 25,
  exit_ticket: 15,
} as const;

export type XpEvent = keyof typeof XP_POINTS;

// Tangga level dari total kumulatif. Satu paket ATP lengkap bernilai
// 50 XP (10 materi + 25 LKPD + 15 exit ticket): level pertama tercapai
// sesudah ±1 paket, Master SIMAK sesudah ±14 paket (±satu semester).
export const XP_LEVELS = [
  { min: 0, name: "Pembelajar Baru" },
  { min: 50, name: "Penjelajah" },
  { min: 120, name: "Pencari Pola" },
  { min: 250, name: "Penakluk LKPD" },
  { min: 450, name: "Ahli Materi" },
  { min: 700, name: "Master SIMAK" },
] as const;

export type XpSummary = {
  total: number;
  levelIndex: number;
  levelName: string;
  nextLevelName: string | null;
  nextLevelAt: number | null;
  xpToNext: number | null;
  progressPct: number;
};

/** Ringkasan level dari total XP: murni, tanpa basis data. */
export function summarizeXp(totalInput: number): XpSummary {
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
      nextLevelName: null,
      nextLevelAt: null,
      xpToNext: null,
      progressPct: 100,
    };
  }
  const progressPct = Math.min(100, Math.max(0, Math.floor(((total - current.min) / (next.min - current.min)) * 100)));
  return {
    total,
    levelIndex,
    levelName: current.name,
    nextLevelName: next.name,
    nextLevelAt: next.min,
    xpToNext: next.min - total,
    progressPct,
  };
}

/**
 * Catat satu penghargaan XP ke buku besar. Idempoten: kunci unik
 * (student_id, event, source_id) + onDuplicateKeyUpdate yang menulis
 * nilai yang sama persis (no-op) membuat panggilan ulang untuk sumber
 * yang sama tidak menggandakan baris. Mengembalikan poin kejadian itu;
 * titik panggil di routes hanya memanggilnya pada kejadian yang memang
 * baru (penjaga status attempt, cabang insert exit ticket, catatan
 * tuntas pertama), sehingga nilai kembali ini adalah poin yang diterima.
 */
export async function awardXp(studentId: number, event: XpEvent, sourceId: number): Promise<number> {
  const points = XP_POINTS[event];
  await db
    .insert(xpLedger)
    .values({ studentId, event, sourceId, points })
    .onDuplicateKeyUpdate({ set: { points } });
  return points;
}
