# Arsitektur Backend

**Status:** MVP.

API Hono di atas Bun menjadi satu pintu untuk web guru dan murid.

## Lapisan

1. **Routes** menerima HTTP request dan memilih operasi.
2. **Middleware** memeriksa sesi, peran, dan batas akses.
3. **Schemas** memvalidasi input dengan Zod.
4. **Services** menjalankan aturan domain dan transaksi.
5. **Database/storage adapters** mengakses MariaDB dan RustFS.

## Aturan penting

- Semua endpoint di bawah `/api/v1` kecuali endpoint kesehatan yang memang publik.
- JSON yang masuk divalidasi sebelum disimpan.
- Otorisasi dilakukan berdasarkan relasi data, bukan hanya role.
- Waktu aktivitas berasal dari server.
- Operasi pengumpulan dan penilaian harus aman bila dikirim ulang.

