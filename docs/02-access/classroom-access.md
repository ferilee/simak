# Akses Kelas

**Status:** MVP.

## Pembuatan kelas

Guru membuat kelas dengan nama rombel, mata pelajaran, dan tahun ajaran. Sistem
memberikan `join_code` unik yang dapat dibagikan guru.

Anggota dapat disusun oleh guru melalui username atau NIS yang dicocokkan ke
akun RUAS. Murid juga dapat bergabung menggunakan kode kelas setelah login,
sesuai alur yang dipilih untuk penerapan MVP.

## Batasan

- Satu murid tidak boleh memiliki dua keanggotaan pada kelas yang sama.
- Kelas yang diarsipkan tidak menerima penugasan baru.
- Kode kelas tidak menggantikan login RUAS.
- Guru tidak boleh memasukkan pengguna yang tidak ditemukan atau tidak aktif di
  sumber RUAS.

## Presensi

Presensi berasal dari aktivitas penugasan. Murid dianggap hadir jika membuka
penugasan dan mengumpulkan minimal LKPD atau exit ticket. Activity log menjadi
bukti berstempel waktu untuk keputusan tersebut.

