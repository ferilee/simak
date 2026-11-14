// Perencana daftar isi materi (halaman modul murid) + penyuntik jangkar.
//
// Sumber entri, mengikuti persis cara halaman merender blok:
//  - blok sub_bab            → satu entri, jangkar pada <h2>-nya sendiri;
//  - blok teks Markdown      → heading #, ##, ### di dalam teksnya
//    (aturan baris yang sama dengan perender markdown.ts: ^#{1,4}\s+;
//    #### sengaja tidak masuk daftar isi — terlalu rinci);
//  - blok teks HTML (editor) → tag <h1>–<h3> di HTML tersimpan.
// Blok tanpa heading tidak menyumbang entri (isinya menempel pada
// heading sebelumnya — semantik daftar isi yang lazim).
//
// Jangkar: sub_bab = "isi-b<id blok>"; heading ke-n di dalam blok =
// "isi-b<id blok>-<n>". Halaman menyuntikkan id yang sama ke tag
// heading hasil render lewat injectHeadingIds (sesudah sanitasi,
// sebelum perenderan KaTeX) — perencana dan penyuntik berbagi aturan
// urutan yang sama di berkas ini, dan paritasnya dikunci oleh uji.

export type TocBlockInput = {
  id: number;
  type: "teks" | "gambar" | "video" | "berkas" | "sub_bab" | "interaktif";
  content: Record<string, unknown>;
};

export type TocEntry = {
  /** Id elemen tujuan gulir. */
  anchor: string;
  label: string;
  /** 1 = sejajar sub-bab/judul utama, 2 = anak judul (###). */
  depth: 1 | 2;
};

export function tocAnchorForBlock(blockId: number): string {
  return `isi-b${blockId}`;
}

/** Awalan id untuk semua heading di dalam satu blok teks. */
export function tocHeadingPrefix(blockId: number): string {
  return `isi-b${blockId}-`;
}

export function tocAnchorForHeading(blockId: number, index: number): string {
  return `${tocHeadingPrefix(blockId)}${index}`;
}

const MARKDOWN_HEADING = /^(#{1,4})\s+(.*)$/;

/** Label bersih untuk daftar isi: penanda inline Markdown dilepas. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$([^$]+)\$\$/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .trim();
}

export type ExtractedHeading = { level: number; label: string };

/** Heading Markdown satu blok teks, dengan aturan baris perender. */
export function extractMarkdownHeadings(markdown: string): ExtractedHeading[] {
  const headings: ExtractedHeading[] = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(MARKDOWN_HEADING);
    if (!match) continue;
    const level = match[1]!.length;
    if (level > 3) continue;
    const label = stripInlineMarkdown(match[2]!);
    if (label) headings.push({ level, label });
  }
  return headings;
}

const HTML_HEADING = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Heading pada HTML tersimpan (blok teks format editor kaya). */
export function extractHtmlHeadings(html: string): ExtractedHeading[] {
  const headings: ExtractedHeading[] = [];
  for (const match of html.matchAll(HTML_HEADING)) {
    const label = match[2]!
      .replace(/<[^>]*>/g, "")
      .replace(/&(#\d+|amp|lt|gt|quot|apos|nbsp);/g, (whole, body: string) =>
        body.startsWith("#") ? String.fromCodePoint(Number.parseInt(body.slice(1), 10)) : (HTML_ENTITIES[body] ?? whole),
      )
      .trim();
    if (label) headings.push({ level: Number(match[1]), label });
  }
  return headings;
}

function headingsOfBlock(block: TocBlockInput): ExtractedHeading[] {
  if (typeof block.content.markdown === "string" || block.content.format === "markdown") {
    return extractMarkdownHeadings(String(block.content.markdown ?? ""));
  }
  if (typeof block.content.html === "string") return extractHtmlHeadings(block.content.html);
  return [];
}

/** Daftar isi satu modul dari blok-bloknya (urutan tampil). */
export function planTableOfContents(blocks: readonly TocBlockInput[]): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const block of blocks) {
    if (block.type === "sub_bab") {
      const label = String(block.content.title ?? "Sub-bab").trim();
      if (label) entries.push({ anchor: tocAnchorForBlock(block.id), label, depth: 1 });
      continue;
    }
    if (block.type !== "teks") continue;
    headingsOfBlock(block).forEach((heading, index) => {
      entries.push({
        anchor: tocAnchorForHeading(block.id, index + 1),
        label: heading.label,
        depth: heading.level >= 3 ? 2 : 1,
      });
    });
  }
  return entries;
}

/**
 * Sisipkan id jangkar ke tag <h1>–<h3> polos pada HTML yang SUDAH
 * disanitasi (sanitasi membuang semua atribut, jadi penyisipan harus
 * sesudahnya): kemunculan ke-n mendapat id `${prefix}${n}`, sejalan
 * dengan penomoran perencana. Tag yang sudah ber-id dibiarkan.
 */
export function injectHeadingIds(html: string, prefix: string): string {
  let counter = 0;
  return html.replace(/<h([1-3])>/g, (_match, level: string) => {
    counter++;
    return `<h${level} id="${prefix}${counter}">`;
  });
}
