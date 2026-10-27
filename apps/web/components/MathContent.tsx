"use client";

import { useEffect, useRef } from "react";

const renderOptions = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "\\(", right: "\\)", display: false },
    { left: "$", right: "$", display: false },
  ],
  ignoredClasses: ["katex"],
  throwOnError: false,
  trust: false,
  maxExpand: 1000,
  maxSize: 10,
};

export function MathText({ text, className }: { text: string; className?: string }) {
  const contentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    void import("katex/contrib/auto-render").then(({ default: renderMathInElement }) => {
      if (element.isConnected) renderMathInElement(element, renderOptions);
    });
  }, [text]);

  return <span ref={contentRef} className={className}>{text}</span>;
}

export function MathHtml({ html, className }: { html: string; className?: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const sanitizedHtml = sanitizeRichText(html);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    void import("katex/contrib/auto-render").then(({ default: renderMathInElement }) => {
      if (element.isConnected) renderMathInElement(element, renderOptions);
    });
  }, [sanitizedHtml]);

  return <div ref={contentRef} className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}

function sanitizeRichText(html: string) {
  const allowedTags = new Set(["p", "strong", "em", "br", "sub", "sup", "b", "i", "ul", "ol", "li", "blockquote"]);
  return html
    .replace(/<\/?(script|style|iframe|object|embed|form)[^>]*>/gi, "")
    .replace(/\s+on[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<([a-z0-9-]+)(?:\s[^>]*)?>/gi, (match, tag: string) => allowedTags.has(tag.toLowerCase()) ? `<${tag.toLowerCase()}>` : "")
    .replace(/<\/([a-z0-9-]+)>/gi, (match, tag: string) => allowedTags.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : "");
}
