# Strategi Offline

**Status:** Proposed; bukan bagian dari MVP penuh.

## Batas MVP

MVP hanya memiliki perilaku ringan untuk koneksi terbatas:

- halaman murid dirender dan dibuat sesederhana mungkin;
- gambar dikompresi sebelum unggah;
- jawaban dapat disimpan sebagai draf lokal sebelum dikirim;
- unggahan berkas menggunakan presigned URL;
- sistem memberi status yang jelas ketika penyimpanan belum berhasil.

PWA offline penuh, antrean sinkronisasi, dan pembacaan seluruh materi tanpa
koneksi ditunda ke fase lanjut.

## Prinsip bila dikembangkan

1. Draf lokal tidak boleh dianggap sudah terkumpul.
2. Pengumpulan harus memiliki idempotency key agar pengiriman ulang aman.
3. Konflik jawaban harus terlihat oleh murid, bukan diam-diam ditimpa.
4. Berkas dan jawaban harus memiliki status sinkronisasi terpisah.
5. Batas waktu server tetap menjadi sumber kebenaran.

