"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../lib/api";
import {
  groupEntriesByDate,
  journalDateLabel,
  journalDateTimeLabel,
  type JournalEntry,
  type JournalListData,
  type JournalMood,
  type JournalPrompt,
} from "../../../lib/jurnal";
import { useConfirm } from "../../../components/ConfirmDialog";
import { Toast } from "../../../components/Toast";

// Halaman "Jurnal Belajar" (Hub Murid Tahap 3): refleksi harian murid —
// bentuk permanen tahap Transform pada alur DELTA. Murid menulis entri
// bebas atau mengikuti prompt refleksi BAWAAN (katalog dari server;
// guru tidak membuat prompt), boleh menandai perasaan dan mengaitkan
// entri ke materi yang sedang dipelajari. Entri bisa disunting dan
// dihapus oleh pemiliknya; tanggal jurnal diputuskan server (WIB) dan
// tidak berubah saat penyuntingan. Jurnal tidak dinilai dan tidak
// menghasilkan XP — guru kelas dapat membacanya untuk membimbing,
// tanpa memberi skor. Bahasa visual mengikuti halaman Nilai Saya:
// kartu ungu lembut, membulat, ramah.

type JournalResponse = { ok: true; data: JournalListData };
type EntryResponse = { ok: true; data: JournalEntry };
type TodayModulesResponse = { ok: true; data: { modules: { id: number; title: string }[] } };

const PAGE_SIZE = 100;

