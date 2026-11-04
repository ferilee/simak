// Halaman tunggu "Penugasan belum dibuka" (v1.0.37): murid yang membuka
// detail penugasan sebelum waktu bukanya (opensAt) dulu hanya menerima
// 403 berisi pesan teks, sehingga halaman murid tampil nyaris kosong —
// hanya tautan kembali dan toast kecil — dan murid mengira aplikasi
// rusak. Padahal keadaannya bukan galat: penugasan itu memang belum
// waktunya, dan muridnya SUDAH terkonfirmasi sebagai sasaran penugasan
// tersebut (gerbang ini berjalan sesudah accessibleAssignment).
//
// Route detail kini memperkaya 403 khusus ini dengan data ringkas
// penugasan — judul, mapel, jam buka, batas pengumpulan — agar halaman
// murid dapat menggambar halaman tunggu bertema lengkap dengan hitung
// mundur. Semuanya tetap terkunci sampai opensAt (keputusan guru:
// materi pun tidak boleh dibaca lebih dulu). Murid yang BUKAN sasaran
// tetap menerima 404 polos tanpa data apa pun — tidak ada kebocoran
// jadwal ke murid yang tidak berhak.
//
// Fungsi ini murni agar bentuk responsnya bisa diuji tanpa basis data
// (lihat halaman-tunggu.test.mjs).

export type NotYetOpenAssignment = {
  title: string;
  opensAt: Date;
  dueAt: Date;
};

export type NotYetOpenBody = {
  ok: false;
  message: string;
  data: {
    title: string;
    subject_name: string | null;
    opens_at: string;
    closes_at: string;
  };
};

/**
 * Badan respons 403 "belum dibuka": pesan dipertahankan persis seperti
 * sebelumnya; data adalah tambahan murni. opens_at/closes_at dikirim
 * sebagai string ISO, sama seperti serialisasi detail yang berhasil
 * (opens_at/due_at pada serializer murid).
 */
export function buildNotYetOpenBody(assignment: NotYetOpenAssignment, subjectName: string | null): NotYetOpenBody {
  return {
    ok: false,
    message: "Penugasan belum dibuka.",
    data: {
      title: assignment.title,
      subject_name: subjectName,
      opens_at: assignment.opensAt.toISOString(),
      closes_at: assignment.dueAt.toISOString(),
    },
  };
}
