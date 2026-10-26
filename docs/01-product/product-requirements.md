# PRD SIMAK — Sumber Informasi, Materi, dan Aktivitas Kelas

**Status:** MVP baseline  
**Versi:** 1.0  
**Tanggal:** 26 Oktober 2026  
**Sumber utama:** [Blueprint SIMAK](../blueprint-simak.md)  
**Issue implementasi:** [issues/README.md](../../issues/README.md)

## Ringkasan

SIMAK adalah aplikasi pendamping RUAS untuk mengelola pembelajaran daring dari
materi sampai bukti pembelajaran. Guru menyusun materi dan LKPD, menerbitkan
penugasan ke kelas, memantau pekerjaan, memberi penilaian, dan mengekspor rekap.
Murid mengakses semuanya dari satu alur penugasan.

Posisi produk:

> **RUAS menilai, SIMAK mengajar.**

RUAS tetap menjadi tempat kuis dan nilai asesmen resmi. SIMAK mengelola materi,
latihan, penugasan, pengumpulan, presensi, refleksi, dan bukti pembelajaran.

## Problem Statement

Paket pembelajaran daring yang dibuat manual dapat menyelesaikan satu sesi,
tetapi sulit digunakan ulang. Guru harus menyebarkan materi melalui beberapa
dokumen atau chat, membuat formulir LKPD terpisah, merekap presensi secara
manual, mencocokkan pengumpulan dengan laporan RUAS, dan mencari bukti dari
banyak tempat.

Akibatnya:

- murid tidak selalu tahu materi atau tautan mana yang berlaku;
- guru sulit memberikan umpan balik pada setiap langkah LKPD;
- presensi dan bukti pembelajaran rawan berbeda dengan data tugas;
- penggunaan ulang materi membutuhkan pekerjaan manual berulang;
- satu sesi pembelajaran terasa seperti beberapa aplikasi yang terpisah.

SIMAK dibutuhkan agar pola pembelajaran daring yang sudah terbukti dapat dipakai
kembali tanpa membangun ulang alurnya setiap kali.

## Solution

SIMAK menyediakan satu sesi pembelajaran yang berisi:

1. pembuka dan instruksi;
2. materi berbasis blok;
3. LKPD interaktif;
4. tombol menuju kuis RUAS;
5. pengumpulan jawaban dan foto pekerjaan;
6. exit ticket 3-2-1;
7. rekap bukti pembelajaran.

Guru tetap menggunakan akun RUAS dan dapat menugaskan modul serta LKPD kepada
satu atau beberapa kelas. Murid mengerjakan dari satu halaman yang ringan untuk
perangkat mobile. Activity log, pengumpulan, penilaian, dan exit ticket menjadi
bahan rekap tanpa formulir presensi terpisah.

## Goals

MVP harus mencapai hasil berikut:

- Guru dapat menerbitkan satu sesi pembelajaran lengkap.
- Murid dapat masuk dengan akun RUAS dan mengerjakan sesi dari HP.
- Materi dan LKPD dapat digunakan ulang.
- Jawaban murid tersimpan sebagai draf dan dapat dikumpulkan.
- Blok objektif dapat dinilai otomatis.
- Uraian dan foto dapat dinilai manual oleh guru.
- Aktivitas belajar menghasilkan bukti berstempel waktu.
- Nilai RUAS dapat ditampilkan berdampingan melalui impor manual.
- Rekap sesi dapat diekspor ke PDF dan Excel.
- Satu kelas dapat menggunakan sistem dalam pilot nyata.

## Non-goals

MVP tidak bertujuan untuk:

- menggantikan RUAS sebagai sistem asesmen;
- membuat sistem akun dan password kedua;
- menyediakan bank materi bersama antar-guru;
- menyediakan mode offline penuh atau local server sekolah;
- mengirim pengingat WhatsApp;
- menyinkronkan nilai RUAS melalui API;
- menyediakan analitik kesulitan per butir;
- menyediakan peran admin sekolah, wali kelas, atau kepala sekolah.

## Target dan batas MVP

Target penerapan pertama:

- satu guru;
- kelas X dan XI;
- tiga materi dari paket 26–29 Oktober 2026;
- satu kelas untuk pilot awal;
- perangkat utama murid berupa HP Android kelas menengah.

Ruang lingkup MVP berhenti ketika satu sesi dapat berjalan dari login sampai
rekap yang diekspor dan datanya cocok dengan data sumber.

## Actors

### Guru

Guru menyusun modul dan LKPD, mengelola kelas, menerbitkan penugasan, memantau
pengumpulan, menilai pekerjaan manual, mengimpor nilai RUAS, dan mengekspor
rekap.

