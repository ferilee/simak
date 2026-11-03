import { pickEffectiveAttempt } from "./groups";

// Halaman "Nilai Saya" murid (v1.0.35): satu halaman yang merangkum semua
// nilai LKPD murid yang sudah terbit, tanpa harus membuka detail tiap
// penugasan. Berkas ini memuat aturan murninya (tanpa basis data) supaya
// perilakunya terkunci oleh tes unit.
//
// Prinsip utamanya: angka di halaman ini tidak boleh pernah berbeda dari
// angka di detail penugasan (GET /murid/assignments/:id). Karena itu
// pemilihan attempt efektif per penugasan memakai pickEffectiveAttempt yang
// sama dengan detail (peringkat status tertinggi menang; seri → attempt
// kelompok), dan penyesuaian nilai anggota hanya berlaku bila attempt
// efektifnya adalah attempt kelompok — persis pagar groupScoreFields di
// route detail.

export type GradeAttemptCandidate = {
  id: number;
  status: "draf" | "terkumpul" | "dinilai";
  submittedAt: Date | null;
  totalScore: string | null;
  updatedAt: Date;
};

export type MemberScoreOverrideRow = {
  score: string;
  updatedAt: Date;
};

export type StudentGradeRow = {
  assignment_id: number;
  assignment_title: string;
  worksheet_title: string;
  subject_name: string | null;
  work_mode: "individu" | "kelompok";
  group_name: string | null;
  score: number | null;
  group_score: number | null;
  score_adjusted: boolean;
  graded_at: Date;
};

/**
 * Attempt terhitung "sudah dinilai" bila statusnya "dinilai" DAN totalnya
 * terisi — keadaan yang sama dengan yang membuat nilai total muncul di
 * detail penugasan. Attempt terkumpul yang sedang dicicil nilainya
 * (Penilaian Rapi: total masih null) tidak lolos di sini.
 */
export function isGradedAttempt(attempt: GradeAttemptCandidate): boolean {
  return attempt.status === "dinilai" && attempt.totalScore !== null;
}

/**
 * Pilih attempt efektif seorang murid untuk satu penugasan dari kandidat
 * attempt individu dan attempt kelompoknya — meniru resolusi detail
 * penugasan (pickEffectiveAttempt). Mengembalikan attempt terpilih beserta
 * penanda apakah ia attempt kelompok; null bila keduanya tidak ada.
 */
export function chooseGradeAttempt(
  individual: GradeAttemptCandidate | null,
  group: GradeAttemptCandidate | null,
): { attempt: GradeAttemptCandidate; isGroup: boolean } | null {
  const effective = pickEffectiveAttempt(individual ?? undefined, group ?? undefined);
  if (!effective) return null;
  // pickEffectiveAttempt mengembalikan salah satu objek masukan apa adanya,
  // jadi identitas objek memberi tahu attempt mana yang menang.
  return { attempt: effective as GradeAttemptCandidate, isGroup: group !== null && effective === group };
}

/**
 * Waktu nilai menjadi terlihat oleh murid: updated_at attempt. Attempt
 * kelompok yang dinilai guru lebih dulu tetap "baru terbit" bagi anggota
 * yang penyesuaian nilainya disimpan SESUDAHNYA, jadi penyesuaian yang
 * lebih baru dari attempt-nya menggeser waktu terbit untuk murid itu.
 */
export function resolveGradedAt(attemptUpdatedAt: Date, overrideUpdatedAt: Date | null): Date {
  if (overrideUpdatedAt && overrideUpdatedAt.getTime() > attemptUpdatedAt.getTime()) return overrideUpdatedAt;
  return attemptUpdatedAt;
}

/**
 * Rakit satu baris Nilai Saya dari keadaan yang sudah dimuat route.
 * Mengembalikan null bila attempt efektifnya belum dinilai (draf,
 * terkumpul, atau total kosong) — baris seperti itu tidak ditampilkan.
 *
 * - Mode individu, atau mode kelompok yang attempt efektifnya attempt
 *   individu (keadaan lama): baris bergaya individu — score = total
 *   attempt, group_score null, tanpa penyesuaian, group_name null; persis
 *   label "Nilai LKPD" di detail penugasan.
 * - Mode kelompok dengan attempt efektif kelompok: group_score = total
 *   kelompok; score = penyesuaian guru milik murid ini bila ada (dengan
 *   score_adjusted true), jika tidak maka total kelompok.
 */
export function buildStudentGradeRow(input: {
  assignmentId: number;
  assignmentTitle: string;
  worksheetTitle: string;
  subjectName: string | null;
  workMode: "individu" | "kelompok";
  groupName: string | null;
  chosen: { attempt: GradeAttemptCandidate; isGroup: boolean } | null;
  override: MemberScoreOverrideRow | null;
}): StudentGradeRow | null {
  const chosen = input.chosen;
  if (!chosen || !isGradedAttempt(chosen.attempt)) return null;
  const attempt = chosen.attempt;
  const base = {
    assignment_id: input.assignmentId,
    assignment_title: input.assignmentTitle,
    worksheet_title: input.worksheetTitle,
    subject_name: input.subjectName,
    work_mode: input.workMode,
  };
  if (input.workMode === "kelompok" && chosen.isGroup) {
    const groupScore = Number(attempt.totalScore);
    if (input.override) {
      return {
        ...base,
        group_name: input.groupName,
        score: Number(input.override.score),
        group_score: groupScore,
        score_adjusted: true,
        graded_at: resolveGradedAt(attempt.updatedAt, input.override.updatedAt),
      };
    }
    return {
      ...base,
      group_name: input.groupName,
      score: groupScore,
      group_score: groupScore,
      score_adjusted: false,
      graded_at: attempt.updatedAt,
    };
  }
  return {
    ...base,
    group_name: null,
    score: Number(attempt.totalScore),
    group_score: null,
    score_adjusted: false,
    graded_at: attempt.updatedAt,
  };
}

/** Urutan tampil Nilai Saya: yang paling baru terbit lebih dulu. */
export function sortGradeRows(rows: StudentGradeRow[]): StudentGradeRow[] {
  return [...rows].sort((a, b) => b.graded_at.getTime() - a.graded_at.getTime());
}
