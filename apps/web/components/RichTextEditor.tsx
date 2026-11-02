"use client";

import { useEffect, useRef } from "react";

// Editor teks kaya sederhana untuk blok teks materi: contentEditable +
// document.execCommand, tanpa pustaka editor. HTML yang keluar dari editor
// disanitasi ke kosakata blok teks SIMAK (keluaran markdownToHtml) sebelum
// disimpan, supaya renderer murid menerima bentuk yang sama seperti blok
// yang ditulis lewat Markdown.

const ALLOWED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "strong", "em", "code", "a",
  "ul", "ol", "li", "blockquote", "hr", "br",
]);
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "form", "link", "meta",
  "title", "noscript", "template", "svg", "img", "video", "audio", "input",
  "button", "select", "textarea",
]);
const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em" };

function appendSanitized(source: ChildNode, parent: Node, doc: Document): void {
  if (source.nodeType === 3) {
    parent.appendChild(doc.createTextNode(source.textContent ?? ""));
    return;
  }
  if (source.nodeType !== 1) return;
  const element = source as Element;
  const rawTag = element.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(rawTag)) return;
  const tag = TAG_ALIASES[rawTag] ?? rawTag;
  if (!ALLOWED_TAGS.has(tag)) {
    // Elemen di luar kosakata dibongkar: anak-anaknya dipertahankan.
    element.childNodes.forEach((child) => appendSanitized(child, parent, doc));
    return;
  }
  const clean = doc.createElement(tag);
  if (tag === "a") {
    const href = (element.getAttribute("href") ?? "").trim();
    if (/^https?:\/\//i.test(href)) clean.setAttribute("href", href);
  }
  element.childNodes.forEach((child) => appendSanitized(child, clean, doc));
  parent.appendChild(clean);
}

export function sanitizeBlockHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const container = document.createElement("div");
  parsed.body.childNodes.forEach((child) => appendSanitized(child, container, document));
  return container.innerHTML;
}

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  inputRef?: (element: HTMLElement | null) => void;
};

const toolbarButtonStyle = {
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  background: "white",
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const editorStyle = {
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  padding: 11,
  fontFamily: "inherit",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box" as const,
  minHeight: 150,
  background: "white",
  outline: "none",
  overflowY: "auto" as const,
};

export function RichTextEditor({ value, onChange, inputRef }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // HTML terakhir yang diketahui editor: mencegah penulisan ulang innerHTML
  // (yang menggerakkan kursor) saat perubahan berasal dari ketikan sendiri.
  const knownHtmlRef = useRef<string | null>(null);

  useEffect(() => {
    const element = editorRef.current;
    if (element && value !== knownHtmlRef.current) {
      element.innerHTML = value;
      knownHtmlRef.current = value;
    }
  }, [value]);

  function emitChange() {
    const element = editorRef.current;
    if (!element) return;
    knownHtmlRef.current = element.innerHTML;
    onChange(element.innerHTML);
  }

  function runCommand(command: string, argument?: string) {
    document.execCommand(command, false, argument);
    editorRef.current?.focus();
    emitChange();
  }

  const tools: Array<{ label: string; action: () => void }> = [
    { label: "Judul 2", action: () => runCommand("formatBlock", "H2") },
    { label: "Judul 3", action: () => runCommand("formatBlock", "H3") },
    { label: "Paragraf", action: () => runCommand("formatBlock", "P") },
    { label: "Tebal", action: () => runCommand("bold") },
    { label: "Miring", action: () => runCommand("italic") },
    { label: "Daftar Titik", action: () => runCommand("insertUnorderedList") },
    { label: "Daftar Nomor", action: () => runCommand("insertOrderedList") },
    { label: "Kutipan", action: () => runCommand("formatBlock", "BLOCKQUOTE") },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }} role="toolbar" aria-label="Format teks">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            style={toolbarButtonStyle}
            onMouseDown={(event) => event.preventDefault()}
            onClick={tool.action}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <div
        ref={(element) => {
          editorRef.current = element;
          inputRef?.(element);
        }}
        className="math-rich-content"
        style={editorStyle}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Isi materi"
        onInput={emitChange}
        onPaste={(event) => {
          // Tempel selalu sebagai teks polos agar HTML asing tidak masuk.
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          emitChange();
        }}
      />
    </div>
  );
}
