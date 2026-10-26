# SIMAK-004 — Editor dan renderer blok LKPD

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Bangun model authoring dan tampilan pengerjaan LKPD berbasis tujuh jenis blok.
Guru dapat menyusun urutan butir, kunci, pembahasan, rubrik, dan bobot. Murid
dapat melihat instruksi serta komponen input yang sesuai untuk setiap jenis blok.

Issue ini menetapkan bentuk konten dan metadata penilaian. Perhitungan nilai
serta alur pengumpulan penuh dikerjakan pada issue berikutnya.

## User stories covered

- Sebagai guru, saya dapat membuat LKPD dari blok-blok yang dapat diurutkan.
- Sebagai guru, saya dapat menentukan kunci atau rubrik per blok.
- Sebagai murid, saya dapat mengerjakan LKPD dari HP dengan input yang sesuai.

## Acceptance criteria

- [ ] Guru dapat membuat LKPD dengan instruksi dan status draf/terbit/arsip.
- [ ] Guru dapat menambah, mengubah, menghapus, dan mengurutkan butir LKPD.
- [ ] Tujuh jenis blok tersedia: `isian_singkat`, `pilihan_ganda`, `uraian`,
      `unggah_foto`, `langkah_berurutan`, `refleksi`, dan `tautan_ruas`.
- [ ] Setiap jenis blok memiliki konfigurasi valid sesuai schema yang disepakati.
- [ ] `isian_singkat` mendukung kunci, toleransi angka, unit, dan aturan format.
- [ ] `pilihan_ganda` mendukung opsi dan kunci tunggal untuk latihan.
- [ ] `uraian` mendukung rubrik maksimum dan petunjuk jawaban.
- [ ] `unggah_foto` mendukung instruksi dan jumlah file maksimum.
- [ ] `langkah_berurutan` dapat menyimpan langkah yang ditampilkan acak dan urutan benar.
- [ ] `refleksi` dapat ditampilkan sebagai input teks tanpa nilai otomatis.
- [ ] `tautan_ruas` dapat menyimpan URL dan label tombol tanpa mengklaim nilai dari SIMAK.
- [ ] API menolak konfigurasi yang tidak cocok dengan `itemType`.
- [ ] Renderer murid menampilkan blok dalam urutan authoring dan memiliki label
      yang mudah dipahami pada layar kecil.
- [ ] Hanya tiga jenis yang ditandai dapat dinilai otomatis: isian singkat,
      pilihan ganda, dan langkah berurutan.

## Out of scope

- Analitik kesalahan per butir.
- Komentar inline antar-murid.
- Kuis asesmen resmi pengganti RUAS.

## Blocked by

- SIMAK-001 — Fondasi aplikasi dan login RUAS.

## Related documentation

- `docs/03-content/content-authoring.md`
- `docs/03-content/activity-model.md`
- `docs/05-architecture/data-model.md`

