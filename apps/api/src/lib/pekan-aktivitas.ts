import { todayWib } from "./jurnal";

// Strip aktivitas pekan berjalan untuk beranda murid (Fitur Kilau
// Murid 3): tujuh hari Senin–Minggu pekan berjalan menurut WIB,
// masing-masing ditandai punya aktivitas belajar atau tidak, plus
// hitungan "N dari 7 hari".
//
// BATASAN FILOSOFI SIMAK yang terkunci di bentuk data ini: strip ini
// BUKAN rangkaian beruntun (streak). Tidak ada hitungan hari
// berurutan, tidak ada keadaan "putus", dan hari kosong bersifat
// netral — bukan kegagalan. Karena itu tipe di bawah memang hanya
// memuat penanda per hari + hitungan aktif; jangan tambahkan field
// beruntun apa pun ke sini.
//
// Sumber penanda hari aktif diputuskan pemanggil (routes/murid.ts):
// baris xp_ledger berpoin positif pada hari itu — tiga kejadian
// ketuntasan yang tercatat server (materi tuntas, LKPD terkumpul,
// exit ticket). Entri jurnal tidak ikut dihitung: data jurnal tidak
// tersedia di payload beranda yang sama.

export type WeekActivityDay = {
  /** Tanggal WIB "YYYY-MM-DD". */
  date: string;
  /** Label hari pendek Bahasa Indonesia: Sen..Min. */
  weekday: string;
  active: boolean;
  isToday: boolean;
};

export type WeekActivity = {
  days: WeekActivityDay[];
  activeCount: number;
};

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;
const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

/** "YYYY-MM-DD" → milidetik UTC tengah malam tanggal kalender itu. */
function parseDateUtcMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Milidetik UTC tengah malam → "YYYY-MM-DD" (kalender UTC murni). */
function formatUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Tujuh tanggal WIB (Senin..Minggu) pekan yang memuat `now`, sebagai
 * "YYYY-MM-DD". Aritmetikanya kalender murni dari string tanggal WIB
 * hari ini (lib/jurnal todayWib) — tidak terpengaruh zona waktu
 * proses.
 */
export function wibWeekDates(now: Date): string[] {
  const todayMs = parseDateUtcMs(todayWib(now));
  const dayOfWeek = new Date(todayMs).getUTCDay(); // 0 = Minggu .. 6 = Sabtu
  const mondayMs = todayMs - ((dayOfWeek + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => formatUtcMs(mondayMs + i * DAY_MS));
}

/**
 * Rentang instan [Senin 00.00 WIB, Senin berikutnya 00.00 WIB) untuk
 * menyaring kolom timestamp (mis. xp_ledger.created_at): Senin 00.00
 * WIB adalah Ahad 17.00 UTC sebelumnya.
 */
export function wibWeekRangeUtc(now: Date): { start: Date; end: Date } {
  const mondayMs = parseDateUtcMs(wibWeekDates(now)[0]!);
  const startMs = mondayMs - WIB_OFFSET_MS;
  return { start: new Date(startMs), end: new Date(startMs + 7 * DAY_MS) };
}

/** Susun model strip dari himpunan tanggal WIB yang punya aktivitas. */
export function buildWeekActivity(now: Date, activeDates: ReadonlySet<string>): WeekActivity {
  const today = todayWib(now);
  const days = wibWeekDates(now).map((date, i) => ({
    date,
    weekday: WEEKDAY_LABELS[i]!,
    active: activeDates.has(date),
    isToday: date === today,
  }));
  return { days, activeCount: days.filter((day) => day.active).length };
}
