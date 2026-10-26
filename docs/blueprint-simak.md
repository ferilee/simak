# Blueprint SIMAK — Sumber Informasi, Materi, dan Aktivitas Kelas

**Blueprint aplikasi belajar daring pendamping RUAS (Ruang Asesmen)** — tempat guru menerbitkan materi dan LKPD interaktif, menugaskannya ke kelas, mengumpulkan pekerjaan murid, dan menghasilkan bukti pembelajaran dalam satu alur.

> Posisi produk dalam satu kalimat: **RUAS menilai, SIMAK mengajar.** RUAS tetap menjadi satu-satunya tempat kuis dan nilai asesmen; SIMAK mengurus materi, LKPD, penugasan, pengumpulan, presensi, dan rekap bukti.

| Hal | Keputusan |
| --- | --- |
| Nama aplikasi | **SIMAK** — Sumber Informasi, Materi, dan Aktivitas Kelas |
| Versi dokumen | 1.1 — 26 Oktober 2026 (versi acuan, menggantikan blueprint PDF versi 1.0) |
| Basis data | **MariaDB** via Drizzle ORM |
| Akun pengguna | Mengikuti **RUAS yang sudah berjalan** — username dan password yang sama, tanpa akun terpisah |
| Frontend | **Next.js + TypeScript**, halaman murid dirender server dan dijaga tetap ringan |
| Stack inti | Bun + Hono (API), Drizzle ORM + MariaDB, RustFS (S3-compatible) |
| Pengemasan | Docker Compose, monorepo npm workspaces |
| Target MVP | 1 guru, kelas X dan XI, 3 materi awal dari paket daring 26–29 Oktober 2026 |

## Untuk siapa dokumen ini

Dokumen ini adalah cetak biru pembangunan, bukan proposal pemasaran. Isinya cukup rinci untuk langsung dijadikan pegangan saat membuat repositori, menulis skema basis data, dan membangun fitur satu per satu: visi produk, daftar fitur MVP, arsitektur, skema tabel MariaDB, daftar endpoint API, tata letak bucket RustFS, layanan Docker, struktur folder, tahapan pembangunan, dan kriteria penerimaan MVP.

Konteks lahirnya: paket pembelajaran daring 26–29 Oktober 2026 untuk kelas X dan XI (Matematika Keuangan, Algoritma dan Pemrograman, dan SPtLDV) membuktikan alurnya bekerja secara manual. Blueprint ini mengubah paket manual itu menjadi sistem yang bisa dipakai ulang setiap kali pembelajaran daring atau penugasan jarak jauh diperlukan.

## Keputusan yang sudah final

Empat hal yang pada versi sebelumnya masih terbuka kini sudah diputuskan, dan seluruh isi dokumen ini sudah disesuaikan dengannya:

1. **Nama: SIMAK.** Kepanjangannya *Sumber Informasi, Materi, dan Aktivitas Kelas* — pasangan RUAS (Ruang Asesmen). Di SIMAK murid belajar dan berlatih; di RUAS murid dinilai.
2. **Basis data: MariaDB.** Bukan opsi dan bukan pengganti di tengah jalan: skema, migrasi, dan layanan Docker di dokumen ini semuanya ditulis untuk MariaDB.
3. **Akun mengikuti RUAS.** RUAS sudah berjalan dan akun-akunnya sudah terprovisioning — murid masuk dengan username dan password yang sudah dibagikan untuk RUAS. SIMAK tidak membuat sistem akun kedua dan tidak menyimpan kata sandi sendiri; rinciannya ada di Bagian 5 dan 6.
4. **Frontend sesuai rekomendasi: Next.js.** Satu aplikasi web untuk guru dan murid, dengan disiplin ketat menjaga halaman murid tetap ringan.

---

## 01 · Masalah dan prinsip

### Manualnya berhasil, tapi tidak bisa diulang terus-menerus

Paket daring yang disusun per pertemuan menyelesaikan masalah minggu ini. Masalah berikutnya adalah pengulangan: setiap pembelajaran daring baru berarti menyusun ulang dokumen, menyebar tautan formulir, merekap presensi, dan berburu bukti dari banyak tempat.

### Empat titik sakit yang dihilangkan SIMAK

| Titik sakit saat manual | Akibatnya | Jawaban di SIMAK |
| --- | --- | --- |
| Materi tersebar di dokumen, chat, dan Drive | Murid bingung versi mana yang berlaku; guru sulit memakai ulang materi tahun depan | Modul materi berversi, terbit sekali, dipakai ulang lintas kelas dan tahun ajaran |
| LKPD berupa formulir lepas | Tidak ada umpan balik per langkah; guru tidak tahu murid tersangkut di soal mana | LKPD sebagai rangkaian blok interaktif dengan kunci dan pembahasan per blok |
| Presensi dan bukti dipisah dari tugas | Rekap laporan memakan waktu dan rawan selisih angka | Presensi otomatis dari aktivitas: membuka materi, mengerjakan, dan mengumpulkan tercatat berstempel waktu |
| Kuis di RUAS, materi di tempat lain | Murid berpindah-pindah tautan; guru mencocokkan dua laporan | Satu halaman penugasan berisi materi, LKPD, dan tautan kuis RUAS; rekap bukti menautkan ketiganya |

