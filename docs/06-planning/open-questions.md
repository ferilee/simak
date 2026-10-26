# Pertanyaan Terbuka

**Status:** Open.

Dokumen ini menampung hal yang perlu diputuskan sebelum implementasi terkait
menjadi final.

| Pertanyaan | Dampak | Pemilik keputusan |
| --- | --- | --- |
| Bagaimana RUAS memverifikasi login: shared DB atau endpoint internal? | **Terjawab:** MVP memakai endpoint internal `POST /api/auth`; shared DB hanya fallback. | Pemilik RUAS/SIMAK |
| Apakah murid bergabung dengan kode kelas atau seluruh anggota disusun guru? | Menentukan alur kelas dan UX | Pemilik produk |
| Format resmi ekspor nilai RUAS seperti apa? | Menentukan pencocokan NIS dan error report | Pemilik RUAS/SIMAK |
| Bagaimana bobot nilai LKPD digabungkan? | Menentukan perhitungan `total_score` | Guru/pemilik produk |
| Apakah modul boleh diedit setelah diterbitkan ke tugas aktif? | Menentukan versi dan snapshot konten | Pemilik produk |
| Apakah exit ticket boleh dikirim ulang? | Menentukan aturan update dan audit | Pemilik produk |
| Apakah offline penuh dibutuhkan pada fase berikutnya? | Menentukan PWA, antrean, dan konflik sinkronisasi | Pemilik produk |
| Apakah local server sekolah diperlukan? | Mengubah deployment, autentikasi, dan backup | Sekolah/pemilik produk |
| Strategi refresh data guru: manual, polling, atau realtime? | Menentukan kompleksitas frontend/backend | Tim teknis |

## Cara menutup pertanyaan

Setiap keputusan baru harus mencatat alasan, konsekuensi, dokumen terdampak,
dan apakah ruang lingkup MVP berubah. Setelah selesai, pindahkan hasilnya ke
dokumen area yang sesuai dan tandai pertanyaan sebagai selesai.
