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
| `integrity_events` | Sinyal proses pengerjaan untuk membantu peninjauan guru |
| `exit_tickets` | Refleksi 3-2-1 |
| `ruas_scores` | Snapshot impor nilai RUAS dan status pencocokan |

## Aturan penyimpanan

- Semua tabel memakai `id`, `created_at`, dan `updated_at` sesuai kebutuhan.
- Relasi memakai foreign key InnoDB.
- Teks menggunakan `utf8mb4`.
- JSON divalidasi Zod sebelum disimpan.
- Waktu disimpan dalam UTC.
- Rekap dihitung dari data sumber, bukan disimpan sebagai angka turunan.

## Indikasi integritas

`integrity_events` menyimpan `student_id`, `assignment_id`, jenis sinyal, dan
waktu UTC. Jenis sinyal MVP meliputi perpindahan visibilitas halaman,
kehilangan fokus jendela, percobaan copy/paste, dan menu konteks. Data ini
digunakan sebagai agregat peninjauan guru dan tidak menyimpan isi clipboard,
isi jawaban, rekaman layar, kamera, mikrofon, atau ketikan murid.

## Nilai RUAS impor

`ruas_scores` menyimpan snapshot nilai RUAS untuk setiap penugasan. Baris
dicocokkan melalui NIS atau username murid di kelas tujuan. `match_status`
bernilai `cocok`, `tidak_ditemukan`, atau `duplikat`; baris yang tidak cocok
tetap disimpan agar dapat diaudit dan diperbaiki pada impor berikutnya.