### Lima prinsip desain

1. **Mobile-first, hemat kuota.** Murid mengerjakan dari HP, sering bergantian perangkat dalam satu keluarga. Halaman harus ringan, materi bisa dibaca tanpa mengunduh berkas besar, dan draf jawaban tersimpan otomatis di perangkat.
2. **Satu sesi harus utuh.** Satu penugasan memuat pembuka, materi, LKPD, tautan kuis RUAS, dan exit ticket. Murid tidak perlu membuka lima tautan berbeda.
3. **Bukti adalah hasil samping, bukan pekerjaan tambahan.** Setiap aktivitas menghasilkan jejak bernama dan berwaktu yang langsung bisa diekspor menjadi lampiran laporan.
4. **Sempit dulu, selesai dulu.** Versi pertama hanya untuk satu guru dan kelas-kelasnya sendiri. Multi-guru dan berbagi antar-sekolah adalah fase lanjut, bukan syarat MVP.
5. **Memakai ulang ekosistem yang sudah ada.** Kuis dan nilai tetap di RUAS, akun tetap akun RUAS, berkas di RustFS, identitas kelas mengikuti rombel di sekolah. SIMAK tidak menggandakan ketiganya.

---

## 02 · Pengguna dan alur inti

### Dua peran untuk versi pertama: guru dan murid

Menahan jumlah peran adalah keputusan desain. Admin sekolah, wali kelas, dan orang tua adalah peran fase lanjut; menambahkannya di awal hanya memperlambat MVP tanpa menambah nilai pembelajaran.

**Guru** — menyusun modul dan LKPD, menerbitkan penugasan ke satu atau beberapa kelas, memantau siapa yang sudah membuka dan mengumpulkan, memberi umpan balik singkat, menilai pekerjaan uraian dan foto, lalu mengekspor rekap bukti per sesi dan per rentang tanggal.

**Murid** — masuk dengan username dan password RUAS yang sudah dimilikinya, melihat daftar tugas hari ini, membaca materi, mengerjakan LKPD blok demi blok, membuka kuis RUAS dari tombol di dalam tugas, mengunggah foto pekerjaan bila diminta, dan mengisi exit ticket sebelum sesi ditutup.

### Alur inti satu sesi pembelajaran daring

1. **Guru menyusun** — modul materi dan LKPD disiapkan dari blok-blok.
2. **Guru menugaskan** — modul + LKPD diterbitkan ke kelas dengan jadwal buka dan batas kumpul.
3. **Murid mengerjakan** — membaca materi dan menyelesaikan LKPD dari satu halaman penugasan.
4. **Murid ikut kuis di RUAS** — membuka kuis lewat tombol di dalam penugasan, masuk dengan akun yang sama.
5. **Rekap bukti siap ekspor** — presensi, nilai LKPD, dan tautan hasil RUAS terkumpul per sesi.

### Aturan main sesi yang diwarisi dari paket manual

- **Presensi menyatu dengan tugas.** Murid dianggap hadir bila tercatat membuka penugasan dan mengumpulkan minimal LKPD atau exit ticket. Tidak ada daftar hadir terpisah.
- **Jendela pengumpulan longgar.** Batas kumpul baku pukul 20.00 WIB pada hari sesi, dapat diubah guru per penugasan. Pengumpulan lewat batas tetap diterima dan ditandai terlambat, bukan ditolak.
- **Exit ticket 3-2-1 menutup setiap sesi:** 3 hal yang dipahami, 2 contoh penerapan, 1 hal yang masih membingungkan. Jawabannya masuk ke rekap sebagai bukti refleksi.
- **Kuis tetap di RUAS.** Penugasan hanya menyimpan tautan kuis RUAS dan, bila diisi guru, rentang nilai hasil ekspor RUAS. SIMAK tidak menilai kuis pilihan ganda resmi sendiri.

> Contoh sesi nyata yang menjadi pola baku: XI DPIB, Matematika Keuangan. Pembuka berisi tujuan dan konteks kredit motor serta pinjaman online; materi terdiri dari tiga sub-bab (bunga tunggal, bunga majemuk, anuitas); LKPD berisi eksplorasi hitungan bertahap; kuis RUAS memakai Bank Soal A dari paket; exit ticket 3-2-1 menutup sesi. Satu halaman, satu alur, satu rekap.

---

## 03 · Fitur

### MVP yang sempit, fitur lanjutan yang jelas antriannya

Daftar di bawah ini adalah kontrak ruang lingkup. Fitur yang tidak tercantum di kolom MVP tidak dikerjakan sebelum MVP diterima, betapapun menariknya.

### Fitur MVP (versi 1.0)

