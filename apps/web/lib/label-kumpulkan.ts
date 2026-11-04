// Label tombol kumpulkan + label jenis butir (v1.0.39) — helper murni.
//
// Latar: sebuah kelompok mengira tombol "Kumpulkan atas nama kelompok"
// mati (biru tetapi tak bereaksi). Sebabnya bukan kerusakan: gerbang
// kelengkapan kelompok (v1.0.36) menahan pengumpulan karena masih ada
// soal kosong — terutama butir unggah foto — tetapi keadaan itu tidak
// terbaca dari tombolnya (tombol utama SIMAK tidak punya gaya redup/
// nonaktif) dan modal gerbang hanya menyebut nomor soal. Dua perbaikan
// informasional, tanpa mengubah semantik apa pun:
//
// 1. Label tombol kumpulkan menyebut sisa soal yang belum terjawab
//    ("Kumpulkan · 3 soal belum terjawab") dan kembali polos begitu
//    semua terjawab. Tombol TIDAK dinonaktifkan berdasarkan kelengkapan
//    — modal gerbang harus tetap terjangkau lewat klik, dan attempt
//    individu tetap boleh mengumpulkan dengan soal kosong.
// 2. Modal gerbang (dan pesan 400 dari server, lewat cerminan peta ini
//    di apps/api/src/lib/submit-gate.ts) menyebut JENIS soal yang
//    kosong, bukan hanya nomornya.
//
// Semua fungsi di sini murni agar bisa diuji tanpa peramban
// (lihat label-kumpulkan.test.mjs).

/**
 * Label bahasa Indonesia untuk jenis butir. tautan_ruas tampil sebagai
 * "Kuis RUAS" di sisi murid (kuisnya dikerjakan di RUAS); jenis itu tidak
 * pernah muncul di daftar soal kosong karena ia tidak terhitung.
 */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda",
  isian_singkat: "Isian singkat",
  uraian: "Uraian",
  unggah_foto: "Unggah foto",
  langkah_berurutan: "Langkah berurutan",
  refleksi: "Refleksi",
  tautan_ruas: "Kuis RUAS",
};

export function itemTypeLabel(itemType: string): string {
  return ITEM_TYPE_LABELS[itemType] ?? "Soal";
}

/**
 * Label tombol kumpulkan: label dasar apa adanya bila semua soal
 * terhitung sudah terjawab (atau memang tidak ada soal terhitung),
 * selain itu ditambah " · {sisa} soal belum terjawab". Hitungan memakai
 * angka yang sama dengan answerProgress halaman (butir tautan_ruas
 * sudah tersingkir dari total oleh pemanggil). Sisa negatif (answered
 * melebihi total) dianggap nol.
 */
export function submitButtonLabel(baseLabel: string, answered: number, total: number): string {
  const remaining = Math.max(0, total - answered);
  if (remaining === 0) return baseLabel;
  return `${baseLabel} · ${remaining} soal belum terjawab`;
}
