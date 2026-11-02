"use client";

import { useEffect, useRef, useState } from "react";

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
  "title", "noscript", "template", "svg", "video", "audio", "input",
  "button", "select", "textarea",
]);
const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em" };
const ATTACHMENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/;

function appendSanitized(source: ChildNode, parent: Node, doc: Document): void {
  if (source.nodeType === 3) {
    parent.appendChild(doc.createTextNode(source.textContent ?? ""));
    return;
  }
  if (source.nodeType !== 1) return;
  const element = source as Element;
  const rawTag = element.tagName.toLowerCase();
  if (rawTag === "img") {
    // Gambar hanya lolos bila berkunci lampiran: yang disimpan hanya
    // data-attachment-key + alt. src (URL objek sesi editor atau URL
    // bertanda tangan) tidak pernah ikut tersimpan — renderer menukarnya
    // dengan URL segar saat materi dibuka. Gambar tanpa kunci dibuang.
    const key = (element.getAttribute("data-attachment-key") ?? "").trim();
    if (key && key.length <= 512 && ATTACHMENT_KEY_PATTERN.test(key)) {
      const clean = doc.createElement("img");
      clean.setAttribute("data-attachment-key", key);
      clean.setAttribute("alt", element.getAttribute("alt") || "Gambar materi");
      parent.appendChild(clean);
    }
    return;
  }
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
  // Bila disediakan, toolbar menampilkan tombol Gambar: berkas dipilih guru,
  // diunggah pemanggil (mengembalikan kunci lampiran), lalu gambar disisipkan
  // di posisi kursor. Tanpa prop ini tombol disembunyikan.
  onInsertImage?: (file: File) => Promise<string>;
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

export function RichTextEditor({ value, onChange, inputRef, onInsertImage }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // HTML terakhir yang diketahui editor: mencegah penulisan ulang innerHTML
  // (yang menggerakkan kursor) saat perubahan berasal dari ketikan sendiri.
  const knownHtmlRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  // Seleksi terakhir di dalam editor, disimpan sebelum dialog berkas dibuka
  // (dialog memindahkan fokus dan bisa menghilangkan seleksi).
  const savedRangeRef = useRef<Range | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

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

  function rememberSelection() {
    const element = editorRef.current;
    const selection = window.getSelection();
    if (element && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  }

  async function handleImageFile(file: File) {
    if (!onInsertImage) return;
    setImageUploading(true);
    try {
      const key = await onInsertImage(file);
      const element = editorRef.current;
      if (!element) return;
      element.focus();
      const selection = window.getSelection();
      const savedRange = savedRangeRef.current;
      if (selection && savedRange && element.contains(savedRange.commonAncestorContainer)) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
      // src URL objek hanya untuk tampilan selama sesi menyunting; saat
      // disimpan, sanitizeBlockHtml membuang src dan menyisakan kuncinya.
      const objectUrl = URL.createObjectURL(file);
      document.execCommand(
        "insertHTML",
        false,
        `<img data-attachment-key="${key}" src="${objectUrl}" alt="Gambar materi">`,
      );
      emitChange();
    } catch {
      // Kegagalan unggah dilaporkan pemanggil (pesan formulir); editor
      // dibiarkan apa adanya agar guru bisa mencoba lagi.
    } finally {
      setImageUploading(false);
    }
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
        {onInsertImage ? (
          <>
            <button
              type="button"
              style={toolbarButtonStyle}
              disabled={imageUploading}
              onMouseDown={(event) => {
                event.preventDefault();
                rememberSelection();
              }}
              onClick={() => imageInputRef.current?.click()}
            >
              {imageUploading ? "Mengunggah…" : "Gambar"}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleImageFile(file);
              }}
            />
          </>
        ) : null}
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
