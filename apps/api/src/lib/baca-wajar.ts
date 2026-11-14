// Gerbang keplausiban ketuntasan membaca materi (Deteksi Baca Terlalu
// Cepat): catatan "baca_materi_tuntas" hanya dibuat bila waktu membaca
// AKTIF murid masuk akal untuk panjang materi. Ini gerbang lembut —
// bukan tuduhan: di bawah ambang, ketuntasan belum dicatat dan murid
// diminta melanjutkan membaca; tidak ada batas maksimum, membaca
// lambat tidak pernah dihukum.
//
// Ambang sengaja LONGgar dan hitungan kata sengaja KONSERVATIF (arah
// aman = hitungan lebih rendah → ambang lebih rendah → lebih sedikit
// murid sungguhan yang tertahan): laju tertinggi yang masih dianggap
// wajar 300 kata per menit (di atas laju paham remaja 150–200 kpm;
// skimming 400+ kpm bukan membaca), dengan lantai mutlak 30 detik
// untuk materi pendek. Bukti paham yang sesungguhnya tetap pertanyaan
// Cek Baca tertanam — gerbang ini hanya menaikkan biaya mengarang
// ketuntasan dengan menggulir lurus ke bawah.

/** Laju baca tertinggi (kata per menit) yang masih dianggap wajar. */
export const MAX_PLAUSIBLE_WPM = 300;

/** Lantai mutlak waktu membaca minimum, dalam detik. */
export const MIN_FLOOR_SECONDS = 30;

export type MaterialBlockLike = {
  type: string;
  content?: Record<string, unknown> | null;
};

// Token dihitung sebagai kata hanya bila memuat huruf atau angka —
// sisa penanda tabel Markdown ("|", "---"), garis pemisah, dan simbol
// lepas bukan kata dan tidak boleh menaikkan ambang.
const WORD_CHAR = /[\p{L}\p{N}]/u;

function countWordsInText(raw: string): number {
  let text = raw;
  // Tautan Markdown: ambil teks tampilnya; gambar Markdown: dibuang
  // seluruhnya (media, bukan prosa yang dibaca).
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Tag HTML (blok teks kaya disimpan sebagai HTML) dan entitasnya.
  text = text.replace(/<[^>]*>/g, " ");
  text = text.replace(/&[a-zA-Z#0-9]+;/g, " ");
  // Sintaks Markdown yang bukan kata: heading, penekanan, kutip blok,
  // penanda daftar, pagar blok kode, dan garis pemisah. Isi LaTeX
  // ($...$ / $$...$$) SENGAJA dibiarkan apa adanya — rumus adalah isi
  // belajar dan tokennya terhitung sebagai kata.
  text = text.replace(/^[ \t]*#{1,6}[ \t]+/gm, " ");
  text = text.replace(/^[ \t]*>[ \t]?/gm, " ");
  text = text.replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+/gm, " ");
  text = text.replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, " ");
  // Penanda penekanan/kode dihapus TANPA spasi pengganti: menghapus
  // tidak boleh memecah token ("$U_n$" tetap satu token kata).
  text = text.replace(/```[a-zA-Z0-9]*|`|\*\*|__|[*_~]/g, "");
  let words = 0;
  for (const token of text.split(/\s+/)) {
    if (token && WORD_CHAR.test(token)) words++;
  }
  return words;
}

function stringField(content: Record<string, unknown> | null | undefined, key: string): string {
  const value = content?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Hitung kata materi dari blok-blok modulnya (bentuk nyata
 * module_blocks: kolom type + content_json terstruktur per jenis).
 * Konservatif per jenis:
 *  - teks: dari sumber yang sama dengan yang dirender ke murid —
 *    Markdown mentah bila tersimpan, selain itu HTML dengan tag dibuang.
 *  - sub_bab: judulnya saja (skema blok ini memang hanya title).
 *  - gambar/video: keterangan (caption) pendeknya — teks yang memang
 *    dibaca murid; medianya sendiri 0 kata.
 *  - interaktif: hanya keterangannya (field title) — isi HTML/URL
 *    medianya bukan prosa yang dibaca dan tidak dihitung sama sekali.
 *  - berkas: 0 — label adalah label tombol unduh, bukan prosa.
 * Blok tak dikenal atau konten rusak menyumbang 0 dan tidak pernah
 * melempar: penghitungan yang gagal tidak boleh menggagalkan membaca.
 */
export function countMaterialWords(blocks: readonly MaterialBlockLike[]): number {
  let total = 0;
  for (const block of blocks) {
    const content = block?.content ?? null;
    switch (block?.type) {
      case "teks": {
        const markdown = stringField(content, "markdown");
        total += countWordsInText(markdown !== "" ? markdown : stringField(content, "html"));
        break;
      }
      case "sub_bab":
        total += countWordsInText(stringField(content, "title"));
        break;
      case "gambar":
      case "video":
        total += countWordsInText(stringField(content, "caption"));
        break;
      case "interaktif":
        total += countWordsInText(stringField(content, "title"));
        break;
      default:
        break;
    }
  }
  return total;
}

/**
 * Waktu membaca minimum (detik) untuk sejumlah kata:
 * kata ÷ 300 kpm (= 5 kata/detik), dibulatkan ke atas, dengan lantai
 * MIN_FLOOR_SECONDS.
 */
export function minReadingSeconds(wordCount: number): number {
  const safeWords = Number.isFinite(wordCount) ? Math.max(0, Math.floor(wordCount)) : 0;
  return Math.max(MIN_FLOOR_SECONDS, Math.ceil(safeWords / (MAX_PLAUSIBLE_WPM / 60)));
}

export type CompletionPlan = {
  completed: boolean;
  minSeconds: number;
  remainingSeconds: number;
};

/**
 * Keputusan gerbang: tuntas hanya bila waktu aktif mencapai ambang.
 * activeSeconds tidak valid/di bawah nol diperlakukan sebagai 0 —
 * laporan klien yang absen tidak pernah menguntungkan murid.
 */
export function planCompletion(input: { wordCount: number; activeSeconds: number }): CompletionPlan {
  const minSeconds = minReadingSeconds(input.wordCount);
  const active = Number.isFinite(input.activeSeconds) ? Math.max(0, Math.floor(input.activeSeconds)) : 0;
  return {
    completed: active >= minSeconds,
    minSeconds,
    remainingSeconds: Math.max(0, minSeconds - active),
  };
}
