# SIMAK-012 — Hardening, pengujian perangkat, backup, dan rilis staging

**Status:** Ready  
**Tipe:** Quality / release  
**Priority:** P0

## What to build

Siapkan MVP agar dapat diuji dan dipakai secara aman di staging sebelum kelas
nyata. Verifikasi alur ujung-ke-ujung, perangkat mobile, pengumpulan serentak,
pemulihan Docker Compose, backup MariaDB/RustFS, dan dokumentasi operasional.

Issue ini tidak menambah fitur produk. Hasilnya adalah bukti bahwa perilaku MVP
yang sudah dibangun cukup stabil untuk pilot.

## User stories covered

- Sebagai guru, saya dapat menjalankan sesi tanpa kehilangan data.
- Sebagai murid, saya dapat menyelesaikan tugas dari perangkat mobile.
- Sebagai pengelola sistem, saya dapat memulihkan data dan layanan setelah gangguan.

## Acceptance criteria

- [ ] Skenario login valid, password salah, dan akun RUAS nonaktif diverifikasi di staging.
- [ ] Satu alur penuh guru menugaskan, murid mengerjakan, guru menilai, dan laporan
      diekspor berhasil dijalankan tanpa intervensi database manual.
- [ ] Penilaian otomatis mencakup kasus toleransi angka dan pemisah ribuan.
- [ ] Pengumpulan dari sekitar 36 murid dalam 15 menit terakhir tidak membuat API
      atau halaman utama gagal dimuat.
- [ ] Pengujian HP Android kelas menengah mencakup jaringan lambat, reload,
      autosave, foto, dan pengumpulan.
- [ ] Restart seluruh Docker Compose mempertahankan data MariaDB dan object RustFS.
- [ ] Dump MariaDB dan snapshot RustFS dibuat sesuai jadwal yang terdokumentasi.
- [ ] Backup berhasil dipulihkan pada lingkungan uji terpisah.
- [ ] Bucket privat, secret, rate limit, dan pembatasan akses diuji dengan request
      yang mencoba membaca data pengguna lain.
- [ ] `.env.example` lengkap tanpa nilai rahasia dan README menjelaskan langkah
      local, staging, migrasi, seed, backup, dan pemulihan.
- [ ] Checklist penerimaan MVP pada blueprint dapat dicentang seluruhnya atau setiap
      pengecualian memiliki issue tindak lanjut yang jelas.
- [ ] Rilis staging menggunakan akun RUAS contoh, bukan kredensial production.

## Out of scope

- Deployment production lintas sekolah.
- PWA offline penuh.
- Observability enterprise dan multi-region.

## Blocked by

- SIMAK-011 — Konten awal dan pilot satu sesi nyata.

## Related documentation

- `docs/06-planning/device-testing.md`
- `docs/05-architecture/deployment.md`
- `docs/05-architecture/security-and-secrets.md`
- `docs/06-planning/mvp-roadmap.md`