| Modul | Isi MVP |
| --- | --- |
| Akun dan kelas | Login memakai akun RUAS (username + password yang sama untuk guru dan murid); CRUD kelas/rombel; susun anggota kelas dari daftar username/NIS yang dicocokkan ke akun RUAS; murid bergabung ke kelas dengan kode kelas setelah login; tidak ada pendaftaran akun baru di SIMAK |
| Modul materi | Editor blok: teks kaya, gambar, video sematan (YouTube), berkas lampiran dari RustFS, dan pembagi sub-bab; status draf / terbit / arsip; duplikasi modul untuk dipakai ulang |
| LKPD interaktif | Blok soal: isian singkat, uraian, pilihan ganda latihan (bukan asesmen resmi), unggah foto pekerjaan, dan refleksi; kunci + pembahasan per blok; nilai otomatis khusus blok isian dan pilihan ganda latihan |
| Penugasan | Tugaskan modul + LKPD ke satu atau banyak kelas; atur waktu buka, batas kumpul, tautan kuis RUAS, dan instruksi pembuka; pengumuman otomatis di halaman murid |
| Pengumpulan dan penilaian | Daftar pengumpulan per kelas; status belum / draf / terkumpul / terlambat; guru menilai blok uraian dan foto, memberi komentar; murid melihat nilai dan komentarnya |
| Presensi dan bukti | Jejak aktivitas berstempel waktu; rekap per sesi (hadir, mengumpulkan, nilai LKPD, tautan hasil RUAS); ekspor PDF dan Excel rekap per hari dan gabungan rentang tanggal |
| Exit ticket | Formulir 3-2-1 terikat ke penugasan; ringkasan jawaban per kelas untuk dibaca guru sebelum sesi berikutnya |
| Integrasi RUAS | Satu login yang sama dengan RUAS; kolom tautan kuis RUAS per penugasan; tombol buka kuis di halaman murid; kolom tempel hasil ekspor nilai RUAS agar tampil berdampingan di rekap |

### Ditunda ke fase lanjut (bukan MVP)

**Fase 2** — Bank materi bersama antar-guru MGMP, kloning modul dari guru lain, komentar murid per blok, notifikasi WhatsApp pengingat batas kumpul, mode luring (PWA) penuh.

**Fase 3** — Sinkronisasi nilai RUAS otomatis lewat API, analitik kesulitan per butir LKPD, peran admin sekolah dan wali kelas, dasbor kepala sekolah.

Perhatikan bedanya: kesatuan **akun** dengan RUAS adalah bagian MVP karena sudah diputuskan dan akunnya sudah berjalan. Yang ditunda ke fase 3 hanyalah sinkronisasi **nilai** otomatis — di MVP nilai RUAS masih ditempel guru dari hasil ekspor.

---

## 04 · Jenis blok LKPD

### LKPD dibangun dari blok, bukan dari dokumen utuh

Model blok membuat LKPD bisa dinilai sebagian secara otomatis, ditampilkan enak di layar HP, dan disusun ulang tanpa mengetik ulang. Setiap blok menyimpan pertanyaan, kunci atau rubrik, dan pembahasan yang tampil setelah murid mengumpulkan.

| Jenis blok | Untuk apa | Penilaian |
| --- | --- | --- |
| `isian_singkat` | Hitungan satu jawaban pasti, misalnya besar bunga atau suku ke-n | Otomatis; toleransi angka dan pemisah ribuan dapat diatur guru |
| `pilihan_ganda` | Latihan konsep cepat di tengah LKPD (bukan asesmen resmi) | Otomatis |
| `uraian` | Penjelasan dengan bahasa sendiri, contoh dari kehidupan murid | Manual oleh guru, dengan rubrik 0–100 dan komentar |
| `unggah_foto` | Bukti pekerjaan tangan: coretan hitungan, foto benda di rumah, hasil pengukuran | Manual oleh guru; berkas tersimpan di RustFS |
| `langkah_berurutan` | Menyusun urutan algoritma atau langkah penyelesaian | Otomatis berdasarkan urutan benar |
| `refleksi` | Exit ticket 3-2-1 dan pertanyaan metakognisi penutup | Tidak dinilai; tercatat sebagai bukti refleksi |
| `tautan_ruas` | Tombol menuju kuis RUAS di tengah atau akhir LKPD | Nilai berasal dari RUAS, bukan dari SIMAK |

### Contoh pemakaian per mapel dari paket 26–29 Oktober

- **Matematika Keuangan:** isian singkat untuk hitungan bunga dan anuitas, uraian untuk membandingkan dua tawaran kredit, unggah foto untuk coretan hitungan, tautan RUAS ke Bank Soal A.
- **KKA Algoritma dan Pemrograman (X TKR):** langkah berurutan untuk menyusun tahapan algoritma, isian singkat untuk menebak keluaran pseudocode, uraian untuk menulis algoritma aktivitas bengkel dalam bahasa sendiri — semua bisa dikerjakan dari HP tanpa laptop.
- **SPtLDV (X TKJ A):** isian singkat untuk titik potong dan daerah himpunan penyelesaian, unggah foto untuk sketsa grafik di kertas, uraian untuk memodelkan soal cerita menjadi sistem pertidaksamaan.

