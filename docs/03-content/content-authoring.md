# Penulisan Materi dan LKPD

**Status:** MVP.

## Modul materi

Modul tersusun dari blok teks, gambar, video YouTube, berkas, dan sub-bab.
Modul memiliki status draf, terbit, atau arsip, serta versi agar guru dapat
menggunakannya kembali tanpa kehilangan riwayat.

## LKPD

Setiap butir menyimpan pertanyaan, tipe, opsi bila diperlukan, kunci atau rubrik,
pembahasan, dan bobot. Jenis blok menentukan komponen tampilan dan cara penilaian.

| Jenis | Penilaian |
| --- | --- |
| `isian_singkat` | Otomatis dengan toleransi angka |
| `pilihan_ganda` | Otomatis untuk latihan |
| `langkah_berurutan` | Otomatis berdasarkan urutan |
| `uraian` | Manual dengan rubrik |
| `unggah_foto` | Manual |
| `refleksi` | Bukti refleksi, tidak dinilai |
| `tautan_ruas` | Dinilai di RUAS |

## Aturan authoring

- Tulis instruksi yang dapat dipahami dari layar HP.
- Pecah soal panjang menjadi langkah yang jelas.
- Sediakan pembahasan untuk blok yang dinilai otomatis.
- Jangan memakai pilihan ganda sebagai pengganti kuis asesmen RUAS.
- Pastikan jawaban manual memiliki rubrik atau kriteria yang dapat digunakan guru.

## Rumus matematika

SIMAK merender ekspresi LaTeX menggunakan KaTeX pada teks materi, petunjuk,
pertanyaan LKPD, pilihan jawaban, dan tampilan penilaian guru. Gunakan salah
satu delimiter berikut:

| Bentuk | Contoh |
| --- | --- |
| Sebaris | `Luas persegi (s^2)` |
| Terpisah | `\[x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}\]` |
| Alternatif | `$a^2+b^2=c^2$` atau `$$\sum_{i=1}^{n} i$$` |

KaTeX mendukung sebagian besar perintah matematika umum, tetapi bukan seluruh
paket dan makro LaTeX. Rumus yang tidak dikenali tetap ditampilkan sebagai
teks sumber agar isi pembelajaran tidak hilang. Rumus panjang dapat digeser
secara horizontal pada layar kecil.

