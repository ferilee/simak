"use client";

import { useEffect, useMemo, useRef } from "react";
import katex from "katex";

import { apiRequest } from "../lib/api";
import { injectHeadingIds } from "../lib/daftar-isi";
import { markdownToHtml } from "./markdown";

// String-level KaTeX rendering.
//
// The previous implementation walked the rendered DOM with
// katex/contrib/auto-render inside a useEffect fed by a dynamic import; when
// that failed in production it failed silently and every formula on the page
// stayed raw. Rendering now happens synchronously while the component renders:
// the input is split into text/math segments (same delimiter rules auto-render
// used) and each math segment is rendered with katex.renderToString in
// isolation, so one broken formula can never affect the others.

const DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  maxExpand: 1000,
  maxSize: 10,
} as const;

// --- Delimiter splitting -------------------------------------------------
// Ported from katex/contrib/auto-render's splitAtDelimiters (the package does
// not export that helper, and its shipped source is TypeScript), keeping the
// exact semantics: brace-aware search for the closing delimiter, backslash
// escapes skipped, and an unterminated opener leaves the rest as plain text.

type SplitSegment =
  | { type: "text"; data: string }
  | { type: "math"; data: string; rawData: string; display: boolean };

function findEndOfMath(delimiter: string, text: string, startIndex: number): number {
  let index = startIndex;
  let braceLevel = 0;
  const delimLength = delimiter.length;

  while (index < text.length) {
    const character = text[index];

    if (braceLevel <= 0 && text.slice(index, index + delimLength) === delimiter) {
      return index;
    } else if (character === "\\") {
      index++;
    } else if (character === "{") {
      braceLevel++;
    } else if (character === "}") {
      braceLevel--;
    }

    index++;
  }

  return -1;
}

function escapeRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

