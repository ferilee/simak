# Deployment

**Status:** MVP.

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
RUSTFS_ENDPOINT=http://rustfs:9000
```

Hostname `mariadb` hanya berlaku dari container yang ikut `ferileenet`. Untuk
perintah migrasi yang dijalankan dari host, gunakan alamat dan port MariaDB
yang memang dipublikasikan oleh deployment tersebut.

## Lingkungan

1. `local` untuk pengembangan.
2. `staging` dengan akun RUAS contoh.
3. `production` untuk kelas nyata.

Promosi ke production dilakukan setelah alur login, pengumpulan, penilaian,
ekspor, beban ringan, dan pemulihan lolos di staging.

## Backup

- Jadwalkan dump MariaDB.
- Jadwalkan snapshot volume RustFS.
- Uji pemulihan, bukan hanya pembuatan backup.
- Jangan mengekspor kredensial atau data production ke dokumentasi.
