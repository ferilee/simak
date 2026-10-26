# SIMAK-006 — Penugasan modul dan LKPD ke kelas

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Bangun alur guru menerbitkan satu sesi pembelajaran yang menggabungkan modul,
LKPD, instruksi pembuka, kelas tujuan, jadwal buka, batas kumpul, dan tautan
kuis RUAS. Murid melihat penugasan yang tersedia pada halaman tugas hari ini
dan dapat membuka detail sesi dari satu alur.

Penugasan dapat diarahkan ke satu atau beberapa kelas. Hak akses detail
penugasan ditentukan dari relasi kelas, bukan dari URL yang diketahui murid.

## User stories covered

- Sebagai guru, saya dapat menerbitkan modul dan LKPD ke kelas saya.
- Sebagai guru, saya dapat mengatur kapan tugas dibuka dan kapan batas kumpulnya.
- Sebagai murid, saya dapat melihat tugas yang tersedia untuk kelas saya.
- Sebagai murid, saya dapat membuka kuis RUAS dari halaman tugas.

## Acceptance criteria

- [ ] Guru dapat membuat penugasan dengan judul, instruksi, modul, LKPD, dan kelas tujuan.
- [ ] Penugasan dapat diarahkan ke lebih dari satu kelas tanpa relasi duplikat.
- [ ] Guru dapat menentukan `opens_at` dan `due_at` dalam input WIB yang disimpan konsisten.
- [ ] Sistem menolak batas kumpul yang lebih awal dari waktu buka.
- [ ] Penugasan memiliki status draf, terbit, dan ditutup dengan transisi yang jelas.
- [ ] Penugasan draf tidak terlihat oleh murid.
- [ ] Murid dapat melihat penugasan terbit yang kelasnya diikuti pada halaman today.
- [ ] Murid dapat membuka detail yang memuat pembuka, materi, LKPD, dan exit ticket.
- [ ] Tombol kuis RUAS tampil bila URL tersedia dan membuka alamat yang disimpan.
- [ ] Penugasan yang sudah ditutup tetap dapat dibaca sesuai aturan, tetapi tidak
      menerima perubahan yang melanggar kebijakan pengumpulan.
- [ ] Guru tidak dapat menugaskan kelas milik guru lain.
- [ ] Murid tidak dapat membaca penugasan yang hanya ditujukan ke kelas lain.
- [ ] Perubahan penugasan aktif tidak merusak relasi dan data pengumpulan yang sudah ada.

## Out of scope

- Notifikasi WhatsApp.
- Sinkronisasi nilai kuis otomatis.
- Penjadwalan berulang.

## Blocked by

- SIMAK-002 — Manajemen kelas dan keanggotaan murid.
- SIMAK-003 — Pembuatan dan pembacaan modul materi.
- SIMAK-004 — Editor dan renderer blok LKPD.

## Related documentation

- `docs/01-product/product-overview.md`
- `docs/03-content/activity-model.md`
- `docs/05-architecture/api-contracts.md`

