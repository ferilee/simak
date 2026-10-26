"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";

type ModuleSummary = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  status: "draf" | "terbit" | "arsip";
  version: number;
};

type ModulesResponse = { ok: true; data: ModuleSummary[] };
type MeResponse = { ok: true; user: { role: "guru" | "murid" } };

export default function GuruPage() {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [blockHtml, setBlockHtml] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadModules() {
    try {
      const me = await apiRequest<MeResponse>("/auth/me");
      if (me.user.role !== "guru") {
        setMessage("Akun ini berperan sebagai murid. Keluar dahulu lalu masuk dengan akun guru.");
        return;
      }
      const response = await apiRequest<ModulesResponse>("/modules");
      setModules(response.data);
      setSelectedId((current) => current ?? response.data[0]?.id ?? null);
    } catch (error) {
      if (error instanceof Error && (error.message === "Belum masuk." || error.message.includes("Peran Anda"))) {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Modul belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  useEffect(() => {
    void loadModules();
  }, []);

  async function createModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await apiRequest<{ ok: true; data: ModuleSummary }>("/modules", {
        method: "POST",
        body: JSON.stringify({ title, subject, description }),
      });
      setTitle("");
      setSubject("");
      setDescription("");
      setSelectedId(response.data.id);
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modul belum dapat dibuat.");
    }
  }

  async function changeStatus(module: ModuleSummary) {
    const status = module.status === "terbit" ? "arsip" : "terbit";
    try {
      await apiRequest(`/modules/${module.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status modul belum dapat diubah.");
    }
  }

  async function addTextBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !blockHtml.trim()) return;
    try {
      await apiRequest(`/modules/${selectedId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          content: { type: "teks", html: blockHtml },
          sortOrder: 0,
        }),
      });
      setBlockHtml("");
      setMessage("Blok materi ditambahkan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat ditambahkan.");
    }
  }

  if (loading) return <main style={styles.container}><p>Memuat ruang guru...</p></main>;

  return (
    <main style={styles.container}>
      <div style={styles.topline}>
        <div>
          <p style={styles.eyebrow}>SIMAK · GURU</p>
          <h1 style={styles.title}>Materi pembelajaran</h1>
        </div>
        <button type="button" onClick={() => void logout()} style={styles.secondaryButton}>Keluar</button>
      </div>
      <p style={styles.muted}>Buat modul, susun blok materi, lalu terbitkan untuk murid.</p>
      {message ? <p role="alert" style={styles.message}>{message}</p> : null}

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Buat modul</h2>
        <form onSubmit={createModule} style={styles.form}>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul modul" style={styles.input} />
          <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Mata pelajaran" style={styles.input} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Deskripsi singkat" rows={3} style={styles.textarea} />
          <button type="submit" style={styles.primaryButton}>Buat draf</button>
        </form>
      </section>

      <section>
        <h2 style={styles.sectionTitle}>Modul saya</h2>
        {modules.length === 0 ? <p style={styles.empty}>Belum ada modul.</p> : (
          <div style={styles.list}>
            {modules.map((module) => (
              <article key={module.id} style={{ ...styles.module, borderColor: selectedId === module.id ? "#175cd3" : "#eaecf0" }}>
                <button type="button" onClick={() => setSelectedId(module.id)} style={styles.moduleSelect}>
                  <strong>{module.title}</strong>
                  <span style={styles.muted}>{module.subject} · versi {module.version}</span>
                </button>
                <span style={styles.status}>{module.status}</span>
                <button type="button" onClick={() => void changeStatus(module)} style={styles.secondaryButton}>
                  {module.status === "terbit" ? "Arsipkan" : "Terbitkan"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedId ? (
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Tambah blok teks</h2>
          <form onSubmit={addTextBlock} style={styles.form}>
            <textarea
              required
              value={blockHtml}
              onChange={(event) => setBlockHtml(event.target.value)}
              placeholder="Tulis isi materi. HTML dasar seperti <strong>tebal</strong> boleh digunakan."
              rows={6}
              style={styles.textarea}
            />
            <button type="submit" style={styles.primaryButton}>Tambahkan blok</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

const styles = {
  container: { maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" },
  topline: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 8px" },
  title: { fontSize: 32, margin: 0 },
  muted: { color: "#667085", lineHeight: 1.5 },
  message: { background: "#eff8ff", color: "#175cd3", padding: 12, borderRadius: 8 },
  panel: { border: "1px solid #eaecf0", borderRadius: 12, padding: 18, marginTop: 24 },
  sectionTitle: { fontSize: 20, margin: "28px 0 12px" },
  form: { display: "grid", gap: 10 },
  input: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11 },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700 },
  secondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "9px 12px" },
  empty: { color: "#667085", background: "#f8f9fc", padding: 16, borderRadius: 8 },
  list: { display: "grid", gap: 10 },
  module: { display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, border: "1px solid", borderRadius: 10, padding: 14 },
  moduleSelect: { display: "grid", textAlign: "left" as const, gap: 4, border: 0, background: "transparent", padding: 0, font: "inherit" },
  status: { fontSize: 13, color: "#475467" },
};
