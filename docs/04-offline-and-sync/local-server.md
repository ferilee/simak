# Local Server

**Status:** Open; tidak diperlukan untuk MVP.

Istilah local server dapat berarti server SIMAK yang dijalankan di sekolah atau
perangkat lokal yang menjadi perantara ketika internet tidak tersedia. Blueprint
belum memilih model tersebut.

## Pertanyaan desain

- Apakah sekolah memiliki jaringan lokal dan perangkat yang selalu menyala?
- Apakah local server menyimpan akun, materi, jawaban, atau hanya cache?
- Bagaimana identitas murid diverifikasi tanpa koneksi ke RUAS?
- Siapa yang mencadangkan data lokal?
- Bagaimana konflik diselesaikan setelah koneksi kembali?

## Batas keputusan saat ini

Jangan membangun local server sebelum kebutuhan lapangan, model jaringan, dan
otoritas data ditetapkan. Untuk MVP, deployment tetap mengikuti Docker Compose
di server yang dapat diakses web.

