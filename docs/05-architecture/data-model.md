# Model Data

**Status:** Final untuk MVP.

## Entitas utama

| Entitas | Peran |
| --- | --- |
| `users` | Pemetaan profil ke akun RUAS; tanpa password |
| `classes` | Rombel yang dimiliki guru |
| `class_members` | Keanggotaan murid dalam kelas |
| `modules` | Materi yang dapat digunakan ulang |
| `module_blocks` | Blok penyusun materi |
| `worksheets` | LKPD |
| `worksheet_items` | Butir atau blok interaktif LKPD |
| `assignments` | Penerbitan modul/LKPD ke kelas dengan jadwal |
| `assignment_classes` | Relasi penugasan ke banyak kelas |
| `submissions` | Status dan ringkasan pengumpulan murid |
| `submission_answers` | Jawaban per butir LKPD |
| `activity_logs` | Jejak aktivitas murid |
| `exit_tickets` | Refleksi 3-2-1 |

## Aturan penyimpanan

- Semua tabel memakai `id`, `created_at`, dan `updated_at` sesuai kebutuhan.
- Relasi memakai foreign key InnoDB.
- Teks menggunakan `utf8mb4`.
- JSON divalidasi Zod sebelum disimpan.
- Waktu disimpan dalam UTC.
- Rekap dihitung dari data sumber, bukan disimpan sebagai angka turunan.

