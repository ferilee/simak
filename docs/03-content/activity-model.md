# Model Aktivitas

**Status:** MVP.

## Rantai aktivitas

```text
materi diterbitkan
        -> penugasan dibuka
        -> murid membuka materi
        -> murid mulai LKPD
        -> jawaban tersimpan sebagai draf
        -> murid mengumpulkan
        -> guru menilai bagian manual
        -> murid mengisi exit ticket
        -> bukti direkap
```

Kuis RUAS berada di tengah alur sebagai tautan eksternal. Klik ke kuis dicatat,
sedangkan nilai kuis tetap berasal dari RUAS.

## Peristiwa MVP

| Peristiwa | Makna |
| --- | --- |
| `buka_materi` | Murid membuka penugasan atau materi |
| `mulai_lkpd` | Murid mulai mengerjakan LKPD |
| `kumpul` | Murid mengirim pengumpulan |
| `buka_kuis_ruas` | Murid membuka tautan kuis RUAS |
| `exit_ticket` | Murid mengirim refleksi 3-2-1 |

Peristiwa harus memiliki identitas murid, penugasan, dan waktu server. Log tidak
menyimpan isi perangkat murid.

