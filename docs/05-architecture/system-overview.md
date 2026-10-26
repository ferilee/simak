# Gambaran Sistem

**Status:** Final untuk MVP.

```text
Next.js web
  guru: editor, kelas, penugasan, penilaian, rekap
  murid: materi, LKPD, pengumpulan, exit ticket
          |
          v
Hono API di Bun
  auth, otorisasi, domain services, presign, laporan
       |                         |
       v                         v
MariaDB via Drizzle          RustFS S3-compatible
data terstruktur             gambar, foto, lampiran
       |
       v
RUAS untuk verifikasi akun, kuis, dan nilai asesmen resmi
```

## Batas layanan

- `web` menyajikan antarmuka.
- `api` adalah pintu masuk data dan otorisasi.
- `db` menyimpan data terstruktur.
- `storage` menyimpan berkas privat.
- `proxy` menangani HTTPS dan routing deployment.

Tidak ada microservices untuk MVP.

