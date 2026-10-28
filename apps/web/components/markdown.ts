// Konverter Markdown subset -> HTML untuk blok teks materi SIMAK.
// Murni tanpa dependensi: subset yang didukung kecil dan butuh kontrol penuh atas
// (1) perlindungan segmen LaTeX sebelum pemrosesan Markdown, dan
// (2) pindah baris lembut di dalam paragraf menjadi <br>.
// Hasilnya WAJIB tetap melewati sanitizeRichText di MathContent.tsx sebelum dirender;
// fungsi ini sendiri juga men-escape HTML sumber dan hanya mengeluarkan tag subset.

const MATH_OPEN = "\uE000";
const MATH_CLOSE = "\uE001";
const CODE_OPEN = "\uE002";
const CODE_CLOSE = "\uE003";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Terapkan penanda sebaris pada teks yang SUDAH di-escape (placeholder matematika
// dan kode tidak terpengaruh escape karena berupa karakter area privat Unicode).
function renderInline(text: string, codeSegments: string[]): string {
  const withCode = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSegments.push(code);
    return `${CODE_OPEN}${codeSegments.length - 1}${CODE_CLOSE}`;
  });
  let result = escapeHtml(withCode);
  result = result
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([\s\S]+?)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
      /^https?:\/\//i.test(url)
        ? `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`
        : label,
    );
  return result.replace(
    new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g"),
    (_match, index: string) => `<code>${escapeHtml(codeSegments[Number(index)] ?? "")}</code>`,
  );
}

function renderBlocks(lines: string[], codeSegments: string[]): string {
  const html: string[] = [];
  let index = 0;
  const isBlank = (line: string) => line.trim() === "";
  const headingMatch = (line: string) => line.match(/^(#{1,4})\s+(.*)$/);
  const isHr = (line: string) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  const isQuote = (line: string) => /^\s*>\s?/.test(line);
  const ulMatch = (line: string) => line.match(/^\s*[-*+]\s+(.*)$/);
  const olMatch = (line: string) => line.match(/^\s*\d+[.)]\s+(.*)$/);
  const startsBlock = (line: string) =>
    isBlank(line) || Boolean(headingMatch(line)) || isHr(line) || isQuote(line) || Boolean(ulMatch(line)) || Boolean(olMatch(line));

  while (index < lines.length) {
    const line = lines[index]!;
    if (isBlank(line)) {
      index += 1;
      continue;
    }
    const heading = headingMatch(line);
    if (heading) {
      const level = heading[1]!.length;
      html.push(`<h${level}>${renderInline(heading[2]!.trim(), codeSegments)}</h${level}>`);
      index += 1;
      continue;
    }
    if (isHr(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }
    if (isQuote(line)) {
      const inner: string[] = [];
      while (index < lines.length && isQuote(lines[index]!)) {
        inner.push(lines[index]!.replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderBlocks(inner, codeSegments)}</blockquote>`);
      continue;
    }
    if (ulMatch(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = ulMatch(lines[index]!);
        if (!item) break;
        items.push(`<li>${renderInline(item[1]!.trim(), codeSegments)}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (olMatch(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = olMatch(lines[index]!);
        if (!item) break;
        items.push(`<li>${renderInline(item[1]!.trim(), codeSegments)}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && !startsBlock(lines[index]!)) {
      paragraph.push(renderInline(lines[index]!.trim(), codeSegments));
      index += 1;
    }
    html.push(`<p>${paragraph.join("<br>")}</p>`);
  }
  return html.join("\n");
}

export function markdownToHtml(markdown: string): string {
  // 1. Lindungi segmen matematika SEBELUM apa pun: $$...$$ dan \[...\] (display,
  //    boleh multi-baris), \(...\) dan $...$ (sebaris). Delimiter dipertahankan
  //    di segmen asli dan dikembalikan utuh di akhir agar KaTeX auto-render
  //    memprosesnya pada tahap render seperti biasa.
  const mathSegments: string[] = [];
  const protectedText = markdown.replace(
    /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$/g,
    (segment) => {
      mathSegments.push(segment);
      return `${MATH_OPEN}${mathSegments.length - 1}${MATH_CLOSE}`;
    },
  );
  // 2+3. Konversi blok + sebaris di atas teks yang sudah terlindungi.
  const codeSegments: string[] = [];
  const html = renderBlocks(protectedText.split(/\r?\n/), codeSegments);
  // 4. Kembalikan segmen matematika dengan delimiter aslinya.
  return html.replace(
    new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, "g"),
    (_match, index: string) => mathSegments[Number(index)] ?? "",
  );
}
