// String-level tests for the KaTeX renderer in MathContent.tsx.
// Run with bun from apps/web:  bun components/math-render.test.mjs
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownHtml, MathHtml, MathText } from "./MathContent.tsx";

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

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function textContent(html) {
  return html.replace(/<[^>]*>/g, "");
}

// Case 1: real E.2 module content (Markdown -> HTML -> sanitize -> render).
console.log("Case 1: blok-2.md (materi E.2 Bunga tunggal)");
const blok2 = readFileSync(
  "/home/hatch/workspace/goals/simak-materials-and-interactive-worksheets/files/materi-matematika-keuangan-xi/blok-materi/blok-2.md",
  "utf8",
);
const case1 = renderToStaticMarkup(React.createElement(MarkdownHtml, { markdown: blok2 }));
const case1Katex = countOccurrences(case1, 'class="katex"');
check(`minimal 18 rumus ter-render (ketemu ${case1Katex})`, case1Katex >= 18);
check("tidak ada sisa $ di teks", !textContent(case1).includes("$"), textContent(case1).match(/.{0,20}\$.{0,20}/)?.[0] ?? "");
check("ada rumus display (katex-display)", case1.includes("katex-display"));

// Case 2: math inside <code> stays literal, math in <p> renders.
console.log("Case 2: <code> dilewati, <p> dirender");
const case2 = renderToStaticMarkup(
  React.createElement(MathHtml, { html: "<p>Rumus $x^2$ dan kode <code>$x^2$</code> selesai.</p>" }),
);
check(`tepat 1 rumus ter-render (ketemu ${countOccurrences(case2, 'class="katex"')})`, countOccurrences(case2, 'class="katex"') === 1);
check("isi <code> tetap literal $x^2$", case2.includes("<code>$x^2$</code>"));

// Case 3: broken formulas never throw and never break their neighbours.
console.log("Case 3: rumus rusak terisolasi");
let case3a = "";
let threw3a = false;
try {
  case3a = renderToStaticMarkup(React.createElement(MathHtml, { html: "<p>$\\frac{1}$ lalu $x^2$</p>" }));
} catch {
  threw3a = true;
}
check("argumen \\frac kurang: tidak throw", !threw3a);
check("rumus valid sesudahnya tetap ter-render", !threw3a && case3a.includes('class="katex"') && !case3a.includes("$x^2$"));

let case3b = "";
let threw3b = false;
try {
  case3b = renderToStaticMarkup(React.createElement(MathHtml, { html: "<p>$\\unknowncmd{}$ sesudah $y^2$</p>" }));
} catch {
  threw3b = true;
}
check("perintah tak dikenal: tidak throw", !threw3b);
check("rumus valid sesudahnya tetap ter-render", !threw3b && case3b.includes('class="katex"') && !case3b.includes("$y^2$"));

let case3c = "";
let threw3c = false;
try {
  case3c = renderToStaticMarkup(React.createElement(MathHtml, { html: "<p>$\\frac{1 belum selesai</p>" }));
} catch {
  threw3c = true;
}
check("delimiter tak tertutup: tidak throw", !threw3c);
check("delimiter tak tertutup: teks tetap literal", !threw3c && case3c.includes("$\\frac{1 belum selesai") && !case3c.includes('class="katex"'));

// Case 4: MathText escapes HTML before injecting markup.
console.log("Case 4: MathText meng-escape HTML");
const case4 = renderToStaticMarkup(React.createElement(MathText, { text: "a < b dan $x^2$" }));
check("teks < tampil sebagai &lt;", case4.includes("a &lt; b dan"));
check("rumus ter-render", case4.includes('class="katex"') && !case4.includes("$x^2$"));

// Case 5: display $$ inside a blockquote <p> (the "Rumus" box shape).
console.log("Case 5: rumus display di blockquote");
const case5 = renderToStaticMarkup(
  React.createElement(MathHtml, {
    html: "<blockquote><p><strong>Rumus bunga tunggal</strong><br>$$B = M_0 \\times i \\times t$$</p></blockquote>",
  }),
);
check("ter-render dengan katex-display", case5.includes("katex-display") && case5.includes('class="katex"'));
check("tidak ada sisa $$ di teks", !textContent(case5).includes("$"));

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
