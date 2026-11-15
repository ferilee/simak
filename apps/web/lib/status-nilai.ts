// Helper murni status penilaian per penugasan untuk guru (rollup Pantau
// Hasil, v1.0.66): server menghitung hitungan dari attempt efektif
// (submitted/graded/partial + status turunan, lihat lib API
// grading-rollup), berkas ini hanya menurunkan tampilan — lencana,
// pecahan, konteks kelas, saringan, dan urutan — supaya bisa diuji
// langsung dengan bun seperti helper Langkah 5 lainnya.

export type GradingStatusName = "belum_ada_pengumpulan" | "belum_dinilai" | "sebagian" | "selesai";

export type GradingRollupLike = {
  submitted_count: number;
  graded_count: number;
  partial_count: number;
  grading_status: GradingStatusName;
};

export type GradingByClassLike = GradingRollupLike & { class_id: number };

/** Bentuk minimal penugasan yang dibutuhkan helper status nilai. */
export type GradedAssignmentLike = {
  status: string;
  worksheet_id: number | null;
  work_mode: string;
  grading?: GradingRollupLike | null;
  grading_by_class?: readonly GradingByClassLike[] | null;
};

export const EMPTY_GRADING_ROLLUP: GradingRollupLike = {
  submitted_count: 0,
  graded_count: 0,
  partial_count: 0,
  grading_status: "belum_ada_pengumpulan",
};

/** Rollup gabungan penugasan; payload lama tanpa field grading dibaca sebagai kosong. */
export function assignmentGrading(assignment: GradedAssignmentLike): GradingRollupLike {
  return assignment.grading ?? EMPTY_GRADING_ROLLUP;
}

/**
 * Lencana status hanya bermakna bila ada yang bisa dinilai: penugasan
 * ber-LKPD yang sudah berjalan (terbit/ditutup). Draf dan penugasan
 * tanpa LKPD tidak diberi lencana agar daftar tidak berisik.
 */
export function gradingBadgeVisible(assignment: GradedAssignmentLike): boolean {
  return assignment.worksheet_id !== null && assignment.status !== "draf";
}

export type GradingBadge = { label: string; tone: "danger" | "warning" | "success" | "neutral" };

export function gradingBadge(status: GradingStatusName): GradingBadge {
  switch (status) {
    case "belum_dinilai":
      return { label: "Belum dinilai", tone: "danger" };
    case "sebagian":
      return { label: "Sebagian dinilai", tone: "warning" };
    case "selesai":
      return { label: "Selesai dinilai ✓", tone: "success" };
    default:
      return { label: "Belum ada pengumpulan", tone: "neutral" };
  }
}

/**
 * Teks pecahan "Dinilai X dari Y kelompok/murid" — satuan mengikuti mode
 * LKPD penugasan. Null bila belum ada pengumpulan (lencana netral sudah
 * menjelaskannya; pecahan 0 dari 0 hanya berisik).
 */
export function gradingFractionLabel(rollup: GradingRollupLike, workMode: string): string | null {
  if (rollup.submitted_count <= 0) return null;
  const unit = workMode === "kelompok" ? "kelompok" : "murid";
  return `Dinilai ${rollup.graded_count} dari ${rollup.submitted_count} ${unit}`;
}

/** Persen bar progres (0 bila belum ada pengumpulan). */
export function gradingProgressPercent(rollup: GradingRollupLike): number {
  if (rollup.submitted_count <= 0) return 0;
  return Math.round((rollup.graded_count / rollup.submitted_count) * 100);
}

/**
 * Rollup untuk konteks saringan kelas Langkah 4: nilai dropdown berupa
 * id kelas memakai rincian per kelas server; "semua"/"siswa"/kosong
 * memakai rollup gabungan (penugasan bersasaran siswa memang tidak
 * disaring per kelas di daftar itu).
 */
export function gradingForClassFilter(
  assignment: GradedAssignmentLike,
  classFilter: string | null | undefined,
): GradingRollupLike {
  if (classFilter === null || classFilter === undefined || classFilter === "semua" || classFilter === "siswa") {
    return assignmentGrading(assignment);
  }
  const classId = Number(classFilter);
  if (!Number.isInteger(classId)) return assignmentGrading(assignment);
  return (assignment.grading_by_class ?? []).find((entry) => entry.class_id === classId) ?? EMPTY_GRADING_ROLLUP;
}

export type GradingFilter = "semua" | "perlu_dinilai" | "selesai";

/** Apakah status ini masih menunggu penilaian guru? */
export function gradingNeedsAttention(status: GradingStatusName): boolean {
  return status === "belum_dinilai" || status === "sebagian";
}

/**
 * Saringan Pantau Hasil: "Perlu dinilai" = belum_dinilai + sebagian;
 * "Selesai" = selesai saja. Penugasan tanpa lencana (draf / tanpa LKPD)
 * dan yang belum ada pengumpulan hanya tampil pada "Semua".
 */
export function matchesGradingFilter(assignment: GradedAssignmentLike, filter: GradingFilter): boolean {
  if (filter === "semua") return true;
  if (!gradingBadgeVisible(assignment)) return false;
  const status = assignmentGrading(assignment).grading_status;
  return filter === "perlu_dinilai" ? gradingNeedsAttention(status) : status === "selesai";
}

/** Jumlah penugasan yang belum selesai dinilai pada himpunan yang diberikan. */
export function countAssignmentsNeedingGrading(assignments: readonly GradedAssignmentLike[]): number {
  return assignments.filter(
    (assignment) => gradingBadgeVisible(assignment) && gradingNeedsAttention(assignmentGrading(assignment).grading_status),
  ).length;
}

/**
 * Urutan bawaan Pantau Hasil: yang belum selesai dinilai di atas, lalu
 * yang belum ada pengumpulan, terakhir yang selesai — stabil di dalam
 * tiap tingkat (urutan asal dipertahankan) dan tidak mengubah masukan.
 */
export function sortAssignmentsByGradingNeed<T extends GradedAssignmentLike>(assignments: readonly T[]): T[] {
  const tier = (assignment: T): number => {
    if (!gradingBadgeVisible(assignment)) return 1;
    const status = assignmentGrading(assignment).grading_status;
    if (gradingNeedsAttention(status)) return 0;
    if (status === "selesai") return 2;
    return 1;
  };
  return assignments
    .map((assignment, index) => ({ assignment, index }))
    .sort((a, b) => tier(a.assignment) - tier(b.assignment) || a.index - b.index)
    .map((entry) => entry.assignment);
}