> **Aturan penilaian yang tidak boleh dilanggar:** hanya blok isian singkat, pilihan ganda, dan langkah berurutan yang boleh dinilai otomatis. Blok uraian dan foto selalu menunggu guru. Nilai LKPD adalah gabungan keduanya dan tidak mengklaim diri sebagai nilai asesmen resmi — itu wilayah RUAS.

---

## 05 · Arsitektur

### Satu monorepo, satu API, satu sumber kebenaran data

Arsitekturnya sengaja membosankan: aplikasi web untuk guru dan murid, satu API Hono yang melayani keduanya, MariaDB untuk semua data terstruktur, dan RustFS untuk semua berkas. Tidak ada layanan mikro di versi pertama. Di samping itu ada satu ketergantungan yang disengaja: **sumber akun RUAS** sebagai satu-satunya tempat username dan kata sandi diverifikasi.

```text
WEB GURU (Next.js)          WEB MURID (Next.js, route terpisah, ringan)        RUAS
editor, penugasan, rekap    baca materi, kerjakan LKPD                          kuis dan nilai asesmen
        \                              /                                        diakses lewat tautan
         \                            /
          +------ API Hono di atas Bun ------+
          | REST JSON · sesi/JWT · validasi Zod |
          | presigned URL unggahan · ekspor    |
          +--------+-------------+-----------+
                   |             |
              MariaDB        RustFS (S3-compatible)
              via Drizzle    gambar, foto murid, lampiran

Login: API SIMAK memverifikasi username + password ke sumber akun RUAS
(tabel pengguna bersama atau endpoint autentikasi internal RUAS),
lalu menerbitkan sesi SIMAK sendiri. Kata sandi tidak pernah disimpan di SIMAK.
```

### Alasan di balik pilihan stack

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Runtime | Bun | Sesuai kebiasaan stack pemilik; menjalankan TypeScript langsung, cepat untuk API Hono, dan menjadi package runner selama pengembangan |
| Framework API | Hono | Ringan, berbasis standar web, routing dan middleware-nya cukup untuk REST; mudah diuji dan mudah dipindah runtime bila perlu |
| Frontend | Next.js + TypeScript | Satu framework untuk halaman guru yang kaya editor dan halaman murid yang ringan; rendering server membantu HP berdaya rendah |
| Basis data | MariaDB + Drizzle ORM | Diputuskan pemilik dan sudah dipakai di proyek-proyeknya; Drizzle memberi skema TypeScript yang menjadi sumber kebenaran tunggal dan migrasi yang terkontrol |
| Penyimpanan berkas | RustFS | S3-compatible, self-hosted, cocok untuk foto pekerjaan murid dan lampiran materi tanpa biaya per berkas; diakses lewat presigned URL |
| Pengemasan | Docker + npm | Seluruh sistem naik dengan satu docker compose; npm workspaces mengelola monorepo sesuai permintaan, sementara Bun dipakai sebagai runtime aplikasi |

Catatan soal npm dan Bun: keduanya dipakai dengan peran yang tegas agar tidak berebut. npm adalah pengelola paket dan workspace monorepo; Bun adalah runtime yang menjalankan API (dan skrip pengembangan). Jangan mencampur pengelola paket lain ke dalam repositori yang sama.

### Konsekuensi teknis keputusan MariaDB

- Drizzle dipakai dalam mode MySQL (`drizzle-orm/mysql2`, `drizzle-kit` dengan dialect `mysql`) — mode ini yang kompatibel dengan MariaDB; driver yang dipakai `mysql2`.
- Semua tabel memakai engine **InnoDB** agar kunci asing dan transaksi ditegakkan, dengan charset `utf8mb4` dan collation `utf8mb4_unicode_ci` supaya nama murid dan teks Bahasa Indonesia tersimpan utuh termasuk emoji pada refleksi.
- Kolom JSON MariaDB adalah alias dari `LONGTEXT` dengan pemeriksaan `JSON_VALID`; karena itu isi `content_json` dan `options_json` **wajib** selalu divalidasi Zod di API sebelum disimpan — jangan mengandalkan basis data untuk menolak JSON rusak.
- Waktu disimpan sebagai `DATETIME` dalam UTC dan ditampilkan dalam WIB di antarmuka; stempel presensi tidak boleh bergantung pada zona waktu perangkat murid.
- Migrasi selalu lewat berkas migrasi Drizzle yang masuk repositori; tidak ada perubahan skema manual langsung di server production.

### Konsekuensi teknis keputusan akun mengikuti RUAS

