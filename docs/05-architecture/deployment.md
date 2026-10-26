# Deployment

**Status:** MVP.

## Layanan Docker Compose

| Layanan | Fungsi |
| --- | --- |
| `web` | Next.js untuk guru dan murid |
| `api` | Bun + Hono, laporan, presigned URL |
| `db` | MariaDB dengan volume persisten |
| `storage` | RustFS dengan volume persisten |
| `proxy` | Caddy atau Nginx untuk HTTPS dan routing |

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

