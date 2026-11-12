// Perencana murni untuk PDF Rekap Sesi (Pantau Hasil → Unduh PDF):
// (1) warna latar sel menurut ketuntasan, dan (2) lebar kolom yang
// mengikuti isi. Generator PDF-nya sendiri adalah penulis PDF manual
// di routes/reports.ts (font Helvetica bawaan PDF, tabel digambar per
// sel) — berkas ini hanya memutuskan angka dan warna, tidak menggambar.
//
// WARNA mengikuti referensi dokumen bergaya Excel yang disetujui guru:
// kuning muda FFF2CC untuk keadaan "kurang / belum tuntas / masih
// draf", merah muda F4CCCC untuk "belum mengerjakan / belum mengisi",
// dan kepala tabel biru muda CFE2F3.
//
// CATATAN MODEL DATA (jujur, dari baris nyata ReportRow di reports.ts):
// - Persen membaca materi TIDAK ADA di data — ketuntasan materi di
//   server bersifat biner (baris activity_logs "baca_materi_tuntas")
//   dan tidak diteruskan ke baris rekap. Sinyal terdekat yang setia di
//   baris rekap adalah opened_at (pernah "buka_materi") dan hadir
//   (membuka materi DAN sudah mengumpulkan sesuatu). Aturan persen
//   dipetakan ke sinyal itu untuk kolom Presensi: belum pernah membuka
//   materi = "0%" (merah), sudah membuka tetapi belum hadir = "belum
//   tuntas" (kuning), hadir = tuntas untuk keperluan warna (tanpa
//   warna). Batasnya: murid yang selesai membaca tetapi belum
//   mengumpulkan apa pun tetap kuning di kolom Presensi.
// - "Penugasan punya kuis RUAS" juga tidak punya kolom penanda. Nilai
//   RUAS pada rekap berasal dari IMPOR CSV nilai RUAS oleh guru
//   (tabel ruas_scores), jadi sinyal terdekatnya: penugasan dianggap
//   memakai kuis RUAS bila ada bukti impor untuk penugasan itu
//   (ringkasan ruas_scored > 0 atau ada baris impor tak cocok).
//   Batasnya: kuis yang sudah dibagikan tetapi nilainya belum diimpor
//   tidak terdeteksi — kolom RUAS tampil tanpa warna.

export type RekapCellFill = "kuning" | "merah" | null;

/** Hex (tanpa #) warna kuning muda referensi. */
export const REKAP_FILL_KUNING_HEX = "FFF2CC";
/** Hex (tanpa #) warna merah muda referensi. */
export const REKAP_FILL_MERAH_HEX = "F4CCCC";
/** Hex (tanpa #) biru muda kepala tabel referensi. */
export const REKAP_HEADER_HEX = "CFE2F3";

export function rekapFillHex(fill: Exclude<RekapCellFill, null>): string {
  return fill === "kuning" ? REKAP_FILL_KUNING_HEX : REKAP_FILL_MERAH_HEX;
}

/** Ubah hex "RRGGBB" menjadi operator warna PDF "r g b" (0–1, 3 desimal). */
export function hexToPdfColor(hex: string): string {
  const parts = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return parts.map((value) => value.toFixed(3)).join(" ");
}

export function rekapFillPdfColor(fill: Exclude<RekapCellFill, null>): string {
  return hexToPdfColor(rekapFillHex(fill));
}

/** Operator warna PDF untuk kepala tabel (biru muda referensi). */
export const REKAP_HEADER_PDF_COLOR = hexToPdfColor(REKAP_HEADER_HEX);

// ---------------------------------------------------------------------
// Rencana warna per sel
// ---------------------------------------------------------------------

export type RekapLkpdStatus = "belum" | "draf" | "terkumpul" | "dinilai";

export type RekapRowState = {
  /** opened_at !== null pada baris rekap: murid pernah membuka materi. */
  materiDibuka: boolean;
  /** hadir pada baris rekap: membuka materi dan sudah mengumpulkan. */
  materiHadir: boolean;
  lkpdStatus: RekapLkpdStatus;
  /** total_score baris rekap; null = belum ada nilai. */
  nilai: number | null;
  exitTicketSubmitted: boolean;
  /** ruas_score baris rekap; null = belum ada nilai RUAS untuk murid. */
  ruasScore: number | null;
  /** Penugasan memakai kuis RUAS (ada bukti impor nilai RUAS). */
  ruasBerlaku: boolean;
};

