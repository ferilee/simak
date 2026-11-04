"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiRequest } from "../lib/api";
import { MarkdownHtml, MathHtml, MathText } from "./MathContent";

// Perender blok modul untuk PRATINJAU guru (hanya-baca). Dipakai bersama
// oleh pratinjau pemilik di ruang guru dan pratinjau Perpustakaan Bersama,
// agar tampilan isi materi selalu sama persis di kedua tempat — jangan
// membuat perender kedua. Lampiran (gambar/berkas dan gambar sisipan pada
// teks) diambil lewat /uploads/download dengan id modul SUMBER: pemilik
// selalu boleh; guru lain hanya bila modulnya sedang dibagikan.
export type ModulePreviewBlockData = {
  id: number;
  sort_order: number;
  type: "teks" | "gambar" | "video" | "berkas" | "sub_bab";
  content: Record<string, unknown>;
  attachment_key: string | null;
};

const styles: Record<string, CSSProperties> = {
  previewSubheading: { fontSize: 20, margin: "12px 0 0", borderTop: "1px solid #eaecf0", paddingTop: 16 },
  previewFigure: { margin: 0, display: "grid", gap: 8 },
  previewImage: { maxWidth: "100%", borderRadius: 10 },
  previewVideo: { width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 10 },
  previewFileLink: { color: "#175cd3", fontWeight: 700 },
  previewNotice: { color: "#667085", background: "#f8f9fc", padding: 12, borderRadius: 8, margin: 0 },
};

export function ModuleBlockPreview({ block, moduleId }: { block: ModulePreviewBlockData; moduleId: number }) {
  if (block.type === "sub_bab") {
    return <h3 style={styles.previewSubheading}><MathText text={String(block.content.title ?? "Sub-bab")} /></h3>;
  }
  if (block.type === "teks") {
    if (block.content.format === "markdown" || typeof block.content.markdown === "string") {
      return <MarkdownHtml markdown={String(block.content.markdown ?? "")} className="math-rich-content" moduleId={moduleId} />;
    }
    return <MathHtml html={String(block.content.html ?? "")} className="math-rich-content" moduleId={moduleId} />;
  }
  if (block.type === "video") {
    return <PreviewVideoBlock block={block} />;
  }
  if (block.type === "gambar" || block.type === "berkas") {
    return <PreviewAttachmentBlock block={block} moduleId={moduleId} />;
  }
  return null;
}

function youtubeEmbedId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1]! : null;
}

function PreviewVideoBlock({ block }: { block: ModulePreviewBlockData }) {
  const url = typeof block.content.youtubeUrl === "string" ? block.content.youtubeUrl : "";
  const caption = typeof block.content.caption === "string" ? block.content.caption : "";
  const videoId = url ? youtubeEmbedId(url) : null;
  return (
    <figure style={styles.previewFigure}>
      {videoId ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={caption || "Video pembelajaran"}
          style={styles.previewVideo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" style={styles.previewFileLink}>Buka video →</a>
      ) : null}
      {caption ? <figcaption><MathText text={caption} /></figcaption> : null}
    </figure>
  );
}

function PreviewAttachmentBlock({ block, moduleId }: { block: ModulePreviewBlockData; moduleId: number }) {
  const contentKey = typeof block.content.attachmentKey === "string" ? block.content.attachmentKey : null;
  const key = block.attachment_key ?? contentKey;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!key) {
      setError("Lampiran tidak ditemukan.");
      return;
    }
    void apiRequest<{ ok: true; data: { download_url: string } }>(
      `/uploads/download?moduleId=${moduleId}&key=${encodeURIComponent(key)}`,
    )
      .then((response) => setUrl(response.data.download_url))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Lampiran belum dapat dibuka."));
  }, [key, moduleId]);

  if (error) return <p style={styles.previewNotice}>{error}</p>;
  if (!url) return <p style={styles.previewNotice}>Memuat lampiran...</p>;
  if (block.type === "gambar") {
    const caption = typeof block.content.caption === "string" ? block.content.caption : "";
    return (
      <figure style={styles.previewFigure}>
        <img src={url} alt={caption || "Lampiran materi"} style={styles.previewImage} />
        {caption ? <figcaption><MathText text={caption} /></figcaption> : null}
      </figure>
    );
  }
  const label = typeof block.content.label === "string" ? block.content.label : "lampiran";
  return <a href={url} target="_blank" rel="noreferrer" style={styles.previewFileLink}>Buka {label} →</a>;
}
