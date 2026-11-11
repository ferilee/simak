// Tests for daftar isi materi (lib/daftar-isi.ts + wiring halaman modul
// murid dan komponen MathContent).
// Run with bun from apps/web:  bun lib/daftar-isi.test.mjs
//
// Yang dikunci di sini:
//  - Perencana membaca sub_bab, heading Markdown (#/##/### — aturan
//    baris perender yang sama), dan heading HTML tersimpan; blok tanpa
//    heading tidak menyumbang entri; #### tidak masuk daftar isi.
//  - Paritas perencana ↔ penyuntik: id yang benar-benar tersisip pada
//    HTML hasil render (markdownToHtml → sanitizeRichText →
//    injectHeadingIds) persis sama dengan jangkar yang direncanakan.
//  - Wiring: halaman modul murid merender panel daftar isi (≥2 entri),
//    meneruskan awalan jangkar ke perender blok, dan sub_bab membawa
//    id jangkarnya sendiri.
import { readFileSync } from "node:fs";
import {
  extractHtmlHeadings,
  extractMarkdownHeadings,
  injectHeadingIds,
  planTableOfContents,
  stripInlineMarkdown,
  tocAnchorForBlock,
  tocHeadingPrefix,
} from "./daftar-isi.ts";
import { markdownToHtml } from "../components/markdown.ts";
import { sanitizeRichText } from "../components/MathContent.tsx";

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

// --- Perencana ----------------------------------------------------------------
const blocks = [
  { id: 11, type: "teks", content: { format: "markdown", markdown: "## Blok 1 — Temukan Polanya\n\nIsi pembuka.\n\n### Langkah Awal\n\nRincian.\n\n#### Terlalu rinci\n\nTetap isi." } },
  { id: 12, type: "gambar", content: { caption: "Ilustrasi" } },
  { id: 13, type: "sub_bab", content: { title: "Bagian Kedua" } },
  { id: 14, type: "teks", content: { format: "markdown", markdown: "Teks tanpa heading sama sekali." } },
  { id: 15, type: "teks", content: { html: "<p>Pembuka.</p><h2>Judul Editor</h2><p>Isi.</p><h3>Anak Judul</h3>" } },
];
const entries = planTableOfContents(blocks);
check(
  "entri tersusun dari campuran sub_bab + Markdown + HTML, urutan tampil",
  JSON.stringify(entries.map((e) => [e.anchor, e.label, e.depth])) === JSON.stringify([
    ["isi-b11-1", "Blok 1 — Temukan Polanya", 1],
    ["isi-b11-2", "Langkah Awal", 2],
    ["isi-b13", "Bagian Kedua", 1],
    ["isi-b15-1", "Judul Editor", 1],
    ["isi-b15-2", "Anak Judul", 2],
  ]),
  JSON.stringify(entries),
);
check("blok gambar & blok teks tanpa heading tidak menyumbang entri", entries.every((e) => !e.anchor.startsWith("isi-b12") && !e.anchor.startsWith("isi-b14")));
check("heading #### tidak masuk daftar isi", entries.every((e) => e.label !== "Terlalu rinci"));

check(
  "label dibersihkan dari penanda inline",
  stripInlineMarkdown("Menghitung **Bunga** dengan $M = P(1+i)$ dan `kode`") === "Menghitung Bunga dengan M = P(1+i) dan kode",
);
check(
  "ekstraksi Markdown mengikuti aturan baris perender (kutip & daftar bukan heading)",
  JSON.stringify(extractMarkdownHeadings("> ## Bukan heading\n- ## Bukan juga\n## Asli")) === JSON.stringify([{ level: 2, label: "Asli" }]),
);
check(
  "ekstraksi HTML melepas tag anak & entitas",
  JSON.stringify(extractHtmlHeadings("<h2>Suku &amp; <em>Pola</em></h2>")) === JSON.stringify([{ level: 2, label: "Suku & Pola" }]),
);

// --- Paritas perencana ↔ penyuntik pada jalur render nyata ----------------------
for (const block of blocks.filter((b) => b.type === "teks")) {
  const planned = entries.filter((e) => e.anchor.startsWith(tocHeadingPrefix(block.id))).map((e) => e.anchor);
  const source = typeof block.content.markdown === "string" ? markdownToHtml(block.content.markdown) : block.content.html;
  const rendered = injectHeadingIds(sanitizeRichText(source), tocHeadingPrefix(block.id));
  const injected = [...rendered.matchAll(/<h[1-3] id="([^"]+)"/g)].map((m) => m[1]);
  check(`paritas jangkar blok ${block.id}`, JSON.stringify(injected) === JSON.stringify(planned), `${JSON.stringify(injected)} vs ${JSON.stringify(planned)}`);
}
check(
  "penyuntik melewati h4 dan tag yang sudah ber-id",
  injectHeadingIds('<h4>kecil</h4><h2 id="tetap">Ada</h2><h2>Baru</h2>', "isi-b9-") === '<h4>kecil</h4><h2 id="tetap">Ada</h2><h2 id="isi-b9-1">Baru</h2>',
);

// --- Wiring ---------------------------------------------------------------------
const page = readFileSync(new URL("../app/murid/modules/[id]/page.tsx", import.meta.url), "utf8");
check("halaman modul memakai perencana daftar isi", page.includes("planTableOfContents(data.blocks)"));
check("panel hanya tampil bila entri ≥ 2", page.includes("tocEntries.length >= 2"));
check("klik entri menggulir ke jangkar", page.includes("scrollIntoView"));
check("sub_bab membawa id jangkarnya", page.includes("id={tocAnchorForBlock(block.id)}"));
check("blok teks meneruskan awalan jangkar", (page.match(/headingIdPrefix={tocHeadingPrefix\(block\.id\)}/g) ?? []).length === 2);
const mathContent = readFileSync(new URL("../components/MathContent.tsx", import.meta.url), "utf8");
check("MathHtml & MarkdownHtml menerima headingIdPrefix", (mathContent.match(/headingIdPrefix/g) ?? []).length >= 4);
check("penyuntikan terjadi sesudah sanitasi", mathContent.includes("injectHeadingIds(sanitized, headingIdPrefix)"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
