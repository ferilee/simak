// Pengurai teks petunjuk (penugasan & LKPD) menjadi blok-blok tampilan.
//
// Guru menulis petunjuk di kotak teks biasa, sering sebagai poin bernomor
// per baris ("1. Baca materi …", "2. Kerjakan …"). Render lama memasukkan
// seluruh teks ke satu <p>, sehingga baris baru runtuh dan nomor-nomor itu
// menyambung di tengah kalimat. Di sini teks dipecah per baris: baris-baris
// berurutan yang berawalan nomor menjadi satu daftar bernomor (nomor bawaan
// <ol>, awalan nomor pada teks dibuang), baris lain menjadi paragraf yang
// jeda barisnya dihormati, dan baris kosong memisahkan blok. Teks tersimpan
// tidak pernah diubah — ini murni soal tampilan.

export type InstructionBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[]; start: number };

// Awalan nomor poin: "1. ", "2) ", "10. ", dst. Spasi sesudah tanda wajib
// ada supaya angka desimal ("3.5 adalah …") dan tahun di awal kalimat
// tidak tertukar dengan nomor poin.
const NUMBERED_LINE_PATTERN = /^\s*(\d+)[.)]\s+(.+)$/;

export function parseInstructionBlocks(text: string | null | undefined): InstructionBlock[] {
  if (!text) return [];

  const blocks: InstructionBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listStart = 1;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: "paragraph", lines: paragraphLines });
    paragraphLines = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: listItems, start: listStart });
    listItems = [];
    listStart = 1;
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const numbered = line.match(NUMBERED_LINE_PATTERN);
    if (numbered) {
      flushParagraph();
      if (listItems.length === 0) {
        listStart = Number.parseInt(numbered[1], 10) || 1;
      }
      listItems.push(numbered[2].trim());
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