- RUAS adalah satu-satunya sumber kebenaran identitas. SIMAK hanya menyimpan **pemetaan profil**: pengenal akun RUAS, username, nama tampilan, dan peran — tanpa kolom kata sandi dan tanpa PIN terpisah.
- Mekanisme verifikasinya ditetapkan di Tahap 0 dengan memeriksa kode RUAS yang sudah berjalan, pilih yang memang tersedia: (a) SIMAK membaca tabel pengguna yang sama bila RUAS dan SIMAK berbagi MariaDB atau SIMAK diberi akses baca terbatas ke basis data RUAS; atau (b) SIMAK memanggil endpoint autentikasi internal RUAS bila RUAS menyediakannya. Mana pun yang dipilih, verifikasi hash kata sandi selalu terjadi di sisi sumber RUAS, bukan dengan menyalin hash ke SIMAK.
- Setelah verifikasi berhasil, SIMAK menerbitkan sesinya sendiri (cookie httpOnly atau token berumur terbatas) dengan klaim pengenal akun RUAS, username, dan peran. Logout dari SIMAK tidak mengubah apa pun di RUAS.
- Akun yang dinonaktifkan di RUAS harus ikut tertolak di SIMAK: status aktif diperiksa saat login dan disegarkan berkala ke profil pemetaan, bukan dipercaya selamanya dari login pertama.
- Ganti kata sandi tetap urusan RUAS. SIMAK cukup menampilkan arahan bahwa kata sandi diatur di RUAS; tidak ada layar ganti kata sandi dan tidak ada fitur reset PIN di SIMAK.

---

## 06 · Skema basis data MariaDB

### Tiga belas tabel menampung seluruh MVP

Semua tabel memakai kunci utama `id` (UUID atau bigint auto-increment — pilih satu dan konsisten), stempel `created_at` dan `updated_at`, serta indeks pada setiap kolom yang dipakai untuk menyaring rekap: kelas, penugasan, dan tanggal aktivitas.

| Tabel | Kolom kunci |
| --- | --- |
| `users` | `id`, `ruas_user_id` (unik, pengenal akun di RUAS), `username` (unik, sama dengan username RUAS), `name`, `role` (guru / murid), `nis` (khusus murid, bila dipakai RUAS), `is_active`, `last_synced_at` — **tanpa kolom kata sandi** |
| `classes` | `id`, `teacher_id` → `users`, `name` (mis. XI DPIB), `subject`, `academic_year`, `join_code` (unik), `is_archived` |
| `class_members` | `id`, `class_id` → `classes`, `student_id` → `users`, `joined_at`; unik pada pasangan (`class_id`, `student_id`) |
| `modules` | `id`, `teacher_id`, `title`, `subject`, `description`, `status` (draf / terbit / arsip), `version` |
| `module_blocks` | `id`, `module_id`, `sort_order`, `type` (teks / gambar / video / berkas / sub_bab), `content_json`, `attachment_key` (RustFS) |
| `worksheets` | `id`, `module_id` (boleh kosong), `teacher_id`, `title`, `instructions`, `status` |
| `worksheet_items` | `id`, `worksheet_id`, `sort_order`, `item_type` (lihat Bagian 04), `prompt`, `options_json`, `answer_key`, `explanation`, `rubric_max`, `points` |

| Tabel | Kolom kunci |
| --- | --- |
| `assignments` | `id`, `teacher_id`, `module_id`, `worksheet_id`, `title`, `instructions`, `ruas_quiz_url`, `opens_at`, `due_at`, `status` |
| `assignment_classes` | `id`, `assignment_id`, `class_id`; unik pada pasangan (`assignment_id`, `class_id`) |
| `submissions` | `id`, `assignment_id`, `student_id`, `status` (belum / draf / terkumpul / terlambat / dinilai), `started_at`, `submitted_at`, `total_score`, `teacher_comment` |
| `submission_answers` | `id`, `submission_id`, `worksheet_item_id`, `answer_text`, `attachment_key` (RustFS), `auto_score`, `manual_score`, `teacher_note` |
| `activity_logs` | `id`, `student_id`, `assignment_id`, `event` (buka_materi / mulai_lkpd / kumpul / buka_kuis_ruas / exit_ticket), `created_at` |
| `exit_tickets` | `id`, `assignment_id`, `student_id`, `understood_3`, `examples_2`, `confusing_1`, `created_at` |

Itu sebelas tabel inti ditambah dua tabel pendukung (`class_members` dan `assignment_classes`) sebagai tabel penghubung banyak-ke-banyak. Tabel `users` di sini bukan tabel akun — ia adalah pemetaan profil ke akun RUAS (lihat Bagian 05). Rekap bukti juga bukan tabel tersendiri: rekap adalah query agregasi atas `submissions`, `activity_logs`, dan `exit_tickets`, sehingga angkanya tidak pernah selisih dengan data sumbernya.

> **Keputusan skema yang penting:** konten blok disimpan sebagai `content_json` dan `options_json` terstruktur, divalidasi Zod di API dan diberi tipe di Drizzle. Ini membuat jenis blok baru bisa ditambah tanpa migrasi tabel baru — cukup tambah tipe blok dan komponen tampilannya.

---

## 07 · API

### Endpoint REST Hono, dikelompokkan per sumber daya

Semua endpoint berada di bawah `/api/v1`, memakai JSON, dan dilindungi autentikasi kecuali login. Guru hanya mengakses data miliknya; murid hanya mengakses kelas dan penugasan yang memuat dirinya. Hak akses diperiksa di middleware Hono, bukan di frontend.

