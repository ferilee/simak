# SIMAK-005 — Penyimpanan berkas dan unggah foto pekerjaan

**Status:** Ready  
**Tipe:** Infrastructure feature / vertical slice  
**Priority:** P0

## What to build

Hubungkan web dan API dengan RustFS privat untuk menyimpan gambar serta lampiran
materi, gambar pendukung LKPD, dan foto pekerjaan murid. Browser meminta
presigned URL dari API; browser tidak pernah menerima kredensial RustFS.

Alur harus memberi umpan balik yang jelas ketika unggah berhasil, gagal, atau
belum selesai. File pekerjaan murid hanya dapat diakses oleh pihak yang berhak.

## User stories covered

- Sebagai guru, saya dapat melampirkan gambar atau berkas ke materi.
- Sebagai murid, saya dapat mengunggah foto pekerjaan dari HP.
- Sebagai guru, saya dapat membuka foto pekerjaan murid dalam penilaian.

## Acceptance criteria

- [ ] Bucket `simak` dan prefix `materi`, `lkpd`, `submissions`, `exports`, serta
      `tmp` tersedia sesuai aturan deployment.
- [ ] `POST /api/v1/uploads/presign` hanya dapat dipakai oleh sesi yang berwenang.
- [ ] Presigned URL memiliki masa berlaku terbatas dan scope objek yang spesifik.
- [ ] Kredensial RustFS hanya berada di environment API, bukan di bundle web.
- [ ] Upload dibatasi pada tipe file yang diizinkan dan ukuran maksimum 10 MB.
- [ ] Nama object key dibuat server dan tidak memakai nama file pengguna secara mentah.
- [ ] Gambar dapat dikompresi di sisi klien sebelum upload bila perangkat mendukungnya.
- [ ] Lampiran materi dapat dibuka guru dan murid hanya melalui URL akses yang sah.
- [ ] Foto jawaban hanya dapat dibaca murid pemilik dan guru yang berwenang.
- [ ] File privat tidak dapat diunduh hanya dengan menebak object key.
- [ ] Kegagalan upload tidak membuat jawaban terlihat sudah terkumpul.
- [ ] File sementara yang tidak selesai diunggah memiliki mekanisme pembersihan.
- [ ] API menyimpan hanya referensi object key, bukan byte file di MariaDB.

## Out of scope

- Penyimpanan publik.
- Pemrosesan OCR.
- Sinkronisasi file offline penuh.

## Blocked by

- SIMAK-001 — Fondasi aplikasi dan login RUAS.

## Related documentation

- `docs/05-architecture/security-and-secrets.md`
- `docs/05-architecture/deployment.md`
- `docs/04-offline-and-sync/offline-strategy.md`

