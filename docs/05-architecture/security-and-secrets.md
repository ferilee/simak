# Keamanan dan Rahasia

**Status:** MVP.

## Autentikasi

- Username dan password diverifikasi oleh sumber akun RUAS.
- SIMAK tidak menyimpan password atau hash password RUAS.
- SIMAK menerbitkan sesi sendiri setelah verifikasi berhasil.
- MVP memakai cookie `httpOnly` berumur terbatas yang ditandatangani dengan
  `SESSION_SECRET`; data sesi disimpan di memori API sehingga restart layanan
  mencabut sesi aktif dan pengguna harus login kembali.
- Akun RUAS yang tidak aktif harus ditolak.
- Login memiliki rate limit.

## Otorisasi dan privasi

- Guru hanya melihat data kelas dan tugas yang dimilikinya.
- Murid hanya melihat data miliknya dan penugasan kelasnya.
- Nama dan NIS hanya ditampilkan sesuai cakupan guru yang berwenang.
- Activity log mencatat aktivitas belajar, bukan isi perangkat.

## Berkas dan rahasia

- Bucket RustFS privat.
- Upload dan download memakai presigned URL berumur pendek.
- Kredensial RustFS hanya tersedia untuk API melalui environment variable.
- Nama objek berkas dibuat server.
- File dibatasi tipe dan ukuran; batas baku blueprint adalah 10 MB.
- Nilai rahasia tidak boleh masuk `.env.example`, seed, log, atau dokumentasi.
