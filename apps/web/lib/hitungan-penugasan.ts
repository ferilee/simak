// Perencana murni hitungan daftar penugasan guru (Langkah 4): saringan
// kelas dan hitungan chip status diturunkan dari data penugasan yang
// sudah termuat, tanpa memanggil server. Halaman hanya menggambar
// hasilnya.
//
// Semantik faset yang dikunci di sini:
//   - Himpunan dasar = penugasan yang lolos saringan KELAS yang sedang
//     dipilih pada dropdown Kelas. Pilihan dropdown itu tiga macam:
//     "semua" (semua kelas), id kelas tertentu, dan "siswa"
//     (penugasan bersasaran siswa tertentu — pilihan semu pada
//     dropdown yang sama, jadi hitungannya ikut disaring sama).
//   - Angka chip status (Semua/Terbit/Draf/Ditutup) selalu potret
//     himpunan dasar itu; saringan STATUS tidak ikut mengecilkan
//     angka chip.
//   - Daftar tampil dan penyebut ringkasan "Menampilkan X dari Y"
//     memakai himpunan dasar yang sama persis (lewat
//     filterAssignmentsByClass), supaya ketiganya tak pernah berbeda
//     sumber.

/** Bentuk minimal penugasan yang dibutuhkan hitungan ini. */
export type AssignmentCountInput = {
  status: string;
  target_type?: string | null;
  classes: { id: number }[];
};

export type AssignmentCounts = {
  total: number;
  terbit: number;
  draf: number;
  ditutup: number;
};

/**
 * Saring penugasan menurut nilai dropdown Kelas: null/"semua" meloloskan
 * semua, "siswa" hanya penugasan bersasaran siswa tertentu, nilai lain
 * dibaca sebagai id kelas. Urutan masukan dipertahankan dan masukan
 * tidak diubah.
 */
export function filterAssignmentsByClass<T extends AssignmentCountInput>(
  assignments: readonly T[],
  classFilter: string | null | undefined,
): T[] {
  if (classFilter === null || classFilter === undefined || classFilter === "semua") {
    return [...assignments];
  }
  if (classFilter === "siswa") {
    return assignments.filter((assignment) => assignment.target_type === "siswa");
  }
  const classId = Number(classFilter);
  return assignments.filter((assignment) => assignment.classes.some((kelas) => kelas.id === classId));
}

/**
 * Hitungan chip status untuk kelas terpilih: total selalu sama dengan
 * terbit + draf + ditutup dari himpunan dasar kelas itu.
 */
export function planAssignmentCounts(
  assignments: readonly AssignmentCountInput[],
  classFilter: string | null | undefined,
): AssignmentCounts {
  const base = filterAssignmentsByClass(assignments, classFilter);
  const counts: AssignmentCounts = { total: base.length, terbit: 0, draf: 0, ditutup: 0 };
  for (const assignment of base) {
    if (assignment.status === "terbit") counts.terbit += 1;
    else if (assignment.status === "draf") counts.draf += 1;
    else if (assignment.status === "ditutup") counts.ditutup += 1;
  }
  return counts;
}
