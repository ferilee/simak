# Kontrak Activity SDK

**Status:** Proposed untuk standardisasi internal; event MVP sudah final.

Activity SDK adalah lapisan kecil yang dipakai frontend untuk mencatat aktivitas
murid secara konsisten.

## Event MVP

```ts
type ActivityEvent =
  | "buka_materi"
  | "mulai_lkpd"
  | "kumpul"
  | "buka_kuis_ruas"
  | "exit_ticket";
```

Setiap pengiriman minimal membawa `assignmentId` dan `event`. Identitas murid
diambil dari sesi server, bukan dari body yang dikirim browser.

## Perilaku SDK

- Mengirim event ke `POST /api/v1/activity`.
- Tidak menyimpan isi jawaban dalam activity log.
- Boleh menggabungkan event yang berulang jika aturan event mengizinkannya.
- Menampilkan kegagalan jaringan tanpa mengklaim event sudah tercatat.
- Menjaga agar event tidak menghambat murid membaca atau mengerjakan.

## Indikasi integritas

Selain activity log, SIMAK dapat mencatat sinyal proses pengerjaan melalui
`POST /api/v1/integrity`. Sinyal MVP adalah `visibility_hidden`, `window_blur`,
`copy_attempt`, `paste_attempt`, dan `context_menu`.

Sinyal ini bukan bukti otomatis bahwa murid melakukan kecurangan. Browser dapat
memicu sinyal karena perpindahan aplikasi yang sah, keterbatasan perangkat,
atau perilaku pengguna yang tidak terkait kecurangan. SIMAK hanya memakai
sinyal tersebut untuk membantu guru menentukan pekerjaan yang perlu ditinjau.

Pengiriman dideduplikasi di client dan server dalam jendela 10 detik untuk
menghindari pencatatan berulang. SIMAK tidak memakai kamera, mikrofon,
keylogger, pembacaan isi clipboard, atau detektor AI pada MVP.

