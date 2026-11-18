// Kartu bagian beranda murid (calon v1.0.74, disesuaikan era
// navigasi v1.0.76): chip status di kepala dua kartu identitas
// dashboard murid — Kelas saya dan Progres belajar. Chip SELALU
// diturunkan dari data yang sudah dimuat bagian itu sendiri
// (payload /murid/today dan /murid/asesmen) — tidak ada endpoint
// atau panggilan data baru; fungsi-fungsi di sini murni agar
// pemetaannya terkunci uji. (Dua kartu lain dari v1.0.74 — Asesmen
// RUAS dan Jurnal belajar — dipensiunkan oleh desain navigasi
// v1.0.76 beserta helper chipnya.)
//
// Nada chip: "neutral" untuk hitungan biasa, "accent" untuk keadaan
// yang menunggu aksi murid, "done" untuk keadaan tuntas yang
// menenangkan — dua nada terakhir tetap bagian dari tipe chip
// bersama walau kedua chip yang tersisa selalu "neutral".

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
