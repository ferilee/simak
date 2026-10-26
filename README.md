# SIMAK — Sumber Informasi, Materi, dan Aktivitas Kelas

Aplikasi materi dan LKPD interaktif, pendamping **RUAS (Ruang Asesmen)**.
RUAS menilai, SIMAK mengajar: kuis dan nilai asesmen tetap di RUAS; SIMAK mengurus
materi, LKPD, penugasan, pengumpulan, presensi, dan rekap bukti.

Rancangan lengkap: [`docs/blueprint-simak.md`](docs/blueprint-simak.md) (versi acuan 1.1).
Indeks dokumentasi terstruktur: [`docs/README.md`](docs/README.md).

Dokumentasi dibagi menjadi governance, produk, akses, konten, offline dan
sinkronisasi, arsitektur, serta perencanaan. Blueprint tetap menjadi sumber
acuan untuk keputusan produk; dokumen area menjelaskan keputusan tersebut agar
mudah dipakai saat implementasi.

## Stack

| Lapisan | Pilihan |
| --- | --- |
| Runtime API | Bun + Hono (`apps/api`) |
| Frontend | Next.js + TypeScript (`apps/web`) — halaman murid wajib ringan |
| Basis data | MariaDB via Drizzle ORM mode MySQL (`packages/db`) |
| Berkas | RustFS (S3-compatible), bucket `simak`, lewat presigned URL |
| Paket | npm workspaces (monorepo) — npm mengelola paket, Bun menjalankan aplikasi |
| Pengemasan | Docker Compose: `web`, `api`, `proxy` (Caddy); MariaDB dan RustFS memakai layanan eksternal |

## Mulai cepat (pengembangan lokal)

Prasyarat: Node.js + npm, Bun, dan Docker.

```bash
npm install                 # dari akar repo — memasang semua workspace
cp .env.example .env        # lalu sesuaikan nilainya
# isi RUAS_AUTH_ENDPOINT dengan URL lengkap yang dapat dijangkau dari container API
# contoh: https://ruas.smkpasirian-lmj.sch.id/api/auth
# pastikan database SIMAK tersedia pada container MariaDB di network ferileenet

# MariaDB dan RustFS dikelola oleh Compose infrastruktur yang sudah ada.

npm run db:generate         # hasilkan migrasi dari skema Drizzle
npm run db:migrate          # terapkan migrasi ke MariaDB
npm run db:seed             # isi data contoh (1 guru, 2 murid, kelas XI DPIB, modul + LKPD contoh)

npm run dev:api             # API di http://localhost:3001 (cek /health)
npm run dev:web             # Web di http://localhost:3000
```

## Menyiapkan MariaDB eksternal

Compose SIMAK tidak membuat container MariaDB atau RustFS. API mengakses
container yang sudah ada dengan hostname `mariadb` dan `rustfs` melalui network
Docker eksternal `ferileenet`. Gunakan database terpisah dari database RUAS agar
tabel `users` SIMAK tidak bercampur dengan tabel RUAS.

Buat database dan user SIMAK satu kali menggunakan kredensial root MariaDB,
lalu isi `SIMAK_DATABASE_URL` di `.env`:

```bash
docker network inspect ferileenet
docker exec -it mariadb mariadb -uroot -p
```

```sql
CREATE DATABASE simak CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'simak'@'%' IDENTIFIED BY 'ganti-dengan-password-kuat';
GRANT ALL PRIVILEGES ON simak.* TO 'simak'@'%';
FLUSH PRIVILEGES;
```

```env
SIMAK_DATABASE_URL=mysql://simak:ganti-dengan-password-kuat@mariadb:3306/simak
```

Network `ferileenet` harus sudah dibuat oleh Compose RUAS sebelum SIMAK
dijalankan. Jika network belum ada, buat dengan `docker network create
ferileenet` atau jalankan Compose RUAS terlebih dahulu.

RustFS juga harus tersedia pada network yang sama. Nilai endpoint dari dalam
container API adalah `http://rustfs:9000`.

## Menjalankan seluruh sistem dengan Docker

```bash
cp .env.example .env        # sesuaikan SESSION_SECRET dan kata sandi basis data
docker compose up -d --build
```

Layanan: `web` (Next.js), `api` (Hono di Bun), dan `proxy` (Caddy). MariaDB
dan RustFS dikelola oleh Compose infrastruktur terpisah.
Proxy SIMAK memakai `localhost:8080` untuk HTTP dan `localhost:8443` untuk
HTTPS secara default agar tidak mengambil port 80/443 milik reverse proxy host.
Dengan konfigurasi default, buka `https://simak.localhost:8443`. Atur
`SIMAK_HTTP_PORT` dan `SIMAK_HTTPS_PORT` bila port lain diperlukan.

## Struktur

```text
simak/
  apps/
    api/        Hono + Bun — routes per sumber daya, middleware sesi/peran
    web/        Next.js — app/guru (kaya editor), app/murid (ringan)
  packages/
    db/         Skema Drizzle 13 tabel + relasi, drizzle.config, seed contoh
    shared/     Konstanta jenis blok + skema Zod (konten blok, opsi butir, exit ticket)
    config/     tsconfig dasar bersama
  docs/         Blueprint SIMAK (acuan rancangan)
```

## Skema basis data (13 tabel)

`users` (pemetaan profil RUAS — **tanpa kata sandi**), `classes`, `class_members`,
`modules`, `module_blocks`, `worksheets`, `worksheet_items`, `assignments`,
`assignment_classes`, `submissions`, `submission_answers`, `activity_logs`,
`exit_tickets`. Rekap bukti adalah query agregasi, bukan tabel tersendiri.

## Checklist Tahap 0 — Fondasi (pekerjaan pertama)

- [ ] `docker compose up` menaikkan tiga layanan SIMAK dari nol setelah
      MariaDB, RustFS, dan network `ferileenet` tersedia.
- [x] Migrasi Drizzle pertama terbentuk dari skema di `packages/db` dan teraplikasi bersih.
- [x] **Buktikan mekanisme akun RUAS**: kode RUAS menyediakan `POST /api/auth`,
      sehingga MVP memakai `RUAS_AUTH_MODE=internal-endpoint`.
- [ ] Login SIMAK menerima username + password RUAS sungguhan (akun contoh di staging);
      akun yang dinonaktifkan di RUAS ikut tertolak.
- [ ] Seed contoh berjalan; kelas XI DPIB dan modul Matematika Keuangan terbaca dari API.

Setelah Tahap 0: Tahap 1 Materi → Tahap 2 LKPD → Tahap 3 Penugasan & Penilaian →
Tahap 4 Bukti & Rilis. Urutan dan estimasinya ada di blueprint Bagian 10.

## Catatan penting

- Nilai desimal dari Drizzle/MySQL dibaca sebagai string — ubah ke angka di lapisan layanan.
- Kolom JSON MariaDB tidak menegakkan skema; semua `content_json` / `options_json`
  wajib divalidasi Zod (`@simak/shared`) di API sebelum disimpan.
- Waktu disimpan dalam UTC (koneksi `timezone: "Z"`), ditampilkan sebagai WIB di antarmuka.
- Jangan mencampur pengelola paket: npm untuk paket/workspace, Bun untuk runtime.
