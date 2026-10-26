# SIMAK-011 — Konten awal dan pilot satu sesi nyata

**Status:** Ready  
**Tipe:** Content / release preparation  
**Priority:** P0

## What to build

Masukkan tiga materi dari paket pembelajaran 26–29 Oktober 2026 sebagai konten
awal yang dapat digunakan pada sistem, lalu siapkan dan jalankan pilot satu
sesi pada satu kelas. Pilot harus menggunakan alur utuh: guru menerbitkan,
murid membaca dan mengerjakan, kuis dibuka di RUAS, guru menilai, dan rekap
dihasilkan.

Konten awal yang dipetakan:

- Matematika Keuangan.
- KKA Algoritma dan Pemrograman.
- SPtLDV.

## User stories covered

- Sebagai guru, saya dapat memulai kelas dengan materi yang sudah dikenal.
- Sebagai murid, saya dapat mengikuti satu sesi utuh dari satu penugasan.
- Sebagai pengelola produk, saya dapat memperoleh umpan balik dari penggunaan nyata.

## Acceptance criteria

- [ ] Tiga materi awal memiliki modul, LKPD, tujuan, pembuka, dan exit ticket.
- [ ] Matematika Keuangan mencakup bunga tunggal, bunga majemuk, dan anuitas.
- [ ] KKA memiliki minimal satu latihan langkah berurutan dan satu latihan pseudocode.
- [ ] SPtLDV memiliki minimal latihan titik potong, sketsa, dan pemodelan soal cerita.
- [ ] Setiap LKPD menggunakan jenis blok yang tepat untuk aktivitasnya.
- [ ] Materi dan LKPD dapat dibaca serta dikerjakan dari HP Android kelas menengah.
- [ ] Satu penugasan pilot berhasil diterbitkan ke satu kelas.
- [ ] Minimal satu murid contoh dapat login, mengerjakan, mengunggah bila diminta,
      membuka kuis RUAS, dan mengirim exit ticket.
- [ ] Guru dapat menilai bagian manual dan melihat nilai otomatis.
- [ ] Rekap pilot dapat diekspor dan diperiksa terhadap data sumber.
- [ ] Temuan pilot dicatat sebagai issue atau pertanyaan terbuka, bukan diselesaikan
      dengan perubahan scope diam-diam.
- [ ] Materi awal tidak mengandung password, data murid production, atau rahasia lain.

## Out of scope

- Migrasi seluruh arsip materi lama.
- Penggunaan serentak lintas semua kelas.
- Perubahan kurikulum di luar paket pilot.

## Blocked by

- SIMAK-010 — Rekap sesi dan impor nilai RUAS.

## Related documentation

- `docs/03-content/curriculum-map.md`
- `docs/01-product/mvp-scope.md`
- `docs/06-planning/device-testing.md`

