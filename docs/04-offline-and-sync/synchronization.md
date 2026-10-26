# Sinkronisasi

**Status:** Open untuk fase lanjut.

## Data yang mungkin disinkronkan

| Data | Sumber kebenaran saat ini |
| --- | --- |
| Identitas dan password | RUAS |
| Materi dan LKPD | SIMAK |
| Jawaban dan pengumpulan | SIMAK |
| Nilai latihan LKPD | SIMAK |
| Nilai asesmen resmi | RUAS |
| Bukti aktivitas | SIMAK |

Pada MVP, nilai RUAS dipindahkan melalui ekspor dan ditempel guru. Sinkronisasi
nilai otomatis hanya boleh dibuat jika RUAS menyediakan endpoint resmi.

## Kebutuhan sinkronisasi masa depan

- identitas objek yang stabil;
- versi data dan waktu perubahan;
- operasi yang idempotent;
- strategi konflik;
- audit log;
- retry dengan backoff;
- indikator berhasil, tertunda, dan gagal.