export type RekapFillColumn = "materi" | "lkpd" | "nilai" | "exit" | "ruas";

export function planRekapCellFill(kolom: RekapFillColumn, keadaan: RekapRowState): RekapCellFill {
  switch (kolom) {
    case "materi":
      // Pemetaan persen ke sinyal baris: 0% ≙ belum pernah membuka
      // materi; 1–99% ≙ sudah membuka tetapi belum hadir (belum
      // tuntas rangkaiannya); 100% ≙ hadir.
      if (!keadaan.materiDibuka) return "merah";
      return keadaan.materiHadir ? null : "kuning";
    case "lkpd":
      if (keadaan.lkpdStatus === "belum") return "merah";
      if (keadaan.lkpdStatus === "draf") return "kuning";
      return null; // terkumpul / dinilai
    case "nilai":
      if (keadaan.nilai !== null) return null;
      // Belum ada nilai: merah hanya bila LKPD-nya sendiri belum
      // dimulai; draf/terkumpul (dan tepi dinilai tanpa angka) kuning.
      return keadaan.lkpdStatus === "belum" ? "merah" : "kuning";
    case "exit":
      return keadaan.exitTicketSubmitted ? null : "merah";
    case "ruas":
      if (keadaan.ruasScore !== null) return null;
      return keadaan.ruasBerlaku ? "merah" : null;
  }
}

/** Warna kelima kolom beraturan untuk satu baris, sekali panggil. */
export function planRekapRowFills(keadaan: RekapRowState): Record<RekapFillColumn, RekapCellFill> {
  return {
    materi: planRekapCellFill("materi", keadaan),
    lkpd: planRekapCellFill("lkpd", keadaan),
    nilai: planRekapCellFill("nilai", keadaan),
    exit: planRekapCellFill("exit", keadaan),
    ruas: planRekapCellFill("ruas", keadaan),
  };
}

// ---------------------------------------------------------------------
// Ukuran teks Helvetica (font yang benar-benar dipakai generator)
// ---------------------------------------------------------------------

// Lebar glyf Helvetica baku (satuan 1/1000 em) untuk ASCII 32–126 —
// font Type1 "Helvetica" yang dirujuk generator PDF. Teks diukur
// SESUDAH disanitasi sama seperti pdfText di reports.ts (diakritik
// dibuang, di luar ASCII tercetak menjadi "?"), supaya lebar rencana
// sama dengan yang benar-benar digambar.
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 222,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

export function sanitizePdfText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

/** Lebar teks (pt) pada Helvetica ukuran tertentu — fungsi ukur produksi. */
export function measurePdfText(text: string, fontSize: number): number {
  const safe = sanitizePdfText(text);
  let units = 0;
  for (const char of safe) units += HELVETICA_WIDTHS[char] ?? 556;
  return (units / 1000) * fontSize;
}

export type RekapMeasure = (text: string, fontSize: number) => number;

// ---------------------------------------------------------------------
// Rencana lebar kolom mengikuti isi
// ---------------------------------------------------------------------

