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

/**
 * Label tombol kumpulkan pada keadaan SESUDAH pengumpulan: tombol bilah
 * aksi bawah halaman LKPD tetap tampil pada attempt terkumpul/dinilai
 * (nonaktif), dan labelnya menyebut keadaannya — memakai istilah resmi
 * yang sama dengan app/lib/labels.ts ("Sudah dikumpulkan"/"Sudah
 * dinilai") — agar anggota kelompok lain langsung tahu LKPD kelompoknya
 * sudah dikumpulkan salah satu anggota, bukan mengira tombolnya rusak.
 * Status draf (dan nilai tak dikenal) menghasilkan null: pemanggil
 * memakai label kumpulkan biasa.
 */
export function submitDoneLabel(status: string | null | undefined): string | null {
  if (status === "terkumpul") return "Sudah dikumpulkan";
  if (status === "dinilai") return "Sudah dinilai";
  return null;
}

/**
 * Keterangan kecil waktu pengumpulan di dekat tombol: "Dikumpulkan
 * {tanggal} pukul {jam}" (Bahasa Indonesia, zona Asia/Jakarta — pola
 * yang sama dengan penanda "Terakhir diubah oleh" di halaman LKPD).
 * Berasal dari bidang submitted_at respons attempt; null/kosong/rusak
 * menghasilkan null (keterangan tidak ditampilkan). Nama pengumpul
 * tidak ditampilkan: ia memang tidak tercatat di basis data.
 */
export function submittedAtCaption(submittedAt: string | null | undefined): string | null {
  if (!submittedAt) return null;
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return null;
  const tanggal = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(date);
  const jam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(date);
  return `Dikumpulkan ${tanggal} pukul ${jam}`;
}
