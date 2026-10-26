# Arsitektur Frontend

**Status:** MVP.

## Area aplikasi

| Area | Fokus |
| --- | --- |
| `/guru` | Editor materi, editor LKPD, kelas, penugasan, penilaian, rekap |
| `/murid` | Daftar tugas, baca materi, pengerjaan LKPD, pengumpulan, exit ticket |

Next.js dan TypeScript dipakai untuk keduanya. Halaman murid dirender server
sejauh memungkinkan dan dijaga ringan untuk HP berdaya rendah.

## Prinsip implementasi

- Komponen blok LKPD mengikuti `itemType` dari shared package.
- Form jawaban memiliki autosave dan status draf yang terlihat.
- Upload dimulai dari API presigned URL, bukan dari kredensial RustFS di browser.
- UI tidak menjadi tempat utama otorisasi; API tetap memeriksa akses.
- Waktu ditampilkan dalam WIB setelah data disimpan dalam UTC.

