// Kartu bagian beranda murid (calon v1.0.74): chip status di kepala
// kartu Kelas saya / Progres belajar / Asesmen RUAS / Jurnal belajar.
// Chip SELALU diturunkan dari data yang sudah dimuat bagian itu
// sendiri (payload /murid/today, /murid/asesmen, /murid/jurnal) —
// tidak ada endpoint atau panggilan data baru; fungsi-fungsi di
// sini murni agar pemetaannya terkunci uji.
//
// Nada chip: "neutral" untuk hitungan biasa, "accent" untuk keadaan
// yang menunggu aksi murid (asesmen belum selesai — dibuat menonjol
// agar tidak terlewat), "done" untuk keadaan tuntas yang menenangkan.

import type { AssessmentCardData, HubData } from "./hub-murid";

export type MuridChipTone = "neutral" | "accent" | "done";

export type MuridSectionChip = {
  label: string;
  tone: MuridChipTone;
};

/** Chip Kelas saya: jumlah kelas yang diikuti murid. */
export function kelasChip(classCount: number): MuridSectionChip {
  return { label: `${classCount} kelas`, tone: "neutral" };
}

/** Chip Progres belajar: total XP seumur akun; tanpa ringkasan XP tidak ada chip. */
export function progresChip(xpTotal: number | null): MuridSectionChip | null {
  if (xpTotal === null) return null;
  return { label: `${xpTotal} XP`, tone: "neutral" };
}

/** Jumlah asesmen yang masih menunggu dikerjakan (belum mulai atau sedang berjalan). */
export function countWaitingAssessments(assessments: AssessmentCardData[]): number {
  return assessments.filter((card) => card.status === "not_started" || card.status === "in_progress").length;
}

/**
 * Chip Asesmen RUAS: "N menunggu" beraksen bila masih ada asesmen
 * belum selesai; "Semua selesai" bila semua terpetakan sudah tuntas;
 * "0 terpetakan" bila belum ada pemetaan. Jembatan belum termuat /
 * belum aktif → tanpa chip (bagiannya sendiri sudah menjelaskan).
 */
export function asesmenChip(hub: HubData | null): MuridSectionChip | null {
  if (!hub || !hub.available) return null;
  const waiting = countWaitingAssessments(hub.assessments);
  if (waiting > 0) return { label: `${waiting} menunggu`, tone: "accent" };
  if (hub.assessments.length > 0) return { label: "Semua selesai", tone: "done" };
  return { label: "0 terpetakan", tone: "neutral" };
}

/** Chip Jurnal belajar: jumlah entri refleksi; ringkasan belum termuat → tanpa chip. */
export function jurnalChip(total: number | null): MuridSectionChip | null {
  if (total === null) return null;
  return { label: `${total} entri`, tone: "neutral" };
}
