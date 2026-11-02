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

// ---------- Konverter balik HTML -> Markdown ----------
// Dipakai editor guru untuk membuka blok teks warisan yang hanya tersimpan
// sebagai HTML di mode Markdown. Berbasis DOMParser (hanya dijalankan di
// peramban) dan hanya mengenal kosakata yang sama dengan keluaran
// markdownToHtml di atas; elemen di luar kosakata diturunkan menjadi teksnya.

function collapseInlineSpaces(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

function childrenToInline(element: Element): string {
  let result = "";
  element.childNodes.forEach((child) => {
    result += nodeToInline(child);
  });
  return result;
}

function wrapInlineMarker(marker: string, inner: string): string {
  const core = inner.trim();
  if (!core) return inner;
  const lead = /^\s/.test(inner) ? " " : "";
  const trail = /\s$/.test(inner) ? " " : "";
  return `${lead}${marker}${core}${marker}${trail}`;
}

function nodeToInline(node: ChildNode): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "strong":
    case "b":
      return wrapInlineMarker("**", childrenToInline(element));
    case "em":
    case "i":
      return wrapInlineMarker("*", childrenToInline(element));
    case "code":
      return `\`${(element.textContent ?? "").replace(/\s+/g, " ").trim()}\``;
    case "a": {
      const inner = childrenToInline(element);
      const href = element.getAttribute("href") ?? "";
      return href ? `[${inner.trim()}](${href})` : inner;
    }
    case "br":
      return "\n";
    default:
      return childrenToInline(element);
  }
}

function listToMarkdown(list: Element, ordered: boolean): string {
  const items: string[] = [];
  let position = 0;
  list.childNodes.forEach((child) => {
    if (child.nodeType !== 1) return;
    const item = child as Element;
    if (item.tagName.toLowerCase() !== "li") return;
    position += 1;
    let nested = "";
    let inlinePart = "";
    item.childNodes.forEach((part) => {
      if (part.nodeType === 1 && ["ul", "ol"].includes((part as Element).tagName.toLowerCase())) {
        nested += `\n${listToMarkdown(part as Element, (part as Element).tagName.toLowerCase() === "ol")}`;
      } else {
        inlinePart += nodeToInline(part as ChildNode);
      }
    });
    const text = collapseInlineSpaces(inlinePart);
    items.push(`${ordered ? `${position}.` : "-"} ${text}${nested}`);
  });
  return items.join("\n");
}

const BLOCK_CONTAINER_TAGS = new Set(["div", "section", "article", "main", "figure", "figcaption", "table", "thead", "tbody", "tr", "td", "th"]);

function nodeToBlocks(node: ChildNode, blocks: string[]): void {
  if (node.nodeType === 3) {
    const text = collapseInlineSpaces(node.textContent ?? "");
    if (text) blocks.push(text);
    return;
  }
  if (node.nodeType !== 1) return;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const heading = tag.match(/^h([1-4])$/);
  if (heading) {
    const text = collapseInlineSpaces(childrenToInline(element));
    if (text) blocks.push(`${"#".repeat(Number(heading[1]))} ${text}`);
    return;
  }
  switch (tag) {
    case "p": {
      const text = collapseInlineSpaces(childrenToInline(element));
      if (text) blocks.push(text);
      return;
    }
    case "ul":
      blocks.push(listToMarkdown(element, false));
      return;
    case "ol":
      blocks.push(listToMarkdown(element, true));
      return;
    case "blockquote": {
      const inner: string[] = [];
      element.childNodes.forEach((child) => nodeToBlocks(child, inner));
      const quoted = inner
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      if (quoted.trim()) blocks.push(quoted);
      return;
    }
    case "hr":
      blocks.push("---");
      return;
    default:
      if (BLOCK_CONTAINER_TAGS.has(tag)) {
        element.childNodes.forEach((child) => nodeToBlocks(child, blocks));
      } else {
        const text = collapseInlineSpaces(childrenToInline(element));
        if (text) blocks.push(text);
      }
  }
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: string[] = [];
  doc.body.childNodes.forEach((child) => nodeToBlocks(child, blocks));
  return blocks.filter((block) => block.trim() !== "").join("\n\n");
}
