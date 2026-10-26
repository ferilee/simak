# Komunikasi Realtime

**Status:** Proposed; tidak wajib untuk MVP.

Alur inti SIMAK tidak membutuhkan WebSocket. Guru dapat memuat ulang daftar
pengumpulan atau memakai polling ringan bila perlu.

## Kebutuhan MVP

- Autosave jawaban melalui request biasa.
- Status pengumpulan diambil dari API.
- Activity log dikirim sebagai event HTTP.
- Penilaian guru terlihat setelah data disimpan dan halaman diperbarui.

## Kandidat masa depan

- Notifikasi bahwa murid baru mengumpulkan.
- Perubahan status penilaian tanpa refresh.
- Dasbor kelas yang bergerak langsung.

Jika realtime ditambahkan, event server tetap harus bersumber dari transaksi
yang berhasil disimpan, bukan dari pesan browser yang belum terkonfirmasi.

