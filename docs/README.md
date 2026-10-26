# Dokumentasi SIMAK

SIMAK (*Sumber Informasi, Materi, dan Aktivitas Kelas*) adalah pendamping RUAS:
**RUAS menilai, SIMAK mengajar.** SIMAK mengelola materi, LKPD, penugasan,
pengumpulan, presensi, refleksi, dan rekap bukti pembelajaran.

## Cara membaca dokumentasi

Dokumentasi ini memecah blueprint menjadi dokumen yang lebih kecil agar mudah
dipakai saat merancang, membangun, dan meninjau sistem.

| Bagian | Pertanyaan utama |
| --- | --- |
| `00-governance` | Bagaimana dokumentasi dan perubahan keputusan dikelola? |
| `01-product` | Produk ini untuk siapa dan apa ruang lingkupnya? |
| `02-access` | Siapa boleh melakukan apa dan bagaimana murid masuk kelas? |
| `03-content` | Bagaimana materi, aktivitas, dan LKPD dimodelkan? |
| `04-offline-and-sync` | Apa strategi offline dan sinkronisasi setelah MVP? |
| `05-architecture` | Bagaimana sistem dibangun dan dioperasikan? |
| `06-planning` | Apa urutan kerja, pengujian perangkat, dan pertanyaan yang belum selesai? |

## Status dokumen

- **Final**: keputusan yang sudah ditetapkan dalam blueprint versi 1.1.
- **MVP**: perilaku dan batasan yang harus dipenuhi versi pertama.
- **Proposed**: rancangan kerja yang masih dapat berubah setelah implementasi.
- **Open**: keputusan yang membutuhkan pemeriksaan atau keputusan lanjutan.

## Sumber acuan

- [Blueprint SIMAK](./blueprint-simak.md) adalah sumber acuan produk versi 1.1.
- [PRD SIMAK](./01-product/product-requirements.md) adalah kontrak kebutuhan
  produk MVP yang diturunkan dari blueprint.
- Kode yang sudah ada di `apps/` dan `packages/` menunjukkan bentuk implementasi
  saat ini. Bila kode berbeda dari dokumentasi, catat perbedaannya dan putuskan
  dokumen atau kode mana yang perlu diperbarui.

## Aturan perubahan

Perubahan yang mengubah batas MVP, kepemilikan data RUAS, model akses, atau
kontrak API harus dicatat di `06-planning/open-questions.md` atau dokumen
keputusan baru di `00-governance/` sebelum implementasi melebar.
