// Tests for module covers + inline images in text blocks (v1.0.20).
// Run with bun from apps/web:  bun components/inline-images.test.mjs
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MathHtml, sanitizeRichText } from "./MathContent.tsx";
import { sanitizeBlockHtml } from "./RichTextEditor.tsx";
import { createModuleSchema, updateModuleSchema } from "../../../packages/shared/src/schemas.ts";

// sanitizeBlockHtml (editor serializer) needs DOMParser + document; jsdom
// provides them. Try the package name first, then the workspace harness.
let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  try {
    ({ JSDOM } = await import("/tmp/roundtrip-test/node_modules/jsdom/lib/api.js"));
  } catch {
    JSDOM = null;
  }
}
if (JSDOM) {
  const dom = new JSDOM("<!DOCTYPE html><body></body>");
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.document = dom.window.document;
}

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

const KEY = "materi/7/42/9f2c1d4e-1111-4222-8333-444455556666.png";

// Case A: render sanitizer (sanitizeRichText in MathContent).
console.log("Case A: sanitizeRichText — gambar berkunci");
const caseA1 = sanitizeRichText(
  `<p>Diagram:</p><img data-attachment-key="${KEY}" src="https://evil.example/x.png" alt="Diagram alur" onerror="alert(1)"><script>alert(2)</script>`,
);
check("img berkunci dipertahankan", caseA1.includes(`data-attachment-key="${KEY}"`), caseA1);
check("alt dipertahankan", caseA1.includes('alt="Diagram alur"'));
check("src eksternal dibuang", !caseA1.includes("evil.example"));
check("atribut onerror dibuang", !caseA1.includes("onerror"));
check("tag script dibuang", !caseA1.includes("<script"));

const caseA2 = sanitizeRichText(`<p>a</p><img src="https://example.com/a.png" alt="x"><img alt="tanpa kunci">`);
check("img tanpa kunci dibuang semua", !caseA2.includes("<img"), caseA2);

// Case B: editor save serializer (sanitizeBlockHtml in RichTextEditor).
console.log("Case B: sanitizeBlockHtml — serializer editor");
if (!JSDOM) {
  check("jsdom tersedia untuk tes serializer", false, "jsdom tidak ditemukan");
} else {
  const caseB = sanitizeBlockHtml(
    `<p>Lihat diagram <img data-attachment-key="${KEY}" src="blob:http://localhost/abc" alt="Diagram alur"> berikut ini.</p><img src="https://evil.example/x.png">`,
  );
  check("tepat 1 img tersisa", countOccurrences(caseB, "<img") === 1, caseB);
  check("kunci lampiran dipertahankan", caseB.includes(`data-attachment-key="${KEY}"`), caseB);
  check("alt dipertahankan", caseB.includes('alt="Diagram alur"'));
  check("src sesi (blob:) dibuang", !caseB.includes("blob:"));
  check("img eksternal tanpa kunci dibuang", !caseB.includes("evil.example"));
}

// Case C: formula + inline image in one HTML string through MathHtml.
console.log("Case C: rumus + gambar sisipan dalam satu blok");
const caseC = renderToStaticMarkup(
  React.createElement(MathHtml, {
    html: `<p>Rumus $B = M_0 \\times i \\times t$ dan gambar <img data-attachment-key="${KEY}" alt="Grafik bunga"> selesai.</p>`,
    moduleId: 42,
  }),
);
check("rumus ter-render", caseC.includes('class="katex"'), caseC.slice(0, 200));
check("tidak ada sisa $ di teks", !textContent(caseC).includes("$"));
check("img berkunci utuh dengan kuncinya", caseC.includes(`data-attachment-key="${KEY}"`), caseC.slice(0, 300));
check("img memakai placeholder (bukan src tersimpan)", caseC.includes("simak-inline-image") && caseC.includes("data:image/gif;base64,"));

// Case D: shared module schemas accept coverKey (string and null).
console.log("Case D: skema modul — coverKey");
check(
  "createModuleSchema menerima coverKey string",
  createModuleSchema.safeParse({ title: "Modul", subject: "Matematika", coverKey: KEY }).success,
);
check(
  "updateModuleSchema menerima coverKey null (hapus sampul)",
  updateModuleSchema.safeParse({ coverKey: null }).success,
);
check(
  "coverKey tetap opsional",
  createModuleSchema.safeParse({ title: "Modul", subject: "Matematika" }).success,
);
check(
  "coverKey non-string ditolak",
  !updateModuleSchema.safeParse({ coverKey: 123 }).success,
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
