# Peran dan Hak Akses

**Status:** MVP.

## Peran

| Peran | Cakupan |
| --- | --- |
| Guru | Kelas, modul, LKPD, penugasan, pengumpulan, penilaian, dan laporan miliknya |
| Murid | Kelas yang diikuti, penugasan yang ditujukan kepadanya, jawaban, dan umpan baliknya |

## Aturan akses

- Guru hanya dapat mengubah sumber belajar dan kelas yang dimilikinya.
- Guru hanya dapat melihat pengumpulan murid dalam kelas atau penugasan yang
  menjadi cakupannya.
- Murid hanya dapat membaca modul yang diterbitkan dan ditugaskan ke kelasnya.
- Murid hanya dapat membaca dan mengubah pengumpulan miliknya sendiri.
- ID dari URL tidak boleh menjadi bukti kepemilikan data.
- Otorisasi diperiksa di API, bukan hanya dengan menyembunyikan tombol di web.

## Akun

RUAS adalah sumber kebenaran identitas dan password. Tabel `users` SIMAK adalah
pemetaan profil, bukan tempat penyimpanan kredensial.

