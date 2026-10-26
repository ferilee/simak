# Catatan Arsitektur Awal

**Status:** Final untuk MVP; beberapa detail integrasi berstatus Open.

## Keputusan awal

| Area | Keputusan |
| --- | --- |
| Bentuk aplikasi | Satu monorepo, satu web Next.js, satu API Hono |
| Runtime API | Bun |
| Data terstruktur | MariaDB melalui Drizzle ORM mode MySQL |
| Berkas | RustFS S3-compatible melalui presigned URL |
| Akun | Diverifikasi oleh sumber akun RUAS; SIMAK tidak menyimpan password |
| Pengemasan | Docker Compose dan npm workspaces |
| Pengguna MVP | Guru dan murid |

## Batas arsitektur MVP

- Tidak ada microservices.
- Tidak ada sistem akun kedua.
- Tidak ada sinkronisasi nilai RUAS otomatis.
- Tidak ada mode offline penuh.
- Tidak ada realtime yang wajib untuk alur inti.

## Keputusan integrasi RUAS

Kode RUAS yang tersedia memiliki endpoint `POST /api/auth` yang menerima
username dan password, memeriksa status akun, lalu mengembalikan token dan role.
Karena itu mode autentikasi MVP yang dipilih adalah `internal-endpoint`:

- SIMAK mengirim kredensial hanya ke endpoint RUAS melalui koneksi internal.
- Verifikasi password dan status aktif tetap terjadi di RUAS.
- SIMAK tidak menyimpan password, hash password, atau token RUAS.
- SIMAK menerbitkan sesi SIMAK sendiri setelah verifikasi berhasil.

Mode `shared-db` tetap tersedia sebagai fallback untuk lingkungan yang memang
belum dapat mengakses endpoint RUAS. Mode tersebut membutuhkan akses baca
terbatas ke database RUAS dan tidak menjadi mode default MVP.

## Keputusan yang masih harus dibuktikan

URL endpoint RUAS dan konektivitas dari container API harus dibuktikan di
staging menggunakan akun contoh. Jika endpoint hanya mengembalikan username dan
role, username dipakai sebagai nama tampilan sementara sampai kontrak profil
RUAS ditambahkan.
