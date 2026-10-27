# Deployment

**Status:** MVP.

Dokumen ini menjelaskan deployment production SIMAK melalui GitHub Container
Registry (GHCR) dan Arcane. Alur normal dibuat sesingkat mungkin; migration
database hanya dijalankan ketika release membawa perubahan struktur database.

## Layanan Docker Compose

| Layanan | Fungsi |
| --- | --- |
| `web` | Next.js untuk guru dan murid |
| `api` | Bun + Hono, laporan, presigned URL |
| `proxy` | Caddy atau Nginx untuk HTTPS dan routing |

MariaDB dijalankan oleh Compose RUAS yang sudah ada sebagai container
`mariadb` pada network Docker eksternal `ferileenet`. Compose SIMAK hanya
menyambungkan `api` ke network tersebut. RustFS juga dijalankan oleh Compose
infrastruktur terpisah sebagai container `rustfs` pada network yang sama.
Database SIMAK harus dibuat sebagai database terpisah dari database RUAS.

Variabel wajib untuk Compose SIMAK:

```env
SIMAK_DATABASE_URL=mysql://simak:<password>@mariadb:3306/simak
SIMAK_RUSTFS_ENDPOINT=http://rustfs:9000
RUSTFS_PUBLIC_ENDPOINT=https://storage.example.com
```

Hostname `mariadb` hanya berlaku dari container yang ikut `ferileenet`. Untuk
perintah migrasi yang dijalankan dari host, gunakan alamat dan port MariaDB
yang memang dipublikasikan oleh deployment tersebut.

Jika `ferileenet` dipakai bersama aplikasi lain, pastikan alias `mariadb` dan
`rustfs` menunjuk container infrastruktur SIMAK/RUAS yang benar. Alias khusus
dapat dipakai dengan mengatur `SIMAK_DATABASE_URL` dan
`SIMAK_RUSTFS_ENDPOINT`.
`RUSTFS_PUBLIC_ENDPOINT` harus menunjuk endpoint S3 yang dapat dijangkau
browser karena URL unggah presigned dikirim langsung ke browser.

Proxy SIMAK mempublikasikan HTTP pada port `8080` dan HTTPS pada port `8443`
secara default. Nilai tersebut dapat diubah dengan `SIMAK_HTTP_PORT` dan
`SIMAK_HTTPS_PORT` jika host sudah memiliki reverse proxy pada port 80/443.

## Lingkungan

1. `local` untuk pengembangan.
2. `staging` dengan akun RUAS contoh.
3. `production` untuk kelas nyata.

Promosi ke production dilakukan setelah alur login, pengumpulan, penilaian,
ekspor, beban ringan, dan pemulihan lolos di staging.

## Alur release normal

Untuk perubahan UI, teks, atau logika yang tidak mengubah schema database:

```text
commit → push tag v* → GitHub Actions build/publish GHCR
      → ubah SIMAK_IMAGE_TAG di Arcane
      → Pull → Redeploy
```

Workflow `Publish SIMAK images` berjalan pada tag versi `v*` atau dijalankan
manual dari GitHub Actions. Workflow mem-publish dua image dengan tag yang sama:

```text
ghcr.io/ferilee/simak-api:<tag>
ghcr.io/ferilee/simak-web:<tag>
```

Tag yang dimasukkan ke `SIMAK_IMAGE_TAG` harus persis sama dengan tag yang
berhasil tersedia di GHCR. Untuk production, sebaiknya gunakan full commit SHA
karena immutable. Tag versi seperti `v1.0.2` juga dapat digunakan selama tag
tersebut tidak dipindahkan ke commit lain.

### Dari development

Pastikan commit yang akan dirilis sudah ada di branch utama, lalu buat tag versi:

```bash
git tag -a v1.0.2 <commit-sha> -m "Release v1.0.2"
git push origin v1.0.2
```

Tunggu workflow selesai. Jika workflow gagal atau belum selesai, image belum
boleh dipakai di Arcane.

### Di Arcane

Pada project `simak`, buka **Configuration → `.env`**, lalu ubah hanya nilai
tag image:

```env
SIMAK_IMAGE_TAG=v1.0.2
```

Simpan, pilih **Pull**, kemudian **Redeploy**. Jangan mengganti seluruh isi
`.env` karena file tersebut berisi secret production.

### Verifikasi dari VPS

