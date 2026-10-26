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
| Pengemasan | Docker Compose: `web`, `api`, `storage`, `proxy` (Caddy); MariaDB memakai layanan eksternal |

## Mulai cepat (pengembangan lokal)

Prasyarat: Node.js + npm, Bun, dan Docker.

```bash
npm install                 # dari akar repo — memasang semua workspace
cp .env.example .env        # lalu sesuaikan nilainya
# isi RUAS_AUTH_ENDPOINT dengan URL lengkap endpoint login RUAS, misalnya http://localhost:3000/api/auth
# pastikan database SIMAK tersedia pada container MariaDB di network ferileenet

# Nyalakan storage SIMAK; MariaDB dikelola oleh Compose RUAS yang sudah ada:
docker compose up -d storage

npm run db:generate         # hasilkan migrasi dari skema Drizzle
npm run db:migrate          # terapkan migrasi ke MariaDB
npm run db:seed             # isi data contoh (1 guru, 2 murid, kelas XI DPIB, modul + LKPD contoh)

npm run dev:api             # API di http://localhost:3001 (cek /health)
npm run dev:web             # Web di http://localhost:3000
```

## Menyiapkan MariaDB eksternal

Compose SIMAK tidak membuat container MariaDB. API mengakses container yang
sudah ada dengan hostname `mariadb` melalui network Docker eksternal
`ferileenet`. Gunakan database terpisah dari database RUAS agar tabel `users`
SIMAK tidak bercampur dengan tabel RUAS.

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

## Menjalankan seluruh sistem dengan Docker

```bash
cp .env.example .env        # sesuaikan SESSION_SECRET dan kata sandi basis data
docker compose up -d --build
```

Layanan: `web` (Next.js), `api` (Hono di Bun), `storage` (RustFS; konsol admin
hanya dari localhost:9014), `proxy` (Caddy). MariaDB tetap dikelola oleh
Compose RUAS.

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

- [ ] `docker compose up` menaikkan empat layanan SIMAK dari nol setelah
      MariaDB eksternal dan network `ferileenet` tersedia.
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