### Murid

Murid masuk menggunakan akun RUAS, melihat penugasan kelasnya, membaca materi,
mengerjakan LKPD, mengunggah foto jika diminta, membuka kuis RUAS, mengirim
pekerjaan, dan mengisi exit ticket.

### RUAS

RUAS adalah sumber kebenaran identitas dan password, serta tempat kuis dan nilai
asesmen resmi. RUAS bukan pengguna yang berinteraksi melalui UI SIMAK, tetapi
merupakan dependensi integrasi utama.

### Pengelola teknis

Pengelola teknis menjalankan deployment, migrasi, backup, pemulihan, dan
lingkungan staging. Peran ini belum menjadi role aplikasi yang terlihat oleh
pengguna MVP.

## User Stories

### Identitas dan akses

1. Sebagai guru, saya ingin masuk dengan username dan password RUAS, sehingga
   saya tidak perlu mengelola akun kedua.
2. Sebagai murid, saya ingin masuk dengan kredensial RUAS yang sudah saya miliki,
   sehingga saya tidak perlu mendaftar ulang.
3. Sebagai pengelola sistem, saya ingin password tidak disimpan di SIMAK,
   sehingga RUAS tetap menjadi sumber kebenaran kredensial.
4. Sebagai pengguna, saya ingin logout dari SIMAK, sehingga sesi SIMAK saya
   tidak tetap aktif pada perangkat yang dipakai bersama.
5. Sebagai pengguna, saya ingin akun RUAS yang dinonaktifkan ikut ditolak di
   SIMAK, sehingga status akses tetap konsisten.

### Kelas

6. Sebagai guru, saya ingin membuat kelas dengan nama rombel, mata pelajaran,
   dan tahun ajaran, sehingga saya dapat mengelola penugasan berdasarkan kelas.
7. Sebagai guru, saya ingin mencocokkan murid berdasarkan username atau NIS,
   sehingga anggota kelas memakai identitas RUAS yang benar.
8. Sebagai guru, saya ingin membagikan kode kelas, sehingga murid dapat masuk
   ke kelas tanpa pembuatan akun baru.
9. Sebagai murid, saya ingin bergabung dengan kode kelas setelah login, sehingga
   saya dapat melihat penugasan kelas saya.
10. Sebagai guru, saya ingin mengarsipkan kelas, sehingga kelas lama tidak
    menerima penugasan baru.
11. Sebagai guru, saya ingin melihat anggota kelas saya saja, sehingga data
    murid dari kelas lain tetap terlindungi.

### Materi

12. Sebagai guru, saya ingin membuat modul dalam status draf, sehingga materi
    dapat disiapkan sebelum diterbitkan.
13. Sebagai guru, saya ingin menyusun modul dari blok teks, gambar, video,
    berkas, dan sub-bab, sehingga materi dapat disesuaikan dengan sesi belajar.
14. Sebagai guru, saya ingin mengubah urutan blok, sehingga alur penjelasan
    sesuai dengan tujuan pembelajaran.
15. Sebagai guru, saya ingin menerbitkan, mengarsipkan, dan menduplikasi modul,
    sehingga materi dapat digunakan ulang tanpa mengetik ulang.
16. Sebagai guru, saya ingin mempertahankan versi materi yang dirujuk tugas
    aktif, sehingga perubahan berikutnya tidak merusak sesi yang sudah berjalan.
17. Sebagai murid, saya ingin membaca materi dalam satu halaman yang ringan,
    sehingga saya dapat belajar dari HP dan koneksi terbatas.
18. Sebagai murid, saya ingin membuka lampiran hanya saat diperlukan, sehingga
    kuota tidak habis untuk mengunduh berkas besar.

### LKPD

19. Sebagai guru, saya ingin membuat LKPD dengan urutan butir yang jelas,
    sehingga aktivitas dapat disusun dari mudah ke kompleks.
20. Sebagai guru, saya ingin membuat blok isian singkat dengan toleransi angka,
    sehingga hitungan murid dapat dinilai otomatis secara wajar.
21. Sebagai guru, saya ingin membuat pilihan ganda untuk latihan konsep,
    sehingga murid mendapat umpan balik cepat tanpa menganggapnya sebagai kuis resmi.
22. Sebagai guru, saya ingin membuat blok uraian dengan rubrik, sehingga jawaban
    yang membutuhkan penalaran dapat dinilai secara manual.
23. Sebagai guru, saya ingin meminta unggah foto pekerjaan, sehingga pekerjaan
    tangan dan sketsa murid dapat menjadi bukti.
