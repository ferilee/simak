# Pengujian Perangkat

**Status:** MVP.

## Fokus utama

Murid diprioritaskan pada HP Android kelas menengah dengan koneksi dan kuota
terbatas. Pengujian harus mencakup pembacaan materi, pengerjaan LKPD, autosave,
unggah foto, dan pengumpulan.

## Skenario minimum

- Memuat penugasan dengan jaringan lambat.
- Memuat ulang halaman setelah beberapa jawaban tersimpan.
- Kehilangan koneksi saat autosave.
- Mengunggah foto dalam batas 10 MB.
- Mengirim banyak pengumpulan menjelang batas waktu.
- Membuka tautan RUAS dari halaman penugasan.
- Melihat komentar dan nilai setelah guru menilai.

## Kriteria praktis

- Konten utama terbaca tanpa mengunduh berkas besar.
- Draf tidak hilang setelah reload yang berhasil.
- Status gagal dan berhasil mudah dibedakan.
- Tombol utama dapat digunakan dari layar kecil.
- Satu kelas sekitar 36 murid dapat mengumpulkan dalam jendela 15 menit.

## Baseline staging otomatis

Pada 27 Oktober 2026, halaman `/`, `/login`, dan `/guru` berhasil dimuat dengan
User-Agent Android. Beban ringan 36 request paralel ke `/login` menghasilkan
36/36 HTTP 200, rata-rata 0,17 detik, dan maksimum 0,25 detik.

Baseline ini hanya memeriksa proxy dan halaman publik. Ia belum membuktikan
layout sentuh, jaringan lambat, autosave, unggah foto, atau 36 pengumpulan
authenticated; skenario tersebut tetap harus dijalankan dari HP/DevTools dan
akun murid staging.

Smoke request dengan User-Agent iPhone Safari juga berhasil untuk `/`, `/login`,
dan `/guru`. Ini bukan pengganti Safari fisik: perangkat iOS memerlukan URL
yang dapat dijangkau melalui LAN serta sertifikat HTTPS yang dipercaya iOS.

