// Label Bahasa Indonesia untuk status pengumpulan/penugasan yang tampil ke
// pengguna. Dipakai bersama oleh halaman guru dan murid agar istilahnya sama.
const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  belum_dibuka: "Belum dibuka",
  belum: "Belum dikerjakan",
  draf: "Sedang dikerjakan",
  terkumpul: "Sudah dikumpulkan",
  dinilai: "Sudah dinilai",
  terlambat: "Terlambat dikumpulkan",
};

export function submissionStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const known = SUBMISSION_STATUS_LABELS[status];
  if (known) return known;
  const spaced = status.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