24. Sebagai guru, saya ingin membuat langkah berurutan, sehingga prosedur atau
    algoritma dapat diperiksa otomatis.
25. Sebagai guru, saya ingin menyediakan blok refleksi, sehingga murid dapat
    menjelaskan pemahaman dan kebingungannya.
26. Sebagai guru, saya ingin menaruh tautan kuis RUAS dalam LKPD, sehingga murid
    tidak perlu mencari tautan di tempat lain.
27. Sebagai murid, saya ingin mengerjakan setiap blok dengan komponen input yang
    sesuai, sehingga LKPD mudah dipahami dari layar kecil.
28. Sebagai murid, saya ingin melihat pembahasan setelah aturan yang ditetapkan,
    sehingga saya dapat belajar dari jawaban yang benar.

### Penugasan dan pengerjaan

29. Sebagai guru, saya ingin menggabungkan modul, LKPD, instruksi, kelas tujuan,
    jadwal, dan tautan RUAS menjadi satu penugasan.
30. Sebagai guru, saya ingin menugaskan satu sesi ke beberapa kelas, sehingga
    materi yang sama tidak perlu diterbitkan berulang kali.
31. Sebagai guru, saya ingin mengatur waktu buka dan batas kumpul, sehingga
    ekspektasi sesi jelas bagi murid.
32. Sebagai murid, saya ingin melihat daftar tugas hari ini, sehingga saya tahu
    apa yang harus dikerjakan.
33. Sebagai murid, saya ingin melihat pembuka, materi, LKPD, kuis RUAS, dan exit
    ticket dalam satu detail penugasan.
34. Sebagai murid, saya ingin menyimpan draf jawaban otomatis, sehingga jawaban
    tidak hilang ketika halaman dimuat ulang.
35. Sebagai murid, saya ingin mengetahui apakah draf sudah tersimpan, sehingga
    saya tidak salah mengira jawaban saya sudah aman.
36. Sebagai murid, saya ingin tetap dapat mengumpulkan setelah batas waktu,
    sehingga pekerjaan terlambat tetap menjadi bukti dengan tanda yang jelas.
37. Sebagai guru, saya ingin melihat status belum mulai, draf, terkumpul,
    terlambat, dan dinilai, sehingga saya dapat memantau progres kelas.

### Penilaian

38. Sebagai guru, saya ingin nilai isian singkat dihitung otomatis dengan aturan
    yang konsisten, sehingga pekerjaan koreksi berulang berkurang.
39. Sebagai guru, saya ingin nilai pilihan ganda dan langkah berurutan dihitung
    otomatis, sehingga murid mendapat hasil latihan dengan cepat.
40. Sebagai guru, saya ingin menilai uraian dan foto secara manual, sehingga
    penalaran dan bukti visual tidak dinilai secara keliru oleh sistem.
41. Sebagai guru, saya ingin memberi catatan per jawaban dan komentar umum,
    sehingga umpan balik dapat langsung dipahami murid.
42. Sebagai murid, saya ingin melihat nilai dan komentar saya sendiri, sehingga
    saya tahu bagian yang perlu diperbaiki.
43. Sebagai sistem, saya ingin memisahkan nilai LKPD dari nilai asesmen RUAS,
    sehingga fungsi latihan dan asesmen resmi tidak tercampur.

### Aktivitas dan refleksi

44. Sebagai guru, saya ingin aktivitas membuka materi, memulai LKPD, mengumpulkan,
    membuka RUAS, dan mengirim refleksi tercatat otomatis.
45. Sebagai guru, saya ingin presensi diturunkan dari aktivitas dan pengumpulan,
    sehingga tidak perlu membuat daftar hadir terpisah.
46. Sebagai murid, saya ingin mengirim exit ticket 3-2-1, sehingga saya dapat
    menyampaikan pemahaman dan kebingungan saya.
47. Sebagai guru, saya ingin membaca ringkasan exit ticket per kelas, sehingga
    saya dapat menyiapkan sesi berikutnya.
48. Sebagai pengelola data, saya ingin event memiliki timestamp server, sehingga
    bukti aktivitas tidak bergantung pada jam perangkat murid.

### RUAS dan laporan

49. Sebagai murid, saya ingin membuka kuis RUAS dari tombol di tugas, sehingga
    alur belajar dan asesmen tetap terhubung.
50. Sebagai guru, saya ingin menempelkan hasil ekspor nilai RUAS, sehingga nilai
    asesmen dapat tampil berdampingan dengan nilai LKPD pada MVP.
51. Sebagai guru, saya ingin mengetahui baris nilai RUAS yang gagal dicocokkan,
    sehingga masalah NIS tidak hilang tanpa pemeriksaan.
