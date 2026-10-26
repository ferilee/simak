# SIMAK-010 — Rekap sesi dan impor nilai RUAS

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Bangun rekap bukti pembelajaran berdasarkan data pengumpulan, activity log,
penilaian LKPD, dan exit ticket. Guru dapat menempelkan atau mengimpor hasil
ekspor nilai RUAS secara manual untuk ditampilkan berdampingan dengan nilai
LKPD. Rekap dapat diekspor per sesi atau rentang tanggal ke PDF dan Excel.

Rekap harus dihitung dari data sumber, bukan dari tabel angka turunan yang dapat
berbeda dari submission atau log aktivitas.

## User stories covered

- Sebagai guru, saya dapat melihat rekap lengkap satu sesi.
- Sebagai guru, saya dapat melihat rekap beberapa sesi dalam rentang tanggal.
- Sebagai guru, saya dapat menambahkan nilai RUAS dari hasil ekspor.
- Sebagai guru, saya dapat mengunduh laporan PDF atau Excel.

## Acceptance criteria

- [ ] Rekap sesi memuat nama murid, status hadir, status pengumpulan, waktu kirim,
      nilai LKPD, komentar atau status penilaian, exit ticket, dan tautan/kolom RUAS.
- [ ] Rekap rentang tanggal menggabungkan penugasan yang sesuai filter guru.
- [ ] Status hadir dihitung dari aturan activity log dan pengumpulan yang disepakati.
- [ ] Guru dapat memasukkan hasil ekspor nilai RUAS dengan format yang terdokumentasi.
- [ ] Pencocokan nilai RUAS menggunakan NIS atau identifier yang ditentukan.
- [ ] Baris yang gagal dicocokkan ditandai untuk diperiksa dan tidak dibuang diam-diam.
- [ ] Nilai RUAS tampil berdampingan dengan nilai LKPD dan tidak mengubah nilai LKPD.
- [ ] PDF dapat diunduh untuk satu sesi dan memiliki identitas kelas serta tanggal.
- [ ] Excel dapat diunduh untuk satu sesi dan rentang tanggal dengan header yang jelas.
- [ ] Angka pada laporan cocok dengan submission, activity log, dan exit ticket sumber.
- [ ] Guru tidak dapat mengekspor data kelas milik guru lain.
- [ ] Ekspor sementara disimpan privat dan memiliki kebijakan pembersihan.

## Out of scope

- API sinkronisasi nilai otomatis RUAS.
- Dasbor kepala sekolah.
- Analitik lintas sekolah.

## Blocked by

- SIMAK-008 — Penilaian otomatis dan manual.
- SIMAK-009 — Aktivitas, presensi, dan exit ticket.

## Related documentation

- `docs/05-architecture/api-contracts.md`
- `docs/05-architecture/data-model.md`
- `docs/05-architecture/security-and-secrets.md`

