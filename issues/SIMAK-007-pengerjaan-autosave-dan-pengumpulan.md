# SIMAK-007 — Pengerjaan murid, autosave, dan pengumpulan

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Bangun pengalaman murid mengerjakan LKPD dari halaman penugasan, menyimpan
jawaban sebagai draf, memulihkan draf, dan mengumpulkan jawaban. Sistem harus
membedakan status belum mulai, draf, terkumpul, terlambat, dan dinilai.

MVP memprioritaskan autosave melalui API dan fallback draf lokal yang sederhana.
Draf lokal tidak boleh dianggap sebagai pengumpulan resmi sampai server mengakui
pengiriman.

## User stories covered

- Sebagai murid, saya dapat mulai mengerjakan LKPD dari tugas hari ini.
- Sebagai murid, saya tidak kehilangan jawaban ketika halaman dimuat ulang.
- Sebagai murid, saya dapat mengumpulkan sebelum atau sesudah batas waktu.
- Sebagai guru, saya dapat melihat status pengumpulan setiap murid.

## Acceptance criteria

- [ ] Sistem membuat satu submission per pasangan penugasan dan murid.
- [ ] Murid dapat menyimpan jawaban tiap butir tanpa harus mengumpulkan seluruh LKPD.
- [ ] Status draf dan waktu penyimpanan terakhir terlihat di UI.
- [ ] Jawaban yang sudah tersimpan di server tetap ada setelah halaman dimuat ulang.
- [ ] Kegagalan autosave ditampilkan jelas dan tidak ditandai sebagai tersimpan.
- [ ] Draf lokal, bila digunakan, dibedakan dari draf server.
- [ ] Murid dapat mengirim jawaban dan mengubah status menjadi terkumpul.
- [ ] Pengiriman setelah `due_at` diterima dan ditandai terlambat.
- [ ] Pengumpulan tidak dapat dihapus atau diganti identitas muridnya melalui request.
- [ ] Pengiriman ulang yang sama tidak membuat submission duplikat.
- [ ] Submission memuat waktu mulai dan waktu kirim dari server.
- [ ] Murid hanya dapat membaca dan mengubah submission miliknya sendiri.
- [ ] Guru dapat melihat daftar status pengumpulan untuk kelas yang dituju.
- [ ] Pengumpulan dari tampilan HP Android kelas menengah tetap dapat diselesaikan.

## Out of scope

- Antrean sinkronisasi offline penuh.
- Pengeditan submission setelah dinilai, kecuali aturan produk ditambahkan.
- Realtime dashboard.

## Blocked by

- SIMAK-005 — Penyimpanan berkas dan unggah foto pekerjaan.
- SIMAK-006 — Penugasan modul dan LKPD ke kelas.

## Related documentation

- `docs/03-content/activity-model.md`
- `docs/04-offline-and-sync/offline-strategy.md`
- `docs/05-architecture/api-contracts.md`