52. Sebagai guru, saya ingin melihat rekap satu sesi, sehingga bukti belajar
    dapat diperiksa sebelum laporan dibuat.
53. Sebagai guru, saya ingin melihat rekap berdasarkan rentang tanggal, sehingga
    beberapa sesi dapat dilaporkan bersama.
54. Sebagai guru, saya ingin mengunduh rekap sebagai PDF dan Excel, sehingga
    hasilnya dapat dipakai untuk laporan sekolah.
55. Sebagai guru, saya ingin angka laporan berasal dari data pengumpulan,
    aktivitas, dan refleksi yang sama, sehingga tidak ada selisih rekap.

### Operasional

56. Sebagai pengelola teknis, saya ingin menjalankan seluruh layanan dengan
    Docker Compose, sehingga lingkungan dapat direproduksi.
57. Sebagai pengelola teknis, saya ingin mencadangkan MariaDB dan RustFS,
    sehingga data dan foto pekerjaan dapat dipulihkan.
58. Sebagai pengelola teknis, saya ingin menguji satu alur kelas penuh di staging,
    sehingga production tidak menjadi tempat menemukan masalah dasar.
59. Sebagai guru, saya ingin menggunakan sistem dari HP Android kelas menengah,
    sehingga keterbatasan perangkat tidak menghalangi sesi.

## Implementation Decisions

### Batas produk

- SIMAK mengelola pembelajaran, latihan, penugasan, pengumpulan, presensi,
  refleksi, dan bukti.
- RUAS mengelola akun sumber, kuis, dan nilai asesmen resmi.
- MVP hanya memiliki role guru dan murid.
- Multi-guru, bank materi bersama, admin sekolah, dan wali kelas ditunda.

### Integrasi akun RUAS

- RUAS adalah sumber kebenaran identitas dan password.
- SIMAK tidak menyimpan password atau hash password RUAS.
- Mekanisme verifikasi dipilih dari `shared-db` atau `internal-endpoint` setelah
  kode RUAS diperiksa.
- Setelah verifikasi berhasil, SIMAK menerbitkan sesi sendiri.
- Status akun aktif harus diperiksa saat login dan dapat disegarkan berkala.

### Domain model

Domain MVP terdiri dari pengguna, kelas, keanggotaan kelas, modul, blok modul,
LKPD, butir LKPD, penugasan, tujuan kelas, submission, jawaban submission,
activity log, dan exit ticket.

Rekap tidak disimpan sebagai entitas terpisah. Rekap adalah hasil agregasi dari
submission, activity log, exit ticket, dan nilai RUAS yang diimpor.

### Konten dan penilaian

- Materi memakai blok teks, gambar, video, berkas, dan sub-bab.
- LKPD memakai `isian_singkat`, `pilihan_ganda`, `uraian`, `unggah_foto`,
  `langkah_berurutan`, `refleksi`, dan `tautan_ruas`.
- Hanya isian singkat, pilihan ganda, dan langkah berurutan yang boleh dinilai
  otomatis.
- Uraian dan foto selalu menunggu penilaian guru.
- Nilai LKPD tidak disebut sebagai nilai asesmen resmi.
- Konten JSON divalidasi di API sebelum disimpan.

### Penyimpanan dan berkas

- MariaDB menyimpan data terstruktur.
- RustFS menyimpan gambar, lampiran, foto pekerjaan, dan ekspor sementara.
- Bucket RustFS privat.
- Upload dan download memakai presigned URL.
- Ukuran baku berkas adalah 10 MB dengan pembatasan tipe file.
- Object key dibuat oleh server.

### API dan otorisasi

- Web guru dan murid menggunakan satu API REST.
- Endpoint dilindungi sesi kecuali endpoint yang memang publik.
- Otorisasi dilakukan di API berdasarkan role dan kepemilikan relasi.
- Guru tidak dapat mengakses data guru lain.
- Murid tidak dapat mengakses submission atau penugasan murid lain.
- Identitas murid untuk activity dan submission diambil dari sesi server.

### Waktu dan presensi

- Timestamp disimpan dalam UTC.
- UI menampilkan waktu dalam WIB.
- Pengumpulan setelah batas waktu diterima dan ditandai terlambat.
- Presensi membutuhkan bukti membuka penugasan dan mengumpulkan LKPD atau exit ticket.

### Frontend

- Next.js dan TypeScript digunakan untuk area guru dan murid.
- Area guru dapat memiliki editor interaktif.
- Area murid dirender dan dioptimalkan agar ringan.
- Draf jawaban dan status penyimpanan harus jelas bagi murid.

### Deployment

