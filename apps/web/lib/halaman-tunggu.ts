// Halaman tunggu "Penugasan belum dibuka" (v1.0.37) — helper murni.
//
// API menolak detail penugasan yang belum tiba waktu bukanya dengan 403
// yang membawa data ringkas { title, subject_name, opens_at, closes_at }
// (lihat apps/api/src/lib/halaman-tunggu.ts). Halaman detail murid
// mengenali bentuk itu dan menggambar halaman tunggu bertema — judul,
// jadwal buka dan batas pengumpulan, serta hitung mundur langsung —
// alih-alih layar kosong + toast. Semua fungsi di sini murni agar bisa
// diuji tanpa peramban (lihat halaman-tunggu.test.mjs).

export type NotYetOpenInfo = {
  title: string;
  subject_name: string | null;
  opens_at: string;
  closes_at: string;
};

/**
 * Kenali bentuk galat "belum dibuka": hanya 403 yang datanya memuat
 * opens_at + closes_at + title yang sahih. Bentuk lain (404 bukan
 * sasaran — yang memang tidak membawa data — galat jaringan, dst.)
 * menghasilkan null agar halaman mempertahankan perilaku lamanya.
 */
export function parseNotYetOpen(status: number, data: unknown): NotYetOpenInfo | null {
  if (status !== 403) return null;
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Partial<NotYetOpenInfo>;
  if (typeof candidate.title !== "string" || candidate.title === "") return null;
  if (typeof candidate.opens_at !== "string" || Number.isNaN(new Date(candidate.opens_at).getTime())) return null;
  if (typeof candidate.closes_at !== "string" || Number.isNaN(new Date(candidate.closes_at).getTime())) return null;
  return {
    title: candidate.title,
    subject_name: typeof candidate.subject_name === "string" ? candidate.subject_name : null,
    opens_at: candidate.opens_at,
    closes_at: candidate.closes_at,
  };
}

export type CountdownParts = {
  /** true bila waktu buka sudah tiba (selisih <= 0). */
  passed: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/**
 * Sisa waktu menuju target, dipecah menjadi hari/jam/menit/detik.
 * Selisih dibulatkan ke atas ke detik terdekat agar tampilan tidak
 * pernah menunjukkan 0 pada semua unit selama masih menunggu; pada
 * tepat nol dan sesudahnya, passed = true dan semua unit 0.
 */
export function countdownParts(targetMs: number, nowMs: number): CountdownParts {
  const diffMs = targetMs - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return { passed: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.ceil(diffMs / 1000);
  return {
    passed: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export type CountdownUnit = { value: number; label: "Hari" | "Jam" | "Menit" | "Detik" };

/**
 * Unit yang ditampilkan: unit nol di depan disembunyikan (tidak ada
 * "0 Hari" bila bukanya hari ini), tetapi mulai unit bukan-nol pertama
 * semua unit di bawahnya ikut tampil (termasuk yang nol di tengah),
 * dan Detik selalu tampil. Keadaan passed menghasilkan daftar kosong.
 */
export function countdownUnits(parts: CountdownParts): CountdownUnit[] {
  if (parts.passed) return [];
  const all: CountdownUnit[] = [
    { value: parts.days, label: "Hari" },
    { value: parts.hours, label: "Jam" },
    { value: parts.minutes, label: "Menit" },
    { value: parts.seconds, label: "Detik" },
  ];
  const firstNonZero = all.findIndex((unit) => unit.value > 0);
  return all.slice(firstNonZero === -1 ? all.length - 1 : firstNonZero);
}

/**
 * Jadwal dalam bahasa Indonesia: "Rabu, 5 November 2026 pukul 10.55".
 * Memakai Intl.DateTimeFormat id-ID seperti formatter tanggal lain di
 * aplikasi; label "WIB" ditambahkan pemanggil pada kalimatnya.
 */
export function formatSchedule(iso: string): string {
  const date = new Date(iso);
  const dayPart = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(":", ".");
  return `${dayPart} pukul ${timePart}`;
}
