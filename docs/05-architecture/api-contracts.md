# Kontrak API

**Status:** MVP; detail respons dapat berkembang saat implementasi distabilkan.

Semua endpoint menggunakan JSON dan berada di bawah `/api/v1`.

| Kelompok | Endpoint utama |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Kelas | `GET/POST /classes`, `GET/PATCH /classes/:id`, anggota kelas |
| Materi | `GET/POST /modules`, blok modul |
| LKPD | `GET/POST /worksheets`, butir LKPD |
| Upload | `POST /uploads/presign` |
| Penugasan | `GET/POST/PATCH /assignments` |
| Murid | `GET /murid/today`, detail penugasan |
| Pengumpulan | `PUT /submissions/:id/answers`, `POST /submissions/:id/submit` |
| Refleksi | `POST /assignments/:id/exit-ticket` |
| Penilaian | `GET/PATCH /grading/assignments/:id` |
| Aktivitas | `POST /activity` |
| Laporan | `GET /reports/session?assignmentId=:id[&format=csv|pdf]`, `GET /reports/range?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv|pdf]`, `POST /reports/ruas-import` |

## Aturan kontrak

- Endpoint terlindungi menolak request tanpa sesi yang valid.
- Error memiliki bentuk yang konsisten dan tidak membocorkan rahasia.
- Body dan parameter divalidasi di API.
- API tidak mempercayai `studentId` dari browser.
- Akses guru dan murid diperiksa untuk setiap resource.
- Filter `GET /reports/range` memakai tanggal `opens_at` penugasan dalam WIB,
  inklusif dari tanggal `from` sampai tanggal `to`.
- `POST /reports/ruas-import` menerima `{ assignmentId, rows }` dengan setiap
  baris berisi `identifier`, `score`, dan `studentName` opsional. `identifier`
  dicocokkan ke NIS atau username murid di kelas tujuan.