- Layanan utama adalah web, API, MariaDB, RustFS, dan proxy.
- Lingkungan terdiri dari local, staging, dan production.
- Staging memakai akun RUAS contoh.
- Migrasi skema dilakukan melalui migrasi yang tersimpan di repositori.
- Backup MariaDB dan RustFS dijadwalkan sejak awal.

### Seam penerimaan

Seam utama untuk menerima produk adalah satu alur end-to-end dari perspektif
pengguna:

```text
login RUAS
  → guru membuat/menugaskan sesi
  → murid membuka dan mengerjakan dari HP
  → jawaban tersimpan dan dikumpulkan
  → kuis RUAS dibuka
  → guru menilai
  → exit ticket tercatat
  → rekap PDF/Excel diekspor
```

Komponen internal hanya diuji secara terpisah bila aturan seperti penilaian
angka, otorisasi, upload privat, atau pemulihan data tidak dapat dibuktikan
dengan jelas dari alur utama.

## Testing Decisions

### Prinsip pengujian

Pengujian memeriksa perilaku yang terlihat pengguna dan batas keamanan data.
Pengujian tidak boleh bergantung pada nama fungsi atau struktur internal yang
tidak terlihat dari luar.

### Acceptance journey utama

Satu pengujian alur penuh harus membuktikan bahwa:

1. akun guru dan murid dapat masuk dari sumber RUAS;
2. guru membuat kelas dan menerbitkan penugasan;
3. murid melihat penugasan pada halaman mobile;
4. murid menyimpan jawaban dan mengunggah foto;
5. murid mengumpulkan tepat waktu atau terlambat;
6. klik kuis RUAS tercatat;
7. guru menilai objektif dan manual;
8. murid melihat umpan balik;
9. exit ticket masuk ke bukti sesi;
10. laporan PDF dan Excel cocok dengan data sumber.

### Perilaku yang perlu diuji secara khusus

- Password salah dan akun RUAS nonaktif.
- Akses silang guru atau murid melalui ID yang ditebak.
- Toleransi angka dan pemisah ribuan.
- Urutan langkah yang benar dan salah.
- Jawaban uraian/foto yang menunggu guru.
- Autosave dan reload halaman.
- Pengumpulan tepat waktu dan terlambat.
- File terlalu besar, tipe tidak sah, URL presign kedaluwarsa, dan object privat.
- NIS nilai RUAS yang tidak cocok.
- Pengumpulan serentak sekitar 36 murid dalam 15 menit.
- Restart Compose dan pemulihan backup.

### Lingkungan pengujian

- Local memakai data contoh tanpa password production.
- Staging memakai akun RUAS contoh dan materi pilot.
- Production hanya menerima promosi setelah checklist staging selesai.

## Out of Scope

Fitur berikut tidak boleh masuk MVP tanpa perubahan PRD:

- PWA offline penuh dan antrean sinkronisasi kompleks.
- Local server sekolah.
- Sinkronisasi nilai RUAS otomatis melalui API.
- Bank materi bersama antar-guru.
- Kloning materi dari guru lain.
- Komentar murid per blok.
- Notifikasi WhatsApp.
- Analitik tingkat butir.
- Admin sekolah, wali kelas, dan dasbor kepala sekolah.
- Realtime wajib untuk dashboard atau penilaian.
- Penggantian RUAS sebagai sistem kuis dan asesmen.

## Further Notes

### Urutan implementasi

Implementasi mengikuti issue berikut:

1. fondasi dan login RUAS;
2. kelas dan keanggotaan;
3. modul materi;
4. editor dan renderer LKPD;
5. berkas dan foto;
6. penugasan;
7. pengerjaan dan pengumpulan;
8. penilaian;
9. aktivitas, presensi, dan exit ticket;
10. rekap dan impor nilai RUAS;
11. konten awal dan pilot;
12. hardening dan staging.

### Keputusan yang harus ditutup sebelum implementasi terkait

- Mekanisme autentikasi RUAS.
- Alur utama keanggotaan kelas.
- Format ekspor nilai RUAS.
- Rumus penggabungan nilai LKPD.
- Perilaku editing modul yang sudah dipakai tugas aktif.
- Kebijakan kirim ulang exit ticket.

### Sumber kebenaran

Blueprint menjadi acuan keputusan produk awal. PRD ini merangkum kebutuhan
produk dalam format yang dapat diturunkan menjadi issue. Dokumen area menjelaskan
detail operasional. Kode menunjukkan perilaku yang sudah benar-benar diterapkan.
Perubahan yang mengubah batas MVP harus memperbarui PRD, issue terdampak, dan
dokumen area yang relevan.

