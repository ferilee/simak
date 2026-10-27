# Rencana Rilis Production SIMAK

Target production: `simak.smkpasirian-lmj.sch.id`.

## Artefak

- Image API: `ghcr.io/ferilee/simak-api:<commit-sha>`
- Image web: `ghcr.io/ferilee/simak-web:<commit-sha>`
- Compose Arcane: `compose.production.yaml`
- Reverse proxy internal: Caddy HTTP pada port host `8080`.
- TLS publik: Nginx Proxy Manager, diarahkan ke `127.0.0.1:8080`.

## Urutan operasi

1. Pastikan release gate staging berstatus GO untuk risiko yang hendak dibawa.
2. Push commit/tag ke GitHub; workflow `Publish SIMAK images` hanya push image
   pada tag `v*` atau dispatch manual.
3. Tunggu dua image GHCR selesai dan catat commit SHA yang dipakai.
4. Di Arcane, buat stack `simak` dari `compose.production.yaml`.
5. Isi environment secret dari `.env.production.example`; `SIMAK_IMAGE_TAG`
   harus berupa commit SHA immutable.
6. Pastikan network eksternal `ferileenet`, container `mariadb`, dan container
   `rustfs` sudah ada sebelum stack dijalankan.
7. Buat backup MariaDB sebelum migrasi.
8. Jalankan migrasi satu kali:

   ```bash
   docker compose --env-file .env -f compose.production.yaml --profile ops run --rm migrate
   ```

9. Jalankan/redeploy stack normal, lalu atur Nginx Proxy Manager:
   `simak.smkpasirian-lmj.sch.id` → `127.0.0.1:8080` dengan SSL publik.
10. Verifikasi login, materi, pengumpulan, penilaian, rekap, ekspor, dan upload.

## Catatan RustFS

`RUSTFS_PUBLIC_ENDPOINT` production menggunakan
`https://rustfs.ferilee.gurumuda.eu.org`. Nilai tersebut harus tetap berupa
hostname HTTPS yang dapat dijangkau browser, bukan `http://rustfs:9000` dan
bukan `localhost`. Container RustFS existing tetap dipakai melalui network
`ferileenet`; SIMAK tidak membuat service RustFS kedua.

## Batasan

Pembuatan directory `/srv/platform/simak`, pengisian secret Arcane, push GHCR,
dan redeploy VPS belum dilakukan dalam tahap persiapan ini.
