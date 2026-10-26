# SIMAK-001 — Fondasi aplikasi dan login RUAS

**Status:** Implemented pending staging verification  
**Tipe:** Foundation / vertical slice  
**Priority:** P0

## What to build

Siapkan fondasi yang memungkinkan guru dan murid menjalankan SIMAK dari
lingkungan lokal atau staging, lalu masuk menggunakan username dan password
RUAS yang sama. Setelah login berhasil, SIMAK menerbitkan sesi SIMAK sendiri
tanpa menyimpan password atau hash password RUAS.

Mekanisme autentikasi RUAS yang dipilih setelah pemeriksaan kode RUAS:

- `internal-endpoint` melalui `POST /api/auth` sebagai mode default MVP.
- `shared-db` tersedia sebagai fallback bila endpoint internal tidak dapat diakses.

Issue ini juga menetapkan migrasi database awal, konfigurasi environment,
middleware sesi, dan kontrak dasar error agar issue berikutnya memiliki fondasi
yang dapat dipakai.

## User stories covered

- Sebagai guru, saya dapat masuk ke SIMAK dengan akun RUAS.
- Sebagai murid, saya dapat masuk ke SIMAK tanpa membuat akun baru.
- Sebagai pengelola sistem, saya dapat menjalankan layanan inti dengan Docker.

## Acceptance criteria

- [x] `docker compose` memiliki konfigurasi layanan inti yang dibutuhkan untuk
      pengembangan, termasuk web, API, RustFS, dan koneksi ke MariaDB eksternal
      pada network `ferileenet`.
- [x] Mekanisme `RUAS_AUTH_MODE=internal-endpoint` dipilih berdasarkan pemeriksaan
      implementasi RUAS dan dicatat di dokumentasi.
- [x] Migrasi database pertama telah dihasilkan dari schema Drizzle.
- [x] Migrasi database pertama diterapkan dari keadaan database kosong di lingkungan lokal
      menggunakan MariaDB SIMAK yang baru dibuat.
- [x] Username dan password diteruskan ke endpoint autentikasi RUAS untuk diverifikasi
      dan sesi SIMAK diterbitkan setelah berhasil.
- [x] Password maupun hash password tidak disimpan di tabel SIMAK, log,
      response API, seed, atau file environment contoh.
- [x] Username atau password yang salah ditolak dengan error yang aman.
- [x] Akun yang dinonaktifkan di RUAS ditolak saat login SIMAK melalui endpoint RUAS.
- [x] Logout mencabut sesi SIMAK dan tidak mengubah status sesi di RUAS.
- [x] Sesi memakai cookie `httpOnly` berumur terbatas dengan secret
      yang berasal dari environment.
- [x] Endpoint autentikasi memiliki pembatasan percobaan login berulang.
- [x] `GET /api/v1/auth/me` mengembalikan identitas dan peran sesi aktif tanpa
      data rahasia.
- [x] Guru dan murid diarahkan ke area yang sesuai dengan perannya setelah login.
- [x] Dokumentasi mencatat adapter autentikasi RUAS, batas data yang disimpan,
      dan cara menjalankan login menggunakan akun contoh staging.

## Out of scope

- Pendaftaran akun baru di SIMAK.
- Reset password atau perubahan password.
- Sinkronisasi nilai RUAS.
- Role admin sekolah, wali kelas, atau orang tua.

## Blocked by

None - can start immediately.

## Related documentation

- `docs/00-governance/initial-architecture-notes.md`
- `docs/02-access/roles-and-permissions.md`
- `docs/05-architecture/security-and-secrets.md`

## Verification notes

- MariaDB SIMAK berhasil dibuat dari volume baru, lalu migrasi Drizzle dan seed
  berhasil dijalankan.
- Endpoint `https://ruas.smkpasirian-lmj.sch.id/api/auth` merespons dan API SIMAK
  mengembalikan `401` untuk kredensial yang salah.
- Login dengan kredensial RUAS yang valid dan verifikasi seluruh layanan staging
  masih perlu dilakukan menggunakan akun uji yang disediakan pemilik RUAS.