// Bungkus kata demi kata PERSIS seperti wrapPdfText di reports.ts
// (kata lebih panjang dari maxChars dipecah paksa). Dipakai perencana
// untuk mensimulasikan baris yang benar-benar akan digambar saat
// kolom bungkus menyusut — bukan untuk menggambar.
export function wrapLinesByChars(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
      current = "";
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// Sel kolom Murid berbentuk "Nama (username)": dua baris logis —
// nama, lalu "(username)". Lebar kolom diukur per baris logis ini.
export function rekapNameLines(text: string): string[] {
  const match = /^(.*) (\([^()]*\))$/.exec(text);
  return match ? [match[1]!, match[2]!] : [text];
}

function longestWordLength(text: string): number {
  return text.split(/\s+/).filter(Boolean).reduce((max, word) => Math.max(max, word.length), 0);
}

function longestWordWidth(text: string, measure: RekapMeasure, fontSize: number): number {
  return text.split(/\s+/).filter(Boolean).reduce((max, word) => Math.max(max, measure(word, fontSize)), 0);
}

const roundUp1 = (value: number) => Math.ceil(value * 10) / 10;

export type RekapColumnWidthOptions = {
  headers: string[];
  rows: string[][];
  measure: RekapMeasure;
  headerFontSize: number;
  bodyFontSize: number;
  /** Padding mendatar SATU sisi sel (pt) — teks digambar di x+padding. */
  cellPaddingX: number;
  /** Lebar cetak maksimum tabel (pt). */
  maxTableWidth: number;
  /** Indeks kolom yang boleh menyusut + membungkus (kolom Murid). */
  wrapColumnIndex: number;
};

export type RekapColumnWidthPlan = {
  widths: number[];
  chars: number[];
  /** true bila kolom bungkus terpaksa menyusut dari lebar isinya. */
  namaMembungkus: boolean;
};

export function planRekapColumnWidths(options: RekapColumnWidthOptions): RekapColumnWidthPlan {
  const { headers, rows, measure, headerFontSize, bodyFontSize, cellPaddingX, maxTableWidth, wrapColumnIndex } = options;
  const padding = cellPaddingX * 2;
  const columnCount = headers.length;

  const widths: number[] = [];
  const chars: number[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    const header = headers[index]!;
    if (index === wrapColumnIndex) {
      // Kolom bungkus: lebar dari baris logis terpanjang (nama /
      // (username) diukur terpisah); chars = panjang baris logis
      // terpanjang supaya pembungkus mematahkan tepat di antara
      // kedua baris logis itu dan tidak memotong kata.
      let contentWidth = measure(header, headerFontSize);
      let contentChars = header.length;
      for (const row of rows) {
        for (const line of rekapNameLines(row[index]!)) {
          contentWidth = Math.max(contentWidth, measure(line, bodyFontSize));
          contentChars = Math.max(contentChars, line.length);
        }
      }
      widths.push(roundUp1(contentWidth + padding));
      chars.push(contentChars);
    } else {
      // Kolom lain tidak pernah membungkus: lebar = teks terpanjang
      // (kepala pada ukuran kepala, sel pada ukuran isi) + padding;
      // chars = panjang teks terpanjang sehingga tidak ada sel yang
      // terbungkus atau terpotong.
      let contentWidth = measure(header, headerFontSize);
      let contentChars = header.length;
      for (const row of rows) {
        const cell = row[index]!;
        contentWidth = Math.max(contentWidth, measure(cell, bodyFontSize));
        contentChars = Math.max(contentChars, cell.length);
      }
      widths.push(roundUp1(contentWidth + padding));
      chars.push(contentChars);
    }
  }

  let namaMembungkus = false;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total > maxTableWidth) {
    // Hanya kolom bungkus yang menyusut. Lantainya: kata terpanjang
    // yang tak terpisahkan pada kolom itu tetap muat (bila mungkin).
    const overflow = total - maxTableWidth;
    let minWrapWidth = measure(headers[wrapColumnIndex]!, headerFontSize);
    for (const row of rows) minWrapWidth = Math.max(minWrapWidth, longestWordWidth(row[wrapColumnIndex]!, measure, bodyFontSize));
    minWrapWidth = roundUp1(minWrapWidth + padding);
    const shrunk = Math.max(widths[wrapColumnIndex]! - overflow, minWrapWidth);
    if (shrunk < widths[wrapColumnIndex]!) {
      widths[wrapColumnIndex] = shrunk;
      namaMembungkus = true;
      // chars ikut menyusut: nilai terbesar yang baris-baris
      // simulasinya masih muat selebar kolom baru; lantai = kata
      // terpanjang (kata tidak boleh dipecah paksa).
      const innerWidth = shrunk - padding;
      let floorChars = headers[wrapColumnIndex]!.length;
      for (const row of rows) floorChars = Math.max(floorChars, longestWordLength(row[wrapColumnIndex]!));
      let chosen = floorChars;
      for (let candidate = chars[wrapColumnIndex]!; candidate > floorChars; candidate -= 1) {
        const fits = rows.every((row) => wrapLinesByChars(row[wrapColumnIndex]!, candidate).every((line) => measure(line, bodyFontSize) <= innerWidth));
        if (fits) { chosen = candidate; break; }
      }
      chars[wrapColumnIndex] = chosen;
    }
  }
  return { widths, chars, namaMembungkus };
}