export default function JurnalBelajarPage() {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [prompts, setPrompts] = useState<JournalPrompt[]>([]);
  const [moods, setMoods] = useState<JournalMood[]>([]);
  const [modules, setModules] = useState<{ id: number; title: string }[]>([]);
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState("");
  const [promptKey, setPromptKey] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [linkedModuleId, setLinkedModuleId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");

  async function loadEntries(offset: number): Promise<JournalListData | null> {
    try {
      const response = await apiRequest<JournalResponse>(`/murid/jurnal?limit=${PAGE_SIZE}&offset=${offset}`);
      return response.data;
    } catch (error) {
      if (error instanceof Error && error.message === "Belum masuk.") {
        router.replace("/login");
        return null;
      }
      throw error;
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadEntries(0);
        if (cancelled || !data) return;
        setEntries(data.entries);
        setTotal(data.total);
        setPrompts(data.prompts);
        setMoods(data.moods);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Jurnal tidak dapat dimuat.");
      }
    })();
    void (async () => {
      try {
        const response = await apiRequest<TodayModulesResponse>("/murid/today");
        if (!cancelled) setModules(response.data.modules.map((module) => ({ id: module.id, title: module.title })));
      } catch {
        // Pemilih kaitan materi bersifat opsional — gagal muat daftar
        // materi tidak boleh menghalangi menulis jurnal.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (!entries || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await loadEntries(entries.length);
      if (data) {
        setEntries((current) => [...(current ?? []), ...data.entries]);
        setTotal(data.total);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Entri berikutnya tidak dapat dimuat.");
    } finally {
      setLoadingMore(false);
    }
  }

  function resetForm() {
    setBody("");
    setPromptKey(null);
    setMood(null);
    setLinkedModuleId(null);
    setEditingId(null);
    setFormError("");
  }

  function startEdit(entry: JournalEntry) {
    setBody(entry.body);
    setPromptKey(entry.prompt_key);
    setMood(entry.mood);
    setLinkedModuleId(entry.linked_module_id);
    setEditingId(entry.id);
    setFormError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitEntry(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    const payload = { body, prompt_key: promptKey, mood, linked_module_id: linkedModuleId };
    try {
      if (editingId !== null) {
        const response = await apiRequest<EntryResponse>(`/murid/jurnal/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setEntries((current) => (current ?? []).map((entry) => (entry.id === editingId ? response.data : entry)));
        setMessage("Entri jurnal tersimpan.");
      } else {
        const response = await apiRequest<EntryResponse>("/murid/jurnal", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setEntries((current) => [response.data, ...(current ?? [])]);
        setTotal((current) => current + 1);
        setMessage("Entri jurnal tersimpan. Refleksi yang bagus!");
      }
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Entri jurnal gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry: JournalEntry) {
    const confirmed = await confirmDialog(`Hapus entri jurnal ${journalDateLabel(entry.entry_date)} ini? Entri yang dihapus tidak dapat dikembalikan.`, {
      confirmLabel: "Hapus",
      cancelLabel: "Batal",
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/murid/jurnal/${entry.id}`, { method: "DELETE" });
      setEntries((current) => (current ?? []).filter((item) => item.id !== entry.id));
      setTotal((current) => Math.max(0, current - 1));
      if (editingId === entry.id) resetForm();
      setMessage("Entri jurnal dihapus.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Entri jurnal gagal dihapus.");
    }
  }

  const groups = entries ? groupEntriesByDate(entries) : [];

  return (
    <main style={styles.container}>
      <Link href="/murid" style={styles.back}>← Ruang murid</Link>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      <section style={styles.hero}>
        <span style={styles.heroEmoji} aria-hidden="true">📓</span>
        <p style={styles.heroEyebrow}>SIMAK · JURNAL BELAJAR</p>
        <h1 style={styles.heroTitle}>Jurnal Belajar</h1>
        <p style={styles.heroCopy}>
          Tulis refleksimu sesudah belajar: apa yang berubah dari pemahamanmu, bagian yang masih membingungkan,
          dan strategi yang berhasil. Jurnal ini tidak dinilai — gurumu dapat membacanya untuk membantumu belajar.
        </p>
        {entries ? (
          <p style={styles.heroSummary}>
            <strong>{total} entri</strong> sudah kamu tulis
          </p>
        ) : null}
      </section>

      <form ref={formRef} onSubmit={submitEntry} style={styles.formCard}>
        <h2 style={styles.formTitle}>{editingId !== null ? "Sunting entri" : "Tulis entri baru"}</h2>
        {prompts.length > 0 ? (
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Mulai dari pertanyaan ini (opsional)</legend>
            <div style={styles.chipRow}>
              <button
                type="button"
                className="button button-secondary"
                style={promptKey === null ? styles.chipActive : styles.chip}
                onClick={() => setPromptKey(null)}
              >
                Bebas
              </button>
              {prompts.map((prompt) => (
                <button
                  key={prompt.key}
                  type="button"
                  className="button button-secondary"
                  style={promptKey === prompt.key ? styles.chipActive : styles.chip}
                  onClick={() => setPromptKey(promptKey === prompt.key ? null : prompt.key)}
                >
                  {prompt.text}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <label style={styles.label} htmlFor="jurnal-body">Isi refleksi</label>
        <textarea
          id="jurnal-body"
          style={styles.textarea}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Tulis refleksimu di sini..."
          rows={5}
          maxLength={5000}
          required
        />

        {moods.length > 0 ? (
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Perasaanmu saat belajar (opsional)</legend>
            <div style={styles.chipRow}>
              {moods.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="button button-secondary"
                  style={mood === item.key ? styles.chipActive : styles.chip}
                  onClick={() => setMood(mood === item.key ? null : item.key)}
                >
                  {item.emoji} {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {modules.length > 0 ? (
          <>
            <label style={styles.label} htmlFor="jurnal-module">Kaitkan ke materi (opsional)</label>
            <select
              id="jurnal-module"
              style={styles.select}
              value={linkedModuleId ?? ""}
              onChange={(event) => setLinkedModuleId(event.target.value === "" ? null : Number(event.target.value))}
            >
              <option value="">Tidak dikaitkan ke materi</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>{module.title}</option>
              ))}
            </select>
          </>
        ) : null}

        {formError ? <p role="alert" style={styles.formError}>{formError}</p> : null}
        <div style={styles.formActions}>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Menyimpan..." : editingId !== null ? "Simpan perubahan" : "Simpan entri"}
          </button>
          {editingId !== null ? (
            <button type="button" className="button button-secondary" onClick={resetForm} disabled={busy}>
              Batal menyunting
            </button>
          ) : null}
        </div>
      </form>

      {loadError ? (
        <p role="alert" style={styles.formError}>{loadError}</p>
      ) : entries === null ? (
        <p style={styles.muted}>Memuat jurnal...</p>
      ) : entries.length === 0 ? (
        <section style={styles.emptyCard}>
          <p style={styles.emptyStatement}>Belum ada entri jurnal</p>
          <p style={styles.emptyCopy}>
            Refleksi pertamamu bisa sesingkat dua kalimat: satu hal yang hari ini jadi lebih jelas,
            dan satu hal yang masih ingin kamu pahami. Tulis lewat formulir di atas ya.
          </p>
        </section>
      ) : (
        <div style={styles.list}>
          {groups.map((group) => (
            <section key={group.date} style={styles.group}>
              <h3 style={styles.groupTitle}>{group.label}</h3>
              {group.entries.map((entry) => (
                <article key={entry.id} style={styles.card}>
                  <div style={styles.cardMain}>
                    <div style={styles.cardHeader}>
                      {entry.prompt_text ? <span style={styles.promptChip}>{entry.prompt_text}</span> : null}
                      {entry.mood_label ? (
                        <span style={styles.moodChip}>{entry.mood_emoji} {entry.mood_label}</span>
                      ) : null}
                    </div>
                    <p style={styles.bodyText}>{entry.body}</p>
                    {entry.linked_module_title ? (
                      <p style={styles.meta}>📚 Materi: {entry.linked_module_title}</p>
                    ) : null}
                    {entry.teacher_response ? (
                      <div style={styles.responseBlock}>
                        <p style={styles.responseLabel}>
                          💬 Tanggapan guru
                          {entry.teacher_responded_by_name ? ` · ${entry.teacher_responded_by_name}` : ""}
                          {entry.teacher_response_at ? ` · ${journalDateTimeLabel(entry.teacher_response_at)}` : ""}
                        </p>
                        <p style={styles.responseBody}>{entry.teacher_response}</p>
                      </div>
                    ) : null}
                  </div>
                  <div style={styles.cardActions}>
                    <button type="button" className="button button-secondary" onClick={() => startEdit(entry)}>
                      Sunting
                    </button>
                    <button type="button" className="button button-secondary" style={styles.deleteButton} onClick={() => void removeEntry(entry)}>
                      Hapus
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ))}
          {entries.length < total ? (
            <button type="button" className="button button-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Memuat..." : "Tampilkan lebih banyak"}
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}

const styles = {
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none" },
  muted: { color: "#667085", lineHeight: 1.5, margin: "20px 0 0" },
  hero: { background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 16, padding: "24px 20px 26px", marginTop: 24, display: "grid", gap: 8, justifyItems: "center" as const, textAlign: "center" as const },
  heroEmoji: { fontSize: 40, lineHeight: 1 },
  heroEyebrow: { color: "#6941c6", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "6px 0 0" },
  heroTitle: { fontSize: 30, margin: 0, lineHeight: 1.25 },
  heroCopy: { color: "#667085", lineHeight: 1.6, margin: 0, maxWidth: 520 },
  heroSummary: { margin: "6px 0 0", fontSize: 16, color: "#344054" },
  formCard: { background: "#ffffff", border: "1px solid #eaecf0", borderRadius: 16, padding: 20, marginTop: 20, display: "grid", gap: 12 },
  formTitle: { fontSize: 20, margin: 0 },
  fieldset: { border: "none", margin: 0, padding: 0, display: "grid", gap: 8 },
  legend: { fontWeight: 700, fontSize: 14, color: "#344054", padding: 0, marginBottom: 8 },
  label: { fontWeight: 700, fontSize: 14, color: "#344054" },
  chipRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  chip: { borderRadius: 999, minHeight: 40 },
  chipActive: { borderRadius: 999, minHeight: 40, background: "#f5f3ff", borderColor: "#6941c6", color: "#6941c6", fontWeight: 700 },
  textarea: { width: "100%", borderRadius: 12, border: "1px solid #d0d5dd", padding: "12px 14px", fontSize: 16, lineHeight: 1.6, fontFamily: "inherit", boxSizing: "border-box" as const },
  select: { width: "100%", borderRadius: 12, border: "1px solid #d0d5dd", padding: "10px 12px", fontSize: 16, minHeight: 44, background: "#ffffff" },
  formError: { color: "#b42318", margin: 0, lineHeight: 1.5 },
  formActions: { display: "flex", gap: 10, flexWrap: "wrap" as const },
  emptyCard: { background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 16, padding: "28px 20px 30px", marginTop: 20, display: "grid", gap: 8, justifyItems: "center" as const, textAlign: "center" as const },
  emptyStatement: { fontSize: 18, fontWeight: 700, margin: 0 },
  emptyCopy: { color: "#667085", lineHeight: 1.6, margin: 0, maxWidth: 460 },
  list: { display: "grid", gap: 20, marginTop: 24 },
  group: { display: "grid", gap: 12 },
  groupTitle: { fontSize: 16, margin: 0, color: "#344054" },
  card: { background: "#ffffff", border: "1px solid #eaecf0", borderRadius: 16, padding: 18, display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const },
  cardMain: { display: "grid", gap: 8, flex: "1 1 260px", minWidth: 0 },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  promptChip: { background: "#f5f3ff", color: "#6941c6", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 },
  moodChip: { background: "#fffaeb", color: "#93370d", border: "1px solid #fedf89", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 },
  bodyText: { margin: 0, lineHeight: 1.65, color: "#1d2939", whiteSpace: "pre-wrap" as const, overflowWrap: "break-word" as const },
  meta: { color: "#475467", fontSize: 14, margin: 0 },
  responseBlock: { background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 4 },
  responseLabel: { fontWeight: 700, fontSize: 13, color: "#067647", margin: 0 },
  responseBody: { margin: 0, lineHeight: 1.6, color: "#1d2939", whiteSpace: "pre-wrap" as const, overflowWrap: "break-word" as const },
  cardActions: { display: "flex", gap: 8 },
  deleteButton: { color: "#b42318", borderColor: "#fecdca" },
};
