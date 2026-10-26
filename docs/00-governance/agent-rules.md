# Aturan untuk Agen dan Kontributor

**Status:** Final untuk proses kerja; detail teknis mengikuti blueprint dan kode.

Dokumen ini mengatur cara agen atau kontributor bekerja di repositori SIMAK.

## Prinsip kerja

1. Baca `docs/README.md`, blueprint, dan dokumen area yang disentuh sebelum
   mengubah kode atau dokumentasi.
2. Gunakan istilah domain yang sudah ditetapkan: guru, murid, kelas, modul,
   LKPD, penugasan, pengumpulan, activity log, exit ticket, RUAS, dan SIMAK.
3. Pertahankan batas produk: RUAS adalah tempat kuis dan nilai asesmen resmi;
   SIMAK adalah tempat materi, latihan, tugas, dan bukti pembelajaran.
4. Jangan menambahkan fitur fase lanjut ke MVP tanpa keputusan yang dicatat.
5. Jangan menyimpan password RUAS di SIMAK atau menyalin kredensial ke seed,
   log, dokumentasi, dan contoh konfigurasi.
6. Untuk perubahan skema atau kontrak API, perbarui dokumentasi terkait pada
   perubahan yang sama.

## Cara menangani ketidakpastian

- Jika keputusan sudah ditandai **Final**, ikuti keputusan tersebut.
- Jika dokumen menyebut **Open**, jangan menyamarkan asumsi sebagai keputusan.
- Jika implementasi saat ini berbeda dari blueprint, catat gap-nya dan jelaskan
  konsekuensinya sebelum memilih arah.
- Pilih solusi terkecil yang memenuhi alur MVP dan bisa ditinjau.

## Batasan perubahan

Perubahan yang memengaruhi data murid, autentikasi, nilai, backup, atau deployment
harus dijelaskan dampaknya dalam pull request atau catatan perubahan. Hindari
perintah destruktif dan jangan menghapus data pengguna untuk menyelesaikan
masalah pengembangan.

