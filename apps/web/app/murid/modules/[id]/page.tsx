"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../../lib/api";
import { Toast } from "../../../../components/Toast";
import { MathHtml, MathText } from "../../../../components/MathContent";

type Block = {
  id: number;
  sort_order: number;
  type: "teks" | "gambar" | "video" | "berkas" | "sub_bab";
  content: Record<string, unknown>;
  attachment_key: string | null;
};

type ModuleResponse = {
  ok: true;
  data: {
    module: { id: number; title: string; subject: string; description: string | null };
    blocks: Block[];
    worksheets: { id: number; title: string; instructions: string | null }[];
  };
};

export default function ModulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ModuleResponse["data"] | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void apiRequest<ModuleResponse>(`/murid/modules/${params.id}`)
      .then((response) => setData(response.data))
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "Belum masuk.") {
          router.replace("/login");
          return;
        }
        setMessage(error instanceof Error ? error.message : "Materi belum dapat dimuat.");
      });
  }, [params.id, router]);

  if (message) return <main style={styles.container}><Toast message={message} onDismiss={() => setMessage("")} /><Link href="/murid">← Kembali ke ruang murid</Link></main>;
  if (!data) return <main style={styles.container}><p>Memuat materi...</p></main>;

  return (
    <main style={styles.container}>
      <Link href="/murid" style={styles.back}>← Ruang murid</Link>
      <p style={styles.subject}>{data.module.subject}</p>
      <h1 style={styles.title}>{data.module.title}</h1>
      {data.module.description ? <p style={styles.description}><MathText text={data.module.description} /></p> : null}
      <article style={styles.content}>
        {data.blocks.map((block) => <ModuleBlock key={block.id} block={block} moduleId={data.module.id} />)}
      </article>
      {data.worksheets.length > 0 ? (
        <section style={styles.worksheetSection}>
          <h2 style={styles.subheading}>LKPD</h2>
          {data.worksheets.map((worksheet) => (
            <Link key={worksheet.id} href={`/murid/worksheets/${worksheet.id}`} style={styles.worksheetLink}>
              <strong>{worksheet.title}</strong>
              <span>{worksheet.instructions ?? "Buka dan kerjakan LKPD ini."}</span>
              <span style={styles.fileLink}>Kerjakan LKPD →</span>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function ModuleBlock({ block, moduleId }: { block: Block; moduleId: number }) {
  if (block.type === "sub_bab") {
    return <h2 style={styles.subheading}>{String(block.content.title ?? "Sub-bab")}</h2>;
  }
  if (block.type === "teks") {
    return <MathHtml html={String(block.content.html ?? "")} className="math-rich-content" />;
  }
  if (block.type === "video") {
    return <VideoBlock block={block} />;
  }
  if (block.type === "gambar" || block.type === "berkas") {
    return <AttachmentBlock block={block} moduleId={moduleId} />;
  }
  return null;
}

function youtubeEmbedId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1]! : null;
}

function VideoBlock({ block }: { block: Block }) {
  const url = typeof block.content.youtubeUrl === "string" ? block.content.youtubeUrl
    : typeof block.content.url === "string" ? block.content.url : "";
  const caption = typeof block.content.caption === "string" ? block.content.caption : "";
  const videoId = url ? youtubeEmbedId(url) : null;
  if (videoId) {
    return (
      <figure style={styles.figure}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={caption || "Video pembelajaran"}
          style={styles.video}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }
  if (url) {
    return (
      <p style={styles.notice}>
        <a href={url} target="_blank" rel="noreferrer" style={styles.fileLink}>Buka video di YouTube</a>
        {caption ? <> · {caption}</> : null}
      </p>
    );
  }
  return <p style={styles.notice}>Video tersedia melalui tautan pembelajaran.</p>;
}

function AttachmentBlock({ block, moduleId }: { block: Block; moduleId: number }) {
  const contentKey = typeof block.content.attachmentKey === "string" ? block.content.attachmentKey : null;
  const key = block.attachment_key ?? contentKey;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!key) return;
    void apiRequest<{ ok: true; data: { download_url: string } }>(
      `/uploads/download?moduleId=${moduleId}&key=${encodeURIComponent(key)}`,
    )
      .then((response) => setUrl(response.data.download_url))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Lampiran belum dapat dibuka."));
  }, [key, moduleId]);

  if (error) return <p style={styles.notice}>{error}</p>;
  if (!url) return <p style={styles.notice}>Memuat lampiran...</p>;
  if (block.type === "gambar") {
    return (
      <figure style={styles.figure}>
        <img src={url} alt={String(block.content.caption ?? "Lampiran materi")} style={styles.image} />
        {block.content.caption ? <figcaption>{String(block.content.caption)}</figcaption> : null}
      </figure>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer" style={styles.fileLink}>Buka {String(block.content.label ?? "lampiran")} →</a>;
}

const styles = {
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none" },
  subject: { color: "#175cd3", fontWeight: 700, margin: "32px 0 8px" },
  title: { fontSize: 34, margin: 0 },
  description: { color: "#667085", lineHeight: 1.6 },
  content: { marginTop: 32, display: "grid", gap: 12, lineHeight: 1.7 },
  subheading: { fontSize: 24, margin: "24px 0 0", borderTop: "1px solid #eaecf0", paddingTop: 20 },
  textBlock: { color: "#344054" },
  notice: { color: "#667085", background: "#f8f9fc", padding: 12, borderRadius: 8 },
  figure: { margin: 0, display: "grid", gap: 8 },
  video: { width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 10 },
  image: { maxWidth: "100%", borderRadius: 10 },
  fileLink: { color: "#175cd3", fontWeight: 700 },
  worksheetSection: { marginTop: 32, display: "grid", gap: 12 },
  worksheetLink: { display: "grid", gap: 6, border: "1px solid #d0d5dd", borderRadius: 10, padding: 16, textDecoration: "none", color: "inherit" },
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
};