const AMS_REGEX = /^\\begin{/;

function splitAtDelimiters(input: string): SplitSegment[] {
  let text = input;
  const data: SplitSegment[] = [];
  const regexLeft = new RegExp("(" + DELIMITERS.map((delim) => escapeRegex(delim.left)).join("|") + ")");

  while (true) {
    const index = text.search(regexLeft);
    if (index === -1) {
      break;
    }
    if (index > 0) {
      data.push({ type: "text", data: text.slice(0, index) });
      text = text.slice(index); // now text starts with a delimiter
    }
    // ... so this always succeeds:
    const delimIndex = DELIMITERS.findIndex((delim) => text.startsWith(delim.left));
    const delim = DELIMITERS[delimIndex];
    const endIndex = findEndOfMath(delim.right, text, delim.left.length);
    if (endIndex === -1) {
      break;
    }
    const rawData = text.slice(0, endIndex + delim.right.length);
    const math = AMS_REGEX.test(rawData) ? rawData : text.slice(delim.left.length, endIndex);
    data.push({ type: "math", data: math, rawData, display: delim.display });
    text = text.slice(endIndex + delim.right.length);
  }

  if (text !== "") {
    data.push({ type: "text", data: text });
  }

  return data;
}

function renderMathSegment(mathSource: string, display: boolean): string | null {
  try {
    return katex.renderToString(mathSource, { ...KATEX_OPTIONS, displayMode: display });
  } catch {
    return null;
  }
}

// --- Plain text (MathText) ------------------------------------------------
// Splitting happens on the raw text exactly like auto-render saw it in the
// DOM text node; text segments are HTML-escaped before they are joined into
// markup (the old component let React escape them), and a formula that fails
// to render falls back to its escaped raw source.

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMathInPlainText(text: string): string {
  return splitAtDelimiters(text)
    .map((segment) => {
      if (segment.type === "text") return escapeHtmlText(segment.data);
      return renderMathSegment(segment.data, segment.display) ?? escapeHtmlText(segment.rawData);
    })
    .join("");
}

// --- HTML (MathHtml / MarkdownHtml) ---------------------------------------
// The sanitized HTML is tokenized into tags and text runs; only text runs are
// scanned for math, and runs inside elements auto-render ignored (<code>,
// <pre>, <script>, <style>, <textarea>) are passed through untouched. Text
// runs are already valid HTML source, so they are emitted as-is; math sources
// have their HTML entities decoded first because the DOM parser did that for
// auto-render (a formula stored as $0 &lt; t &lt; 5$ must reach KaTeX as
// $0 < t < 5$).

const IGNORED_TAGS = new Set(["code", "pre", "script", "style", "textarea"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (match, body: string) => {
    if (body.startsWith("#x")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

function renderMathInHtmlTextRun(run: string): string {
  return splitAtDelimiters(run)
    .map((segment) => {
      if (segment.type === "text") return segment.data;
      return renderMathSegment(decodeHtmlEntities(segment.data), segment.display) ?? segment.rawData;
    })
    .join("");
}

function renderMathInHtml(html: string): string {
  const parts = html.split(/(<[^>]*>)/g);
  const openIgnored: string[] = [];

  return parts
    .map((part) => {
      if (part.startsWith("<")) {
        const closeMatch = part.match(/^<\/\s*([a-z0-9-]+)/i);
        if (closeMatch) {
          const name = closeMatch[1].toLowerCase();
          const stackIndex = openIgnored.lastIndexOf(name);
          if (stackIndex !== -1) openIgnored.splice(stackIndex, 1);
          return part;
        }
        const openMatch = part.match(/^<\s*([a-z0-9-]+)/i);
        if (openMatch) {
          const name = openMatch[1].toLowerCase();
          if (IGNORED_TAGS.has(name) && !part.endsWith("/>")) openIgnored.push(name);
        }
        return part;
      }
      if (part === "" || openIgnored.length > 0) return part;
      return renderMathInHtmlTextRun(part);
    })
    .join("");
}

// --- Gambar sisipan berkunci lampiran --------------------------------------
// Blok teks menyimpan gambar HANYA sebagai <img data-attachment-key="...">
// tanpa src (URL unduhan bertanda tangan kedaluwarsa). Saat dirender, tag
// diberi src placeholder transparan; hook di bawah menukar placeholder itu
// dengan URL segar dari /uploads/download per kunci unik — pola yang sama
// seperti blok lampiran gambar. Kegagalan tukar membiarkan placeholder +
// teks alt terlihat, bukan ikon gambar rusak.

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const ATTACHMENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/;

function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readAttribute(tagHtml: string, name: string): string {
  const match = tagHtml.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'|${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

// Bentuk satu-satunya tag <img> yang lolos sanitasi render: berkunci
// lampiran, tanpa src tersimpan (placeholder diisi di sini), alt dibersihkan.
function sanitizeKeyedImageTag(tagHtml: string): string {
  const key = readAttribute(tagHtml, "data-attachment-key");
  if (!key || key.length > 512 || !ATTACHMENT_KEY_PATTERN.test(key)) return "";
  const alt = readAttribute(tagHtml, "alt") || "Gambar materi";
  return `<img class="simak-inline-image" data-attachment-key="${key}" alt="${escapeAttributeValue(alt)}" src="${TRANSPARENT_PIXEL}">`;
}

const attachmentUrlCache = new Map<string, Promise<string>>();

function fetchAttachmentUrl(moduleId: number, key: string): Promise<string> {
  const cacheKey = `${moduleId}:${key}`;
  const cached = attachmentUrlCache.get(cacheKey);
  if (cached) return cached;
  const pending = apiRequest<{ ok: true; data: { download_url: string } }>(
    `/uploads/download?moduleId=${moduleId}&key=${encodeURIComponent(key)}`,
  ).then((response) => response.data.download_url);
  attachmentUrlCache.set(cacheKey, pending);
  // Kegagalan tidak di-cache: render berikutnya boleh mencoba lagi.
  pending.catch(() => attachmentUrlCache.delete(cacheKey));
  return pending;
}

function useResolvedInlineImages(moduleId: number | undefined, html: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !moduleId) return;
    const images = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-attachment-key]"));
    if (images.length === 0) return;
    let cancelled = false;
    const keys = [...new Set(images.map((image) => image.getAttribute("data-attachment-key")).filter((key): key is string => Boolean(key)))];
    for (const key of keys) {
      void fetchAttachmentUrl(moduleId, key)
        .then((url) => {
          if (cancelled) return;
          images
            .filter((image) => image.getAttribute("data-attachment-key") === key)
            .forEach((image) => {
              image.src = url;
            });
        })
        .catch(() => {
          // Biarkan placeholder transparan + alt: tidak ada ikon rusak.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [moduleId, html]);

  return containerRef;
}

// --- Components -------------------------------------------------------------

export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMathInPlainText(text), [text]);

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MathHtml({ html, className, moduleId, headingIdPrefix }: { html: string; className?: string; moduleId?: number; headingIdPrefix?: string }) {
  const renderedHtml = useMemo(() => {
    const sanitized = sanitizeRichText(html);
    return renderMathInHtml(headingIdPrefix ? injectHeadingIds(sanitized, headingIdPrefix) : sanitized);
  }, [html, headingIdPrefix]);
  const containerRef = useResolvedInlineImages(moduleId, renderedHtml);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}

export function MarkdownHtml({ markdown, className, moduleId, headingIdPrefix }: { markdown: string; className?: string; moduleId?: number; headingIdPrefix?: string }) {
  const renderedHtml = useMemo(() => {
    const sanitized = sanitizeRichText(markdownToHtml(markdown));
    return renderMathInHtml(headingIdPrefix ? injectHeadingIds(sanitized, headingIdPrefix) : sanitized);
  }, [markdown, headingIdPrefix]);
  const containerRef = useResolvedInlineImages(moduleId, renderedHtml);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}

export function sanitizeRichText(html: string) {
  const allowedTags = new Set(["p", "strong", "em", "br", "sub", "sup", "b", "i", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "hr", "a", "code"]);
  return html
    .replace(/<\/?(script|style|iframe|object|embed|form)[^>]*>/gi, "")
    .replace(/\s+on[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<([a-z0-9-]+)(?:\s[^>]*)?>/gi, (match, tag: string) => {
      const normalized = tag.toLowerCase();
      if (normalized === "img") return sanitizeKeyedImageTag(match);
      if (!allowedTags.has(normalized)) return "";
      if (normalized === "a") {
        const hrefMatch = match.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'|href\s*=\s*([^\s>]+)/i);
        const href = (hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
        return /^https?:\/\//i.test(href)
          ? `<a href="${href.replace(/"/g, "%22")}" target="_blank" rel="noreferrer">`
          : "<a>";
      }
      return `<${normalized}>`;
    })
    .replace(/<\/([a-z0-9-]+)>/gi, (match, tag: string) => allowedTags.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : "");
}