| Metode | Endpoint | Keterangan |
| --- | --- | --- |
| POST | `/auth/login` · `/auth/logout` · GET `/auth/me` | Satu pintu login untuk guru dan murid: username + password diverifikasi ke sumber akun RUAS, SIMAK menerbitkan sesinya sendiri |
| GET, POST, PATCH | `/classes` · `/classes/:id/members` | Kelola kelas dan anggota; anggota disusun dari username/NIS yang dicocokkan ke akun RUAS |
| GET, POST, PATCH | `/modules` · `/modules/:id/blocks` | Modul materi dan blok-bloknya; terbit / arsip |
| GET, POST, PATCH | `/worksheets` · `/worksheets/:id/items` | LKPD dan butir blok interaktifnya |
| POST | `/uploads/presign` | Minta presigned URL RustFS untuk unggah gambar / foto / lampiran |
| GET, POST, PATCH | `/assignments` | Penugasan: jadwal, kelas tujuan, tautan kuis RUAS |
| GET | `/murid/today` · `/murid/assignments/:id` | Beranda murid dan detail satu penugasan |
| PUT, POST | `/submissions/:id/answers` · `/submissions/:id/submit` | Simpan draf jawaban (autosave) dan kumpulkan |
| POST | `/assignments/:id/exit-ticket` | Kirim exit ticket 3-2-1 |
| GET, PATCH | `/grading/assignments/:id` | Daftar pengumpulan per kelas; nilai blok manual + komentar |
| GET | `/reports/session` · `/reports/range` | Rekap per sesi dan per rentang tanggal; parameter format `pdf` / `xlsx` |
| POST | `/activity` | Catat peristiwa aktivitas murid untuk presensi dan bukti |

### Kontrak integrasi dengan RUAS

- **Akun (bagian MVP):** login SIMAK memakai akun RUAS apa adanya. Murid yang sudah bisa masuk RUAS harus bisa masuk SIMAK dengan username dan password yang sama, tanpa didaftarkan ulang oleh guru.
- **Kuis:** penugasan menyimpan `ruas_quiz_url`; halaman murid menampilkan tombol "Buka Kuis di RUAS" dan peristiwa kliknya tercatat di `activity_logs` sebagai bukti murid diarahkan ke asesmen.
- **Nilai:** guru menempel hasil ekspor nilai RUAS (CSV) ke penugasan; sistem mencocokkan berdasarkan NIS dan menampilkannya berdampingan dengan nilai LKPD di rekap. Pencocokan yang gagal NIS-nya ditandai untuk diperiksa, tidak dibuang diam-diam.
- **Di luar MVP:** API sinkronisasi nilai otomatis ke RUAS bukan bagian MVP. Ia masuk fase 3 dan hanya dibangun bila RUAS menyediakan endpoint resmi untuk itu.

---

## 08 · Berkas, Docker, dan struktur proyek

### Tata letak bucket RustFS

```text
bucket: simak
  materi/[teacherId]/[moduleId]/[file]           gambar dan lampiran modul
  lkpd/[teacherId]/[worksheetId]/[file]          gambar pendukung butir soal
  submissions/[assignmentId]/[studentId]/[file]  foto pekerjaan murid
  exports/[teacherId]/[date]-[report].pdf        hasil ekspor rekap (sementara)
  tmp/                                           unggahan sementara, dibersihkan harian
```

Aturan berkas: unggahan selalu lewat presigned URL dari API (klien tidak pernah memegang kredensial RustFS); batas ukuran baku 10 MB per berkas untuk foto dan lampiran; gambar dikompresi di sisi klien sebelum diunggah agar hemat kuota murid; bucket tidak publik — unduhan juga lewat presigned URL berumur pendek. Kredensial RustFS hanya hidup sebagai variabel lingkungan layanan API di Docker.

### Layanan Docker Compose

| Layanan | Image / build | Keterangan |
| --- | --- | --- |
| `web` | Build dari `apps/web` (Next.js) | Antarmuka guru dan murid |
| `api` | Build dari `apps/api` (Bun + Hono) | REST API, ekspor laporan, presign RustFS |
| `db` | `mariadb:11.4` (rilis LTS) | Volume persisten; migrasi Drizzle dijalankan saat api start |
| `storage` | `rustfs` (S3-compatible) | Volume persisten; konsol admin tidak diekspos ke publik |
| `proxy` | Caddy atau Nginx | HTTPS dan pemetaan domain: web di domain utama, API di `/api` atau subdomain api |

Cadangan data: dump MariaDB terjadwal dan snapshot volume RustFS. Tanpa cadangan, foto pekerjaan murid dan rekap bukti tidak punya jaring pengaman — jadwalkan sejak hari pertama, bukan setelah kejadian.

### Struktur monorepo (npm workspaces)

```text
simak/
  package.json            npm workspaces: apps/*, packages/*
  docker-compose.yml
  .env.example
  apps/
    api/                  Hono + Bun: src/routes, src/middleware, src/services
    web/                  Next.js: app/guru, app/murid, components/blok-lkpd
  packages/
    db/                   Skema Drizzle (MariaDB), migrasi, seed kelas contoh
    shared/               Tipe TypeScript, skema Zod, konstanta jenis blok
    config/               Konfigurasi bersama (eslint, tsconfig)
  docs/                   Blueprint ini dan catatan keputusan
```

