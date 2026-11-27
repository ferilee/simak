// Helper murni kartu materi PASTEL (daftar materi murid): palet warna
// per kelompok materi, glyph ubin ikon, dan estimasi menit baca.
// Murni dan deterministik — kelompok yang sama selalu mendapat palet
// dan glyph yang sama, tanpa keadaan acak dan tanpa penyimpanan, agar
// murid mengenali topik dari warna dan tandanya. Halaman hanya
// menggambar hasilnya; semua keputusan tinggal di sini dan dapat
// diuji tanpa peramban (lib/kartu-materi.test.mjs).

export type KartuMateriPalette = {
  /** Latar kartu. */
  bg: string;
  /** Latar ubin ikon + lingkaran panah. */
  tile: string;
  /** Aksen gelap: teks glyph dan panah (cukup kontras di atas ubin). */
  accent: string;
};

// Enam pasang pastel (latar kartu / latar ubin / aksen gelap).
// Urutan indeks TETAP — menggesernya mengubah warna semua kelompok.
const PALETTES: readonly KartuMateriPalette[] = [
  { bg: "#e8f7ee", tile: "#cdeeda", accent: "#178a4c" }, // 0 hijau
  { bg: "#e8f3fe", tile: "#d2e8fd", accent: "#0b6bcb" }, // 1 biru
  { bg: "#fdf6e0", tile: "#fbeec3", accent: "#9a7200" }, // 2 kuning
  { bg: "#f1eafd", tile: "#e2d6fc", accent: "#6941c6" }, // 3 ungu
  { bg: "#fdeef4", tile: "#fadbe9", accent: "#c2255c" }, // 4 merah muda
  { bg: "#e6f7f5", tile: "#c9efea", accent: "#0e7a72" }, // 5 toska
];

/** Indeks palet bawaan untuk kelompok kosong: biru (indeks 1). */
const DEFAULT_PALETTE_INDEX = 1;

/** Hash teks sederhana (FNV-1a 32-bit) — stabil lintas sesi/perangkat. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function cleanGroupName(topicGroup: string | null | undefined): string {
  return (topicGroup ?? "").trim();
}

/**
 * Palet kartu untuk sebuah kelompok materi: hash nama kelompok →
 * indeks palet, deterministik. Kelompok null/kosong → palet biru.
 */
export function paletteForGroup(topicGroup: string | null): KartuMateriPalette {
  const name = cleanGroupName(topicGroup);
  if (name === "") return PALETTES[DEFAULT_PALETTE_INDEX];
  return PALETTES[hashText(name) % PALETTES.length];
}

// Peta glyph per kata kunci nama kelompok — urutan dari yang paling
// spesifik: "Fungsi Kuadrat" harus kena "Kuadrat" (ƒ(x)) sebelum
// "Fungsi" (ƒ∘g). Pencocokan substring tanpa peka huruf besar/kecil.
const GLYPH_KEYWORDS: readonly { keywords: readonly string[]; glyph: string }[] = [
  { keywords: ["kuadrat"], glyph: "ƒ(x)" },
  { keywords: ["eksponen"], glyph: "xⁿ" },
  { keywords: ["logaritma"], glyph: "log" },
  { keywords: ["barisan", "deret"], glyph: "aₙ" },
  { keywords: ["keuangan", "bunga", "anuitas"], glyph: "Rp" },
  { keywords: ["fungsi"], glyph: "ƒ∘g" },
  { keywords: ["trigonometri"], glyph: "sin" },
  { keywords: ["statistika", "data"], glyph: "x̄" },
  { keywords: ["geometri", "bangun", "lingkaran"], glyph: "△" },
  { keywords: ["peluang"], glyph: "P(A)" },
  { keywords: ["matriks"], glyph: "[A]" },
  { keywords: ["vektor"], glyph: "→" },
  { keywords: ["persamaan", "pertidaksamaan"], glyph: "x≤y" },
  { keywords: ["algoritma", "flowchart"], glyph: "◇" },
  { keywords: ["komputasional"], glyph: "⌘" },
];

/**
 * Glyph ubin ikon untuk sebuah kelompok materi. Kelompok tanpa kata
 * kunci yang cocok → inisial maksimal dua huruf dari dua kata pertama
 * namanya. Kelompok null/kosong → "✦".
 */
export function glyphForGroup(topicGroup: string | null): string {
  const name = cleanGroupName(topicGroup);
  if (name === "") return "✦";
  const lower = name.toLowerCase();
  for (const entry of GLYPH_KEYWORDS) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) return entry.glyph;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return initials === "" ? "✦" : initials;
}

/**
 * Estimasi menit baca dari jumlah kata: kata ÷ 300 kata per menit
 * (laju yang sama dengan gerbang baca wajar di API, lib/baca-wajar),
 * dibulatkan ke atas dengan lantai 1 menit. Jumlah kata nol/negatif/
 * tak valid → null (kartu tidak menampilkan estimasi sama sekali).
 */
export function readingMinutes(wordCount: number): number | null {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 300));
}
