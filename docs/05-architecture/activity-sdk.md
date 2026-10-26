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

