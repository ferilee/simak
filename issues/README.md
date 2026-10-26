# Issue SIMAK

Issue di folder ini adalah rencana implementasi lokal untuk MVP SIMAK. Issue
ditulis sebagai vertical slice: setiap issue memiliki hasil yang dapat diperiksa
atau didemokan dari alur pengguna.

## Urutan dan dependency

```text
SIMAK-001
  ├── SIMAK-002
  ├── SIMAK-003
  ├── SIMAK-004 ──┐
  └── SIMAK-005 ──┼── SIMAK-006 ── SIMAK-007 ── SIMAK-008 ──┐
                  │       └────────────── SIMAK-009 ─────────┤
                  └─────────────────────────────────────────┘
                                      SIMAK-010
                                         │
                                      SIMAK-011
                                         │
                                      SIMAK-012
```

## Daftar issue

| ID | Judul | Blocked by |
| --- | --- | --- |
| [SIMAK-001](./SIMAK-001-fondasi-aplikasi-dan-login-ruas.md) | Fondasi aplikasi dan login RUAS | Tidak ada |
| [SIMAK-002](./SIMAK-002-manajemen-kelas-dan-keanggotaan.md) | Manajemen kelas dan keanggotaan murid | SIMAK-001 |
| [SIMAK-003](./SIMAK-003-pembuatan-dan-pembacaan-modul.md) | Pembuatan dan pembacaan modul materi | SIMAK-001 |
| [SIMAK-004](./SIMAK-004-editor-dan-renderer-lkpd.md) | Editor dan renderer blok LKPD | SIMAK-001 |
| [SIMAK-005](./SIMAK-005-penyimpanan-berkas-dan-foto.md) | Penyimpanan berkas dan unggah foto pekerjaan | SIMAK-001 |
| [SIMAK-006](./SIMAK-006-penugasan-ke-kelas.md) | Penugasan modul dan LKPD ke kelas | SIMAK-002, SIMAK-003, SIMAK-004 |
| [SIMAK-007](./SIMAK-007-pengerjaan-autosave-dan-pengumpulan.md) | Pengerjaan murid, autosave, dan pengumpulan | SIMAK-005, SIMAK-006 |
| [SIMAK-008](./SIMAK-008-penilaian-otomatis-dan-manual.md) | Penilaian otomatis dan manual | SIMAK-004, SIMAK-007 |
| [SIMAK-009](./SIMAK-009-aktivitas-presensi-dan-exit-ticket.md) | Aktivitas, presensi, dan exit ticket | SIMAK-006, SIMAK-007 |
| [SIMAK-010](./SIMAK-010-rekap-dan-impor-nilai-ruas.md) | Rekap sesi dan impor nilai RUAS | SIMAK-008, SIMAK-009 |
| [SIMAK-011](./SIMAK-011-konten-awal-dan-pilot.md) | Konten awal dan pilot satu sesi nyata | SIMAK-010 |
| [SIMAK-012](./SIMAK-012-hardening-dan-rilis-staging.md) | Hardening, pengujian perangkat, backup, dan rilis staging | SIMAK-011 |

## Status

Semua issue berstatus `ready` setelah breakdown disetujui. Status pengerjaan
aktual dikelola secara manual sampai repositori memiliki issue tracker.

