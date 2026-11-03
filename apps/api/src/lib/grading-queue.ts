// Saringan antrean penilaian untuk penugasan kelompok (Penilaian Rapi,
// v1.0.34): pada daftar Pengumpulan (per-LKPD maupun gabungan), LKPD yang
// dipakai penugasan kelompok menampilkan HANYA attempt kelompoknya. Baris
// individu pada LKPD seperti itu adalah duplikat anggota (murid yang juga
// punya attempt sendiri) atau attempt liar murid yang terlanjur mengerjakan
// sendiri — datanya tidak dihapus, hanya tidak ditampilkan di antrean.
// Fungsi di sini murni (tanpa basis data) supaya aturannya bisa diuji.
//
// Sebuah LKPD disebut "khusus kelompok" bila memiliki minimal satu
// penugasan kelompok yang sudah berjalan (status terbit/ditutup) dan TIDAK
// memiliki penugasan individu yang sudah berjalan. Bila kedua mode pernah
// memakai LKPD yang sama, attempt individu tidak dapat dibedakan asal
// penugasannya, jadi daftar dibiarkan apa adanya (perilaku lama).

export type GradingQueueAssignmentLike = {
  worksheetId: number | null;
  workMode: string;
  status: string;
};

/** Id LKPD yang khusus dipakai penugasan kelompok (lihat catatan di atas). */
export function groupOnlyWorksheetIds(
  assignments: readonly GradingQueueAssignmentLike[],
): Set<number> {
  const groupWorksheets = new Set<number>();
  const individualWorksheets = new Set<number>();
  for (const assignment of assignments) {
    if (assignment.worksheetId === null || assignment.status === "draf") continue;
    if (assignment.workMode === "kelompok") groupWorksheets.add(assignment.worksheetId);
    else individualWorksheets.add(assignment.worksheetId);
  }
  const result = new Set<number>();
  for (const worksheetId of groupWorksheets) {
    if (!individualWorksheets.has(worksheetId)) result.add(worksheetId);
  }
  return result;
}

export type GradingQueueRowLike = {
  worksheetId: number;
  groupId: number | null;
};

/** Attempt kelompok selalu tampil; attempt individu hanya tampil bila LKPD-nya bukan khusus kelompok. */
export function isGradingQueueRowVisible(
  row: GradingQueueRowLike,
  groupOnlyWorksheets: ReadonlySet<number>,
): boolean {
  if (row.groupId !== null) return true;
  return !groupOnlyWorksheets.has(row.worksheetId);
}

/** Terapkan saringan antrean kelompok pada daftar attempt (urutan dipertahankan). */
export function filterGradingQueueRows<T extends GradingQueueRowLike>(
  rows: readonly T[],
  groupOnlyWorksheets: ReadonlySet<number>,
): T[] {
  return rows.filter((row) => isGradingQueueRowVisible(row, groupOnlyWorksheets));
}
