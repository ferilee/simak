"use client";

import { useRef, type CSSProperties } from "react";
import { apiBase } from "../lib/api";
import { MathText } from "./MathContent";

// Perender blok Media Interaktif (H5P v1), dipakai bersama oleh halaman
// materi murid dan pratinjau guru agar bingkainya selalu sama.
//
// Dua sumber, dua tingkat kurungan yang berbeda secara sadar:
//  - "unggah" (HTML mandiri ekspor Lumi): JS arbitrer unggahan guru.
//    Iframe sandbox="allow-scripts" TANPA allow-same-origin, dan
//    sumbernya route API /uploads/interaktif yang membalas dengan
//    CSP sandbox pula — dokumennya ber-asal buram di dua lapis.
//  - "embed" (tautan pemain H5P/Moodle pilihan guru sendiri): pemain
//    sah membutuhkan asal sendiri, jadi sandbox="allow-scripts
//    allow-same-origin" + lazy, mengikuti konvensi blok video.
export type InteractiveBlockData = {
  content: Record<string, unknown>;
  attachment_key?: string | null;
};

const styles: Record<string, CSSProperties> = {
  figure: { margin: 0, display: "grid", gap: 8, minWidth: 0 },
  bar: { display: "flex", justifyContent: "flex-end" },
  fullscreenButton: {
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    background: "white",
    padding: "6px 12px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    color: "#175cd3",
  },
  frame: {
    width: "100%",
    aspectRatio: "16 / 10",
    minHeight: 280,
    border: 0,
    borderRadius: 10,
    background: "#f8f9fc",
    display: "block",
  },
  notice: { color: "#667085", background: "#f8f9fc", padding: 12, borderRadius: 8, margin: 0 },
};

export function InteractiveBlock({ block, moduleId }: { block: InteractiveBlockData; moduleId: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const content = block.content;
  const caption = typeof content.title === "string" ? content.title : "";
  const source = typeof content.source === "string" ? content.source : "";
  const frameTitle = caption || "Media interaktif";

  let frame: React.ReactNode = null;
  if (source === "embed") {
    const url = typeof content.url === "string" ? content.url : "";
    if (url) {
      frame = (
        <iframe
          src={url}
          title={frameTitle}
          style={styles.frame}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          allowFullScreen
        />
      );
    }
  } else if (source === "unggah") {
    const fileKey = typeof content.fileKey === "string" ? content.fileKey : block.attachment_key ?? "";
    if (fileKey) {
      frame = (
        <iframe
          src={`${apiBase}/uploads/interaktif?moduleId=${moduleId}&key=${encodeURIComponent(fileKey)}`}
          title={frameTitle}
          style={styles.frame}
          sandbox="allow-scripts"
        />
      );
    }
  }

  if (!frame) {
    return <p style={styles.notice}>Media interaktif belum tersedia.</p>;
  }

  return (
    <figure style={styles.figure}>
      <div className="interactive-frame" ref={wrapRef}>
        <div style={styles.bar}>
          <button
            type="button"
            style={styles.fullscreenButton}
            onClick={() => {
              // Layar penuh pada pembungkus bingkai; kegagalan API-nya
              // (peramban menolak) tidak mengganggu materi.
              void wrapRef.current?.requestFullscreen?.().catch(() => {});
            }}
          >
            ⛶ Layar penuh
          </button>
        </div>
        {frame}
      </div>
      {caption ? <figcaption><MathText text={caption} /></figcaption> : null}
    </figure>
  );
}
