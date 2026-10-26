# SIMAK-002 — Manajemen kelas dan keanggotaan murid

**Status:** Ready  
**Tipe:** Feature / vertical slice  
**Priority:** P0

## What to build

Berikan alur lengkap bagi guru untuk membuat dan mengarsipkan kelas, menyusun
anggota dari akun RUAS, serta bagi murid untuk bergabung melalui kode kelas.
Semua akses dibatasi oleh kepemilikan guru dan status akun RUAS.

Kelas adalah rombel operasional SIMAK yang memiliki nama, mata pelajaran, tahun
ajaran, dan kode gabung. Keanggotaan disimpan sebagai relasi unik antara kelas
dan murid.

## User stories covered

- Sebagai guru, saya dapat membuat kelas yang saya ampu.
- Sebagai guru, saya dapat memasukkan murid berdasarkan username atau NIS.
- Sebagai murid, saya dapat bergabung ke kelas memakai kode setelah login.
- Sebagai guru, saya dapat melihat anggota kelas saya tanpa melihat kelas guru lain.

## Acceptance criteria

- [ ] Guru dapat membuat kelas dengan nama, mata pelajaran, dan tahun ajaran.
- [ ] Setiap kelas memperoleh `join_code` unik yang dapat diganti atau dinonaktifkan
      sesuai aturan produk.
- [ ] Guru dapat mencari akun murid RUAS berdasarkan username atau NIS.
- [ ] Pengguna yang tidak ditemukan atau tidak aktif di RUAS tidak dapat ditambahkan.
- [ ] Relasi kelas-murid bersifat unik; penambahan ulang tidak menghasilkan duplikat.
- [ ] Murid yang sudah login dapat bergabung menggunakan kode kelas yang valid.
- [ ] Kode kelas yang salah, kedaluwarsa, atau milik kelas yang diarsipkan ditolak.
- [ ] Guru dapat melihat daftar anggota dan status keanggotaan kelasnya.
- [ ] Guru dapat mengarsipkan kelas; kelas arsip tidak menerima penugasan baru.
- [ ] Guru tidak dapat membaca atau mengubah kelas milik guru lain dengan mengganti
      ID pada URL atau request body.
- [ ] Murid tidak dapat melihat daftar anggota kelas yang tidak diikutinya.
- [ ] API mengembalikan error validasi dan otorisasi yang konsisten.
- [ ] Alur guru membuat kelas sampai membagikan kode dapat selesai kurang dari
      15 menit menggunakan data staging.

## Out of scope

- Impor massal dari sistem akademik sekolah.
- Admin sekolah dan wali kelas.
- Pemindahan murid otomatis antar-tahun ajaran.

## Blocked by

- SIMAK-001 — Fondasi aplikasi dan login RUAS.

## Related documentation

- `docs/02-access/classroom-access.md`
- `docs/02-access/roles-and-permissions.md`
- `docs/05-architecture/data-model.md`