### Variabel lingkungan minimum (`.env.example`, tanpa nilai rahasia)

```text
DATABASE_URL=            koneksi MariaDB SIMAK (dipakai Drizzle dan API)
RUAS_AUTH_MODE=          shared-db | internal-endpoint (ditetapkan di Tahap 0)
RUAS_DATABASE_URL=       diisi bila RUAS_AUTH_MODE=shared-db; akses baca saja
RUAS_AUTH_ENDPOINT=      diisi bila RUAS_AUTH_MODE=internal-endpoint
SESSION_SECRET=          penandatangan sesi SIMAK
RUSTFS_ENDPOINT=         endpoint S3 RustFS
RUSTFS_BUCKET=simak
RUSTFS_ACCESS_KEY=       hanya untuk layanan API
RUSTFS_SECRET_KEY=       hanya untuk layanan API
```

---

## 09 · Keamanan dan kualitas

### Hal yang murah di awal, mahal kalau ditunda

**Autentikasi dan sesi.** SIMAK tidak menyimpan kata sandi — verifikasi username dan password selalu diteruskan ke sumber akun RUAS, dan perubahan atau penonaktifan akun di RUAS berlaku juga di SIMAK. Yang dikelola SIMAK hanyalah sesinya sendiri: cookie httpOnly atau token berumur terbatas, logout yang benar-benar mencabut sesi, dan pembatasan percobaan login berulang (rate limit) di endpoint `/auth/login` karena endpoint itu kini menjadi pintu masuk ke dua aplikasi sekaligus. Tidak ada PIN murid terpisah dan tidak ada reset kata sandi di SIMAK.

**Otorisasi per peran.** Middleware Hono memeriksa peran dan kepemilikan pada setiap endpoint: guru hanya melihat kelas dan pengumpulan miliknya, murid hanya penugasan di kelasnya. ID yang ditebak dari URL tidak boleh membuka data orang lain — ini diuji secara eksplisit.

**Validasi dan batas unggahan.** Semua masukan divalidasi Zod di API. Unggahan dibatasi jenis (gambar, PDF, dokumen umum untuk lampiran guru) dan ukuran; nama berkas di RustFS dibuat oleh server, bukan dari nama asli pengguna.

**Jejak dan privasi murid.** Activity log hanya mencatat peristiwa belajar, bukan isi perangkat murid. Data murid (nama, NIS) hanya tampil untuk gurunya sendiri. Ekspor rekap memuat nama dan NIS karena memang untuk laporan resmi sekolah — berkas ekspor tidak dibagikan ke pihak lain.

### Pengujian minimum sebelum MVP dipakai kelas nyata

- Uji unit untuk penilaian otomatis blok isian (termasuk toleransi angka dan format ribuan) dan langkah berurutan.
- Uji login: akun RUAS yang valid bisa masuk, akun yang salah kata sandi tertolak, dan akun yang dinonaktifkan di RUAS ikut tertolak di SIMAK.
- Uji alur ujung-ke-ujung satu sesi penuh: guru menugaskan, murid mengumpulkan dari tampilan HP, guru menilai, rekap diekspor.
- Uji beban ringan: satu kelas penuh (sekitar 36 murid) mengumpulkan dalam 15 menit terakhir sebelum batas waktu tanpa halaman gagal muat.
- Uji pemulihan: matikan dan nyalakan ulang seluruh compose; data dan berkas harus utuh.

### Lingkungan

Tiga lingkungan cukup: `local` (docker compose di mesin pengembangan), `staging` (server yang sama atau VPS terpisah dengan data contoh), dan `production`. Promosi ke production hanya setelah checklist pengujian di atas lolos di staging. Variabel lingkungan dicontohkan lengkap di `.env.example` tanpa nilai rahasia apa pun. Untuk staging, gunakan akun RUAS contoh — jangan menguji login dengan kata sandi akun production.

---

## 10 · Roadmap dan penerimaan MVP

### Lima tahap berurutan menuju versi pertama yang bisa dipakai

Estimasi di bawah ini adalah estimasi kasar untuk pengerjaan paruh waktu oleh satu pengembang berpengalaman dengan bantuan vibe coding — dilabeli estimasi, bukan janji tanggal. Urutannya tidak boleh dilompati: rekap bukti dibangun terakhir karena ia bergantung pada semua jejak sebelumnya.

| Tahap | Hasil tahap | Estimasi |
| --- | --- | --- |
| 0. Fondasi | Monorepo, docker compose (web, api, MariaDB, RustFS, proxy), skema Drizzle + migrasi, verifikasi mekanisme autentikasi RUAS dan login bersama, CRUD kelas dan penyusunan anggota dari username RUAS | Estimasi 3–5 hari kerja |
| 1. Materi | Editor blok modul, unggah RustFS via presigned URL, terbit / arsip, halaman baca murid yang ringan | Estimasi 4–6 hari kerja |
| 2. LKPD | Editor butir LKPD untuk 7 jenis blok, halaman kerja murid dengan autosave draf, penilaian otomatis blok objektif | Estimasi 6–9 hari kerja |
| 3. Penugasan dan penilaian | Penugasan ke kelas + jadwal + tautan RUAS, pengumpulan dan tanda terlambat, layar penilaian guru, exit ticket 3-2-1 | Estimasi 4–6 hari kerja |
| 4. Bukti dan rilis | Activity log dan presensi otomatis, rekap per sesi dan per rentang, ekspor PDF/Excel, tempel nilai RUAS, pengujian beban ringan, migrasi 3 materi paket 26–29 Okt sebagai konten awal | Estimasi 4–6 hari kerja |

