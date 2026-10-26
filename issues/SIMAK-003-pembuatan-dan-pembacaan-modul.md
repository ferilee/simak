# SIMAK-003 — Pembuatan dan pembacaan modul materi

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Bangun alur guru membuat modul materi yang dapat digunakan ulang dan alur murid
membaca modul yang telah diterbitkan. Modul tersusun dari blok teks, gambar,
video sematan, berkas, dan sub-bab. Modul memiliki status draf, terbit, arsip,
dan nomor versi.

Editor guru boleh kaya interaksi. Halaman baca murid harus ringan dan sesuai
untuk HP dengan koneksi terbatas.

## User stories covered

- Sebagai guru, saya dapat menyusun materi dari blok tanpa membuat dokumen utuh.
- Sebagai guru, saya dapat menerbitkan, mengarsipkan, dan menduplikasi materi.
- Sebagai murid, saya dapat membaca materi yang diterbitkan dari perangkat mobile.

## Acceptance criteria

- [ ] Guru dapat membuat modul dengan judul, mata pelajaran, deskripsi, dan status draf.
- [ ] Guru dapat menambah, mengubah, menghapus, dan mengurutkan blok materi.
- [ ] Blok yang tersedia adalah teks, gambar, video YouTube, berkas, dan sub-bab.
- [ ] Konten blok divalidasi sebelum disimpan; JSON tidak valid ditolak oleh API.
- [ ] Modul draf tidak tampil pada halaman baca murid.
- [ ] Guru dapat menerbitkan modul yang memiliki struktur blok valid.
- [ ] Modul terbit dapat dibaca dalam urutan blok yang benar.
- [ ] Modul dapat diarsipkan dan modul arsip tidak muncul sebagai materi aktif baru.
- [ ] Duplicating modul membuat salinan yang dapat diedit tanpa mengubah modul sumber.
- [ ] Perubahan versi tidak menghapus modul versi sebelumnya yang masih dirujuk
      penugasan aktif.
- [ ] Halaman murid tidak memuat kredensial storage atau berkas privat secara publik.
- [ ] Tampilan materi dapat dibaca pada layar HP Android kelas menengah tanpa
      mengunduh lampiran besar sebelum diminta.
- [ ] Akses terhadap modul mengikuti kepemilikan guru dan penugasan yang sah.

## Out of scope

- Kolaborasi editor antar-guru.
- Bank materi bersama MGMP.
- Komentar murid per blok.

## Blocked by

- SIMAK-001 — Fondasi aplikasi dan login RUAS.

## Related documentation

- `docs/03-content/content-authoring.md`
- `docs/01-product/mvp-scope.md`
- `docs/05-architecture/frontend-architecture.md`

