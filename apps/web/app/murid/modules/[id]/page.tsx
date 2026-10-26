"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../../lib/api";

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

  if (message) return <main style={styles.container}><p role="alert" style={styles.error}>{message}</p><Link href="/murid">← Kembali ke ruang murid</Link></main>;
  if (!data) return <main style={styles.container}><p>Memuat materi...</p></main>;

  return (
    <main style={styles.container}>
      <Link href="/murid" style={styles.back}>← Ruang murid</Link>
      <p style={styles.subject}>{data.module.subject}</p>
      <h1 style={styles.title}>{data.module.title}</h1>
      {data.module.description ? <p style={styles.description}>{data.module.description}</p> : null}
      <article style={styles.content}>
        {data.blocks.map((block) => <ModuleBlock key={block.id} block={block} />)}
      </article>
    </main>
  );
}

function ModuleBlock({ block }: { block: Block }) {
  if (block.type === "sub_bab") {
    return <h2 style={styles.subheading}>{String(block.content.title ?? "Sub-bab")}</h2>;
  }
  if (block.type === "teks") {
    return <div style={styles.textBlock}>{renderSafeHtml(String(block.content.html ?? ""))}</div>;
  }
  if (block.type === "video") {
    return <p style={styles.notice}>Video tersedia melalui tautan pembelajaran.</p>;
  }
  if (block.type === "gambar" || block.type === "berkas") {
    return <p style={styles.notice}>Lampiran akan tersedia setelah penyimpanan berkas Tahap 1 selesai.</p>;
  }
  return null;
}

function renderSafeHtml(html: string) {
  const allowedTags = new Set(["p", "strong", "em", "br", "sub", "sup", "b", "i"]);
  const sanitized = html
    .replace(/<\/?(script|style|iframe|object|embed|form)[^>]*>/gi, "")
    .replace(/\s+on[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<([a-z0-9-]+)(?:\s[^>]*)?>/gi, (match, tag: string) => allowedTags.has(tag.toLowerCase()) ? `<${tag.toLowerCase()}>` : "")
    .replace(/<\/([a-z0-9-]+)>/gi, (match, tag: string) => allowedTags.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : "");
  return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
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
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
};
