# SIMAK-008 — Penilaian otomatis dan manual

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Tambahkan penilaian otomatis untuk blok yang memiliki jawaban terstruktur dan
layar guru untuk menilai uraian serta foto. Nilai LKPD merupakan gabungan nilai
otomatis dan manual sesuai bobot. Nilai kuis resmi RUAS tidak dihitung oleh
fitur ini.

## User stories covered

- Sebagai guru, saya dapat melihat submission dan jawaban per blok.
- Sebagai guru, saya dapat menilai uraian dan foto dengan komentar.
- Sebagai murid, saya dapat melihat nilai dan komentar setelah penilaian selesai.

## Acceptance criteria

- [ ] `isian_singkat` dinilai otomatis dengan toleransi angka yang dikonfigurasi.
- [ ] Format angka dengan pemisah ribuan ditangani sesuai aturan yang terdokumentasi.
- [ ] `pilihan_ganda` dinilai berdasarkan opsi kunci yang benar.
- [ ] `langkah_berurutan` dinilai berdasarkan urutan benar.
- [ ] Blok uraian tidak pernah dinilai otomatis dan selalu tersedia untuk guru.
- [ ] Blok foto tidak pernah dinilai otomatis dan selalu tersedia untuk guru.
- [ ] Guru dapat memasukkan skor manual dalam rentang rubrik yang valid.
- [ ] Guru dapat menambahkan catatan per jawaban dan komentar umum submission.
- [ ] Sistem menghitung `total_score` secara konsisten dari skor dan bobot yang sah.
- [ ] Submission berubah menjadi `dinilai` hanya setelah aturan penilaian terpenuhi.
- [ ] Murid dapat melihat nilai dan komentar yang memang menjadi miliknya.
- [ ] Guru tidak dapat menilai submission dari kelas atau penugasan yang bukan cakupannya.
- [ ] Nilai kuis RUAS tidak tercampur dengan nilai LKPD pada perhitungan otomatis.
- [ ] Kasus batas toleransi, format ribuan, jawaban kosong, dan bobot nol memiliki
      perilaku yang terdokumentasi dan dapat diverifikasi.

## Out of scope

- Analitik kesulitan per butir.
- Penilaian berbasis AI.
- Nilai asesmen resmi RUAS.

## Blocked by

- SIMAK-004 — Editor dan renderer blok LKPD.
- SIMAK-007 — Pengerjaan murid, autosave, dan pengumpulan.

## Related documentation

- `docs/03-content/content-authoring.md`
- `docs/01-product/mvp-scope.md`
- `docs/05-architecture/data-model.md`