Jika perlu memeriksa compose dari shell, gunakan `sudo` karena `.env` biasanya
dimiliki oleh user Arcane dan permission-nya `600`:

```bash
cd /srv/platform/simak

sudo docker compose \
  --env-file /srv/platform/simak/.env \
  -f /srv/platform/simak/compose.yaml \
  config >/dev/null && echo "compose valid"

sudo docker compose \
  --env-file /srv/platform/simak/.env \
  -f /srv/platform/simak/compose.yaml \
  ps
```

## Release dengan migration database

Jika release menambah tabel, kolom, index, atau constraint, migration harus
dijalankan satu kali setelah image baru tersedia di VPS dan sebelum API baru
dipakai penuh.

Urutannya:

1. Push tag dan tunggu image GHCR selesai.
2. Ubah `SIMAK_IMAGE_TAG` di Arcane.
3. Jalankan **Pull** agar image API dan web baru tersedia di host.
4. Buat backup MariaDB.
5. Jalankan migration menggunakan image baru.
6. Verifikasi schema database.
7. Jalankan **Redeploy** di Arcane.
8. Lakukan smoke test.

Contoh migration production:

```bash
cd /srv/platform/simak

sudo docker compose \
  --env-file /srv/platform/simak/.env \
  -f /srv/platform/simak/compose.yaml \
  --profile ops \
  run --rm -T \
  --entrypoint /bin/sh \
  migrate \
  -lc 'cd /app/packages/db && exec bun /app/packages/db/node_modules/.bin/drizzle-kit migrate --config /app/packages/db/drizzle.config.ts'
```

Pastikan migration yang diharapkan memang ada di image yang baru ditarik:

```bash
sudo docker compose \
  --env-file /srv/platform/simak/.env \
  -f /srv/platform/simak/compose.yaml \
  --profile ops \
  run --rm -T \
  --entrypoint /bin/sh \
  migrate \
  -lc 'test -f /app/packages/db/migrations/0004_careless_nomad.sql && echo "migration 0004 tersedia"'
```

Contoh verifikasi untuk migration anti-cheat:

```bash
sudo docker exec -it mariadb mariadb -uroot -p -e \
  "SHOW TABLES FROM simak LIKE 'integrity_events';"
```

Jika migration keluar dengan status sukses tetapi tabel baru tidak ada, hampir
selalu image yang dipakai masih image lama. Periksa keberadaan file migration
di dalam container sebelum mengulangi migration.

Migration hanya diperlukan sekali per perubahan schema. Rilis UI berikutnya
kembali memakai alur release normal.

## Setup directory production satu kali

Directory deployment production berada di `/srv/platform/simak`:

```bash
sudo install -d -o ferilee -g ferilee -m 775 /srv/platform/simak
```

File yang diperlukan:

```text
/srv/platform/simak/compose.yaml
/srv/platform/simak/Caddyfile.production
/srv/platform/simak/.env
```

`.env` harus berisi secret production dan tidak boleh di-commit atau diberi
permission baca untuk semua user. Arcane perlu tetap dapat membaca file tersebut.

## Backup

- Jadwalkan dump MariaDB.
- Jadwalkan snapshot volume RustFS.
- Uji pemulihan, bukan hanya pembuatan backup.
- Jangan mengekspor kredensial atau data production ke dokumentasi.

## Rollback dasar

Jika release gagal, ubah `SIMAK_IMAGE_TAG` kembali ke tag image sebelumnya,
lakukan **Pull**, lalu **Redeploy**. Jangan menghapus database atau volume.

Rollback image tidak otomatis membatalkan migration. Karena itu migration baru
harus backward-compatible terhadap image sebelumnya, atau rollback database
harus dilakukan dari backup dan hanya atas keputusan operator.

## Troubleshooting singkat

| Gejala | Penyebab umum | Tindakan |
| --- | --- | --- |
| GHCR `not found` | Tag belum dipublish atau salah ketik | Pastikan workflow sukses dan gunakan tag persis dari GHCR |
| `.env: permission denied` | File hanya dapat dibaca user Arcane | Jalankan perintah host dengan `sudo`; jangan membuka permission secret |
| Migration sukses tetapi tabel baru tidak ada | Container migration memakai image lama | Pull image baru dan cek file migration di dalam container |
| Web/API tidak berubah setelah redeploy | Browser cache atau image tag lama | Periksa `SIMAK_IMAGE_TAG`, status container, lalu hard refresh |
