// Sapaan dinamis untuk murid: salam mengikuti jam setempat, dan satu
// kalimat penyemangat yang berganti harian — dipilih secara
// deterministik dari tanggal (sama sepanjang hari, berganti esoknya,
// tanpa perlu data dari server). Kutipannya kalimat penyemangat umum
// tanpa atribusi nama, supaya tidak ada kutipan karangan yang
// ditempelkan ke tokoh mana pun.

export function salamForHour(hour: number): string {
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export const MOTIVATIONAL_QUOTES: readonly string[] = [
  "Setiap ahli dulunya adalah pemula yang tidak berhenti mencoba.",
  "Belajar itu seperti menaiki tangga: satu anak tangga dalam satu waktu.",
  "Kesalahan hari ini adalah petunjuk untuk jawaban besok.",
  "Tidak ada jalan pintas menuju tempat yang layak dituju.",
  "Konsisten sedikit setiap hari mengalahkan semangat besar sesekali.",
  "Bertanya bukan tanda tidak bisa — itu tanda sedang belajar.",
  "Otak juga seperti otot: makin dilatih, makin kuat.",
  "Fokus pada kemajuanmu sendiri, bukan pada kecepatan orang lain.",
  "Materi yang terasa sulit hari ini akan terasa biasa bulan depan.",
  "Kerja kelompok yang baik membuat yang berat terasa ringan.",
  "Catatan kecil yang rapi hari ini adalah penyelamat saat ujian nanti.",
  "Istirahat itu bagian dari belajar, bukan lawannya.",
  "Keberanian mencoba jauh lebih berharga daripada takut salah.",
  "Satu soal yang dipahami sungguh-sungguh lebih baik dari sepuluh yang dihafal.",
];

/** Indeks kutipan hari ini: stabil sepanjang hari, bergeser tiap tanggal. */
export function quoteIndexForDate(date: Date, count: number): number {
  if (count <= 0) return 0;
  const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return ((days % count) + count) % count;
}

export function quoteOfTheDay(date: Date): string {
  return MOTIVATIONAL_QUOTES[quoteIndexForDate(date, MOTIVATIONAL_QUOTES.length)]!;
}