Total estimasi MVP: **21–32 hari kerja paruh waktu.** Angka ini mengasumsikan ruang lingkup MVP di Bagian 03 tidak melebar di tengah jalan.

### Kriteria penerimaan MVP (semua harus terpenuhi)

- [ ] Murid dan guru bisa masuk SIMAK dengan username dan password RUAS yang sama persis; tidak ada akun yang perlu dibuat ulang di SIMAK.
- [ ] Guru bisa membuat kelas, menyusun anggotanya dari daftar username/NIS murid RUAS, dan membagikan kode kelas dalam waktu di bawah 15 menit.
- [ ] Satu modul Matematika Keuangan (bunga tunggal, bunga majemuk, anuitas) dan LKPD-nya terbit dan terbaca nyaman di HP Android kelas menengah.
- [ ] Murid bisa mengumpulkan LKPD berisi blok isian, uraian, dan foto; draf tidak hilang saat halaman dimuat ulang.
- [ ] Nilai otomatis blok objektif benar pada kasus uji, termasuk format angka beribuan.
- [ ] Penugasan memuat tombol kuis RUAS dan kliknya tercatat di activity log.
- [ ] Rekap satu sesi bisa diekspor ke PDF dan Excel dan angkanya cocok dengan data pengumpulan.
- [ ] Seluruh sistem naik dari nol dengan satu perintah docker compose di server bersih, mengikuti README.

---

## 11 · Keputusan final dan langkah berikutnya

### Empat keputusan, dicatat beserta implikasinya

**1. Nama produk — SIMAK.** *Sumber Informasi, Materi, dan Aktivitas Kelas.* Nama mandiri yang berpasangan wajar dengan RUAS: dua ruang, dua fungsi, satu ekosistem. Nama ini yang dipakai untuk repositori (`simak`), bucket RustFS (`simak`), dan penyebutan di antarmuka sejak baris kode pertama, agar tidak ada penggantian nama di tengah jalan.

**2. Basis data — MariaDB.** Seluruh rancangan skema, mode Drizzle, dan layanan Docker ditulis untuk MariaDB dan tidak menyisakan opsi basis data lain. Implikasinya dirinci di Bagian 05: InnoDB, `utf8mb4`, JSON yang divalidasi di API, dan migrasi yang selalu masuk repositori.

**3. Strategi akun terhadap RUAS — akun yang sama, bukan akun tertaut.** RUAS sudah berjalan dan akunnya sudah terprovisioning (username + password disediakan untuk murid), jadi SIMAK memakai basis akun yang sama: satu username, satu password, berlaku di kedua aplikasi. Ini lebih kuat dari sekadar menyamakan konvensi NIS — murid tidak mendaftar ulang dan guru tidak mengelola dua daftar akun. Implikasi teknisnya: SIMAK menyimpan pemetaan profil tanpa kata sandi, verifikasi selalu ke sumber RUAS, dan mekanisme persisnya (tabel bersama atau endpoint internal) ditetapkan di Tahap 0 dari kode RUAS yang ada. Yang tetap ditunda ke fase 3 hanyalah sinkronisasi nilai otomatis, bukan akunnya.

**4. Pendekatan frontend — Next.js penuh.** Satu aplikasi web untuk guru dan murid; halaman guru boleh kaya interaksi untuk editor, halaman murid dirender server dan dijaga ringan untuk HP berdaya rendah dan kuota terbatas. Disiplin keringanan halaman murid adalah syarat penerimaan, bukan selera.

### Langkah berikutnya yang disarankan

1. Buat repositori monorepo `simak` mengikuti struktur di Bagian 08, dan salin dokumen ini ke `docs/` sebagai rujukan rancangan.
2. Kerjakan Tahap 0 sampai docker compose naik lengkap — termasuk membuktikan login dengan akun RUAS sungguhan pada lingkungan staging dengan akun contoh.
3. Isi konten awal dari paket yang sudah terbukti: tiga materi paket daring 26–29 Oktober 2026 menjadi modul dan LKPD pertama, sehingga uji coba pertama memakai materi yang sudah dikenal murid dan guru.
4. Uji cobakan pada satu kelas dan satu sesi nyata terlebih dahulu sebelum dipakai serentak lintas kelas.

---

*Dokumen ini adalah blueprint SIMAK versi 1.1 per 26 Oktober 2026 dan merupakan versi acuan yang berlaku, menggantikan blueprint PDF versi 1.0. Bila ruang lingkup MVP berubah, perbarui dokumen ini di tempat yang sama agar tetap menjadi satu-satunya rujukan rancangan.*
