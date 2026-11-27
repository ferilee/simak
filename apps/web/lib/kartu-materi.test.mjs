// Tests for "Kartu Materi Pastel" helpers (lib/kartu-materi.ts):
// palet deterministik per kelompok materi, glyph ubin per kata kunci,
// dan estimasi menit baca untuk baris meta kartu daftar materi murid.
// Run with bun from apps/web:  bun lib/kartu-materi.test.mjs
import { readFileSync } from "node:fs";
import { glyphForGroup, paletteForGroup, readingMinutes } from "./kartu-materi.ts";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const BIRU = { bg: "#e8f3fe", tile: "#d2e8fd", accent: "#0b6bcb" };
const PALET_SAH = [
  { bg: "#e8f7ee", tile: "#cdeeda", accent: "#178a4c" },
  BIRU,
  { bg: "#fdf6e0", tile: "#fbeec3", accent: "#9a7200" },
  { bg: "#f1eafd", tile: "#e2d6fc", accent: "#6941c6" },
  { bg: "#fdeef4", tile: "#fadbe9", accent: "#c2255c" },
  { bg: "#e6f7f5", tile: "#c9efea", accent: "#0e7a72" },
];
const samaPalet = (a, b) => a.bg === b.bg && a.tile === b.tile && a.accent === b.accent;

console.log("Case 1: paletteForGroup — deterministik, null → biru");
{
  check("kelompok sama → palet sama persis", samaPalet(paletteForGroup("Eksponen"), paletteForGroup("Eksponen")));
  check(
    "deterministik lintas panggilan (kelompok lain)",
    samaPalet(paletteForGroup("Matematika Keuangan"), paletteForGroup("Matematika Keuangan")),
  );
  check("null → palet biru", samaPalet(paletteForGroup(null), BIRU), JSON.stringify(paletteForGroup(null)));
  check("string kosong → palet biru", samaPalet(paletteForGroup(""), BIRU));
  check("hanya spasi → palet biru", samaPalet(paletteForGroup("   "), BIRU));
  check(
    "semua hasil adalah salah satu dari enam palet",
    ["Eksponen", "Fungsi Kuadrat", "Matematika Keuangan", "Berpikir Komputasional", "Statistika", "Peluang", "Trigonometri"]
      .every((nama) => PALET_SAH.some((palet) => samaPalet(paletteForGroup(nama), palet))),
  );
  check(
    "palet membawa tiga peran warna (bg/tile/accent terisi)",
    ["Eksponen", "Fungsi Kuadrat"].every((nama) => {
      const palet = paletteForGroup(nama);
      return palet.bg !== "" && palet.tile !== "" && palet.accent !== "";
    }),
  );
}

console.log("Case 2: glyphForGroup — kata kunci utama");
{
  check('"Fungsi Kuadrat" → ƒ(x) (Kuadrat menang atas Fungsi)', glyphForGroup("Fungsi Kuadrat") === "ƒ(x)", glyphForGroup("Fungsi Kuadrat"));
  check('"Eksponen" → xⁿ', glyphForGroup("Eksponen") === "xⁿ", glyphForGroup("Eksponen"));
  check('"Logaritma" → log', glyphForGroup("Logaritma") === "log", glyphForGroup("Logaritma"));
  check('"Barisan dan Deret" → aₙ', glyphForGroup("Barisan dan Deret") === "aₙ", glyphForGroup("Barisan dan Deret"));
  check('"Deret" saja → aₙ', glyphForGroup("Deret") === "aₙ");
  check('"Matematika Keuangan" → Rp', glyphForGroup("Matematika Keuangan") === "Rp", glyphForGroup("Matematika Keuangan"));
  check('"Bunga Majemuk" → Rp', glyphForGroup("Bunga Majemuk") === "Rp");
  check('"Anuitas" → Rp', glyphForGroup("Anuitas") === "Rp");
  check('"Fungsi Komposisi dan Invers" → ƒ∘g', glyphForGroup("Fungsi Komposisi dan Invers") === "ƒ∘g", glyphForGroup("Fungsi Komposisi dan Invers"));
  check('"Trigonometri" → sin', glyphForGroup("Trigonometri") === "sin");
  check('"Statistika" → x̄', glyphForGroup("Statistika") === "x̄");
  check('"Analisis Data" → x̄', glyphForGroup("Analisis Data") === "x̄");
  check('"Geometri" → △', glyphForGroup("Geometri") === "△");
  check('"Bangun Ruang" → △', glyphForGroup("Bangun Ruang") === "△");
  check('"Lingkaran" → △', glyphForGroup("Lingkaran") === "△");
  check('"Peluang" → P(A)', glyphForGroup("Peluang") === "P(A)");
  check('"Matriks" → [A]', glyphForGroup("Matriks") === "[A]");
  check('"Vektor" → →', glyphForGroup("Vektor") === "→");
  check('"Persamaan Linear" → x≤y', glyphForGroup("Persamaan Linear") === "x≤y", glyphForGroup("Persamaan Linear"));
  check('"Pertidaksamaan" → x≤y', glyphForGroup("Pertidaksamaan") === "x≤y");
  check('"Algoritma" → ◇', glyphForGroup("Algoritma") === "◇");
  check('"Flowchart" → ◇', glyphForGroup("Flowchart") === "◇");
  check('"Berpikir Komputasional" → ⌘', glyphForGroup("Berpikir Komputasional") === "⌘", glyphForGroup("Berpikir Komputasional"));
  check("kata kunci tanpa peka huruf (huruf kecil semua)", glyphForGroup("fungsi kuadrat") === "ƒ(x)");
}

console.log("Case 3: glyphForGroup — fallback inisial dan kelompok kosong");
{
  check('"Bahasa Inggris" → inisial BI', glyphForGroup("Bahasa Inggris") === "BI", glyphForGroup("Bahasa Inggris"));
  check("satu kata tanpa kata kunci → satu inisial", glyphForGroup("Seni") === "S", glyphForGroup("Seni"));
  check("tiga kata → hanya dua inisial pertama", glyphForGroup("Pendidikan Jasmani Olahraga") === "PJ", glyphForGroup("Pendidikan Jasmani Olahraga"));
  check("null → ✦", glyphForGroup(null) === "✦");
  check("string kosong → ✦", glyphForGroup("") === "✦");
  check("hanya spasi → ✦", glyphForGroup("   ") === "✦");
}

console.log("Case 4: readingMinutes — 300 kata per menit, lantai 1");
{
  check("0 kata → null", readingMinutes(0) === null);
  check("negatif → null", readingMinutes(-10) === null);
  check("1 kata → 1 menit", readingMinutes(1) === 1);
  check("300 kata → 1 menit", readingMinutes(300) === 1);
  check("301 kata → 2 menit", readingMinutes(301) === 2);
  check("600 kata → 2 menit", readingMinutes(600) === 2);
  check("601 kata → 3 menit", readingMinutes(601) === 3);
  check("1500 kata → 5 menit", readingMinutes(1500) === 5);
}

console.log("Case 5: penjaga sumber — tanpa lookbehind (lantai Safari 16.3)");
{
  const source = readFileSync(new URL("./kartu-materi.ts", import.meta.url), "utf8");
  check("kartu-materi.ts bebas pola lookbehind", !source.includes("(?<"), "ditemukan '(?<' pada sumber helper");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
