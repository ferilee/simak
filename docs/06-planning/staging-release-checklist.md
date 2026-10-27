# Checklist Staging dan Rilis SIMAK

**Status:** Tahap 4 — siap divalidasi di staging.

Dokumen ini adalah gerbang sebelum image SIMAK dipromosikan ke VPS. Pekerjaan
fitur dilakukan dan diverifikasi di development terlebih dahulu; staging
menggunakan database, bucket, akun, dan domain yang terpisah dari production.

## Perubahan Tahap 4

- Rekap sesi per penugasan dalam JSON, CSV, dan PDF tabel.
- Rekap berdasarkan rentang tanggal pembukaan penugasan dalam JSON, CSV, dan PDF.
- Impor nilai RUAS berdasarkan NIS atau username.
- Baris impor yang tidak cocok atau duplikat tetap disimpan dan ditandai.
- Nilai RUAS tampil berdampingan dengan nilai LKPD pada rekap.

## Gerbang development

- [ ] `npx tsc --noEmit -p apps/api/tsconfig.json`
- [ ] `npx tsc --noEmit -p apps/web/tsconfig.json`
- [ ] `npm run build -w @simak/web`
- [ ] `docker compose config` berhasil tanpa interpolasi rahasia yang kosong.
- [ ] Migrasi database terbaru (`0003_tidy_ruas_scores`) tersedia di image API.
- [ ] Perubahan database telah dicadangkan sebelum migrasi staging.

## Persiapan staging

Untuk staging lokal terisolasi, siapkan dan jalankan:

```bash
cp .env.staging.example .env.staging
docker compose --env-file .env.staging -p simak-staging -f docker-compose.staging.yml up -d --build
set -a; source .env.staging; set +a
npm run db:migrate
npm run db:seed
```

Buka `https://simak-staging.localhost:18443`. Port staging berbeda dari
development: MariaDB `3339`, RustFS `9119/9120`, HTTP `18080`, dan HTTPS
`18443`. Hentikan hanya stack ini dengan:

```bash
docker compose --env-file .env.staging -p simak-staging -f docker-compose.staging.yml down
```

Jangan memakai `down -v` kecuali memang ingin menghapus seluruh data staging.

### Hasil run staging lokal — 27 Oktober 2026

- [x] Compose staging tervalidasi dan stack terisolasi berhasil naik.
- [x] MariaDB staging healthy pada port `3339`.
- [x] RustFS staging aktif pada port `9119/9120`.
- [x] Migrasi database dan seed data contoh berhasil.
- [x] `https://simak-staging.localhost:18443/` dan `/login` mengembalikan HTTP 200.
- [x] Endpoint guru tanpa sesi mengembalikan HTTP 401.
- [ ] Login valid/salah dan akun nonaktif dengan akun RUAS contoh.
- [ ] Uji end-to-end guru–murid dan ekspor melalui browser staging.

- [ ] Buat file environment staging di luar repository; jangan menyalin `.env` production.
- [ ] Pastikan `SIMAK_DATABASE_URL` menunjuk database SIMAK staging yang terpisah.
- [ ] Pastikan `SIMAK_RUSTFS_ENDPOINT` dan `RUSTFS_PUBLIC_ENDPOINT` menunjuk bucket staging.
- [ ] Pastikan network Docker dan alias `mariadb`/`rustfs` sesuai deployment staging.
- [ ] Pastikan akun uji guru dan murid berasal dari data staging, bukan data kelas nyata.
- [ ] Jalankan backup database dan uji bahwa file backup dapat dibaca.

## Deploy dan smoke test staging

Jalankan dari checkout/tag yang akan diuji:

```bash
npm ci
npm run build -w @simak/web
npm run db:migrate -w @simak/db
docker compose config
docker compose up -d --build
docker compose ps
```

Lalu verifikasi alur berikut:

- [ ] Login guru dan murid berhasil.
- [ ] Guru membuat/terbitkan modul, LKPD, dan penugasan.
- [ ] Murid bergabung ke kelas yang benar dan melihat materi/penugasan.
- [ ] Murid membuka materi, membuka RUAS, mengerjakan LKPD, dan mengirim LKPD.
- [ ] Murid mengirim exit ticket; guru dapat melihatnya.
- [ ] Guru menilai LKPD; nilai dan komentar terlihat di sisi murid.
- [ ] Rekap sesi menampilkan presensi berdasarkan jejak aktivitas dan pengumpulan.
- [ ] Ekspor CSV dan PDF sesi dapat dibuka; tabel PDF tidak terpotong.
- [ ] Rekap rentang tanggal hanya memuat penugasan terbit/ditutup yang dibuka pada rentang tersebut.
- [ ] Ekspor CSV dan PDF rentang dapat dibuka.
- [ ] Impor RUAS dengan NIS cocok masuk ke murid yang benar.
- [ ] Identifier tidak ditemukan dan identifier duplikat tampil sebagai baris yang ditandai.
- [ ] Nilai RUAS tampil di rekap sesi dan ekspor.
- [ ] Guru tidak dapat melihat penugasan milik guru lain.
- [ ] Murid tidak dapat mengakses endpoint guru.
- [ ] Upload lampiran dan pembukaan URL RUAS tetap berjalan.

## Keputusan rilis

- [ ] Tidak ada error baru pada log `api`, `web`, `proxy`, MariaDB, dan RustFS.
- [ ] Backup dan prosedur rollback sudah dicatat oleh operator.
- [ ] Image GHCR diberi tag immutable (commit SHA), bukan hanya `latest`.
- [ ] Compose production menunjuk tag yang sama dengan hasil uji staging.
- [ ] Rilis dilakukan pada jendela perubahan yang disepakati.
- [ ] Setelah rilis, ulangi smoke test login, materi, pengumpulan, rekap, dan impor.
- [ ] Jika gagal, hentikan promosi dan rollback image/compose; jangan menghapus data database.

## Di luar cakupan rilis ini

Sinkronisasi nilai RUAS otomatis, dashboard analitik, dan penghapusan data impor
lama belum menjadi bagian dari tahap ini.
