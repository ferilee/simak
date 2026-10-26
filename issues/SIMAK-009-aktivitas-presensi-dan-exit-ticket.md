# SIMAK-009 — Aktivitas, presensi, dan exit ticket

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Catat aktivitas belajar murid sebagai event server dan gunakan event tersebut
bersama submission serta exit ticket sebagai bukti pembelajaran. Tambahkan
exit ticket 3-2-1 di akhir penugasan dan ringkasan jawaban untuk guru.

Presensi bukan daftar hadir terpisah. Untuk MVP, murid dianggap hadir jika
tercatat membuka penugasan dan mengumpulkan minimal LKPD atau exit ticket.

## User stories covered

- Sebagai murid, aktivitas saya tercatat saat mengikuti sesi.
- Sebagai guru, saya dapat mengetahui siapa yang hadir dan mengumpulkan.
- Sebagai guru, saya dapat membaca refleksi murid sebelum sesi berikutnya.
- Sebagai pengelola data, saya dapat menelusuri kapan peristiwa terjadi.

## Acceptance criteria

- [ ] Event yang tersedia adalah `buka_materi`, `mulai_lkpd`, `kumpul`,
      `buka_kuis_ruas`, dan `exit_ticket`.
- [ ] Identitas murid diambil dari sesi server, bukan dipercaya dari payload browser.
- [ ] Event memiliki penugasan yang relevan dan timestamp dari server.
- [ ] Klik tombol kuis RUAS tercatat sebagai `buka_kuis_ruas`.
- [ ] Event tidak menyimpan isi perangkat atau password murid.
- [ ] Exit ticket memiliki tiga bagian: 3 hal dipahami, 2 contoh penerapan,
      dan 1 hal yang membingungkan.
- [ ] Murid dapat mengirim satu exit ticket per penugasan sesuai aturan produk.
- [ ] Guru dapat melihat ringkasan exit ticket dari murid di kelas penugasan.
- [ ] Status hadir mengikuti aturan: buka penugasan dan mengumpulkan LKPD atau
      exit ticket.
- [ ] Aktivitas murid pada kelas lain tidak masuk ke rekap guru.
- [ ] Event berulang tidak membuat status presensi menjadi tidak konsisten.
- [ ] Waktu ditampilkan dalam WIB di antarmuka dan disimpan konsisten di database.

## Out of scope

- Pelacakan detail durasi setiap halaman.
- Monitoring perangkat murid.
- Notifikasi realtime.

## Blocked by

- SIMAK-006 — Penugasan modul dan LKPD ke kelas.
- SIMAK-007 — Pengerjaan murid, autosave, dan pengumpulan.

## Related documentation

- `docs/03-content/activity-model.md`
- `docs/05-architecture/activity-sdk.md`
- `docs/05-architecture/security-and-secrets.md`

