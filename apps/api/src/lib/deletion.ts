// Hapus permanen materi (modul) dan LKPD: sampai fitur ini, modul/LKPD
// hanya dapat diarsipkan — tidak ada jalan menghapusnya utuh. Penghapusan
// permanen dijaga ketat (ditetapkan bersama guru): yang boleh hilang
// hanyalah materi yang BELUM dipakai penugasan dan BELUM dikerjakan
// murid. Begitu ada penugasan yang menunjuknya atau ada attempt murid
// padanya, datanya adalah bagian dari riwayat belajar dan hanya boleh
// diarsipkan.
//
// Urutan penjaga penting: rujukan penugasan diperiksa SEBELUM attempt,
// agar guru yang materinya masih terjadwal mendapat penjelasan itu
// lebih dulu (walau attempt juga sudah ada).
//
// Yang dihapus hanya baris basis data. Objek penyimpanan (sampul modul,
// lampiran blok/butir) TIDAK PERNAH ikut dihapus: salinan Perpustakaan
// Bersama merujuk kunci penyimpanan yang sama dengan sumbernya, jadi
// menghapus berkas fisik akan merusak salinan milik guru lain.
//
// Fungsi-fungsi ini murni agar dapat diuji tanpa basis data (lihat
// hapus-materi-lkpd.test.mjs); route menghitung rujukan/attempt dari
// basis data, lalu memakai keputusan di sini.

export type DeleteGuardResult = { ok: true } | { ok: false; status: 409; message: string };

export type DeleteGuardFacts = {
  /** Jumlah penugasan yang menunjuk materi/LKPD ini. */
  assignmentRefs: number;
  /** Jumlah attempt murid pada LKPD ini (untuk modul: pada semua LKPD-nya). */
  attemptCount: number;
};

export const MODULE_ASSIGNMENT_REF_MESSAGE =
  "Materi ini masih dipakai oleh penugasan dan tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.";
export const MODULE_ATTEMPTS_MESSAGE =
  "Sudah ada murid yang mengerjakan LKPD pada materi ini, sehingga materi tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.";
export const WORKSHEET_ASSIGNMENT_REF_MESSAGE =
  "LKPD ini masih dipakai oleh penugasan dan tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.";
export const WORKSHEET_ATTEMPTS_MESSAGE =
  "LKPD ini sudah dikerjakan murid dan tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.";

/** Keputusan hapus modul: rujukan penugasan (ke modul ATAU ke salah
 *  satu LKPD-nya — route menjumlahkan keduanya ke assignmentRefs)
 *  menolak lebih dulu, lalu attempt pada LKPD mana pun di dalamnya. */
export function moduleDeleteGuard(facts: DeleteGuardFacts): DeleteGuardResult {
  if (facts.assignmentRefs > 0) {
    return { ok: false, status: 409, message: MODULE_ASSIGNMENT_REF_MESSAGE };
  }
  if (facts.attemptCount > 0) {
    return { ok: false, status: 409, message: MODULE_ATTEMPTS_MESSAGE };
  }
  return { ok: true };
}

/** Keputusan hapus LKPD: rujukan penugasan menolak lebih dulu, lalu
 *  attempt murid (status apa pun, termasuk draf kosong). */
export function worksheetDeleteGuard(facts: DeleteGuardFacts): DeleteGuardResult {
  if (facts.assignmentRefs > 0) {
    return { ok: false, status: 409, message: WORKSHEET_ASSIGNMENT_REF_MESSAGE };
  }
  if (facts.attemptCount > 0) {
    return { ok: false, status: 409, message: WORKSHEET_ATTEMPTS_MESSAGE };
  }
  return { ok: true };
}
