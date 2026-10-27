"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../../lib/api";
import { Toast } from "../../../../components/Toast";
import { MathText } from "../../../../components/MathContent";

type WorksheetItem = {
  id: number;
  item_type: "pilihan_ganda" | "isian_singkat" | "uraian" | string;
  prompt: string;
  options: Record<string, unknown> | null;
  points: number;
};

type WorksheetResponse = {
  ok: true;
  data: {
    worksheet: { id: number; module_id: number; title: string; instructions: string | null };
    items: WorksheetItem[];
  };
};

type AttemptResponse = {
  ok: true;
  data: {
    status: "draf" | "terkumpul" | "dinilai";
    answers: { item_id: number; answer_text: string | null }[];
  };
};
type IntegrityEvent = "visibility_hidden" | "window_blur" | "copy_attempt" | "paste_attempt" | "context_menu";

export default function WorksheetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");
  const [data, setData] = useState<WorksheetResponse["data"] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"draf" | "terkumpul" | "dinilai">("draf");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const lastIntegrityEventRef = useRef<Record<string, number>>({});

  useEffect(() => {
    void Promise.all([
      apiRequest<WorksheetResponse>(`/murid/worksheets/${params.id}`),
      apiRequest<AttemptResponse>(`/murid/worksheets/${params.id}/attempt`),
    ])
      .then(([worksheet, attempt]) => {
        setData(worksheet.data);
        setStatus(attempt.data.status);
        setAnswers(Object.fromEntries(attempt.data.answers.map((answer) => [answer.item_id, answer.answer_text ?? ""])));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "Belum masuk.") {
          router.replace("/login");
          return;
        }
        setMessage(error instanceof Error ? error.message : "LKPD belum dapat dimuat.");
      });
  }, [params.id, router]);

  useEffect(() => {
    if (!assignmentId) return;
    void apiRequest("/activity", { method: "POST", body: JSON.stringify({ assignmentId: Number(assignmentId), event: "mulai_lkpd" }) });
  }, [assignmentId]);

  useEffect(() => {
    const numericAssignmentId = Number(assignmentId);
    if (!assignmentId || !Number.isInteger(numericAssignmentId) || status !== "draf") return;

    function reportIntegrityEvent(event: IntegrityEvent) {
      const now = Date.now();
      const lastReportedAt = lastIntegrityEventRef.current[event] ?? 0;
      if (now - lastReportedAt < 10_000) return;
      lastIntegrityEventRef.current[event] = now;
      void apiRequest("/integrity", {
        method: "POST",
        body: JSON.stringify({ assignmentId: numericAssignmentId, event }),
      }).catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") reportIntegrityEvent("visibility_hidden");
    }

    function handleBlur() { reportIntegrityEvent("window_blur"); }
    function handleCopy() { reportIntegrityEvent("copy_attempt"); }
    function handlePaste() { reportIntegrityEvent("paste_attempt"); }
    function handleContextMenu() { reportIntegrityEvent("context_menu"); }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [assignmentId, status]);

  function setAnswer(itemId: number, value: string) {
    setAnswers((current) => ({ ...current, [itemId]: value }));
  }

  async function saveDraft() {
    if (!data || status !== "draf") return;
    setSaving(true);
    setMessage("");
    try {
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({
          answers: data.items.map((item) => ({ itemId: item.id, answerText: answers[item.id] ?? "" })),
        }),
      });
      setStatus("draf");
      setMessage("Draf jawaban tersimpan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draf belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function submitWorksheet() {
    if (!data || status !== "draf") return;
    setSaving(true);
    setMessage("");
    try {
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({
          answers: data.items.map((item) => ({ itemId: item.id, answerText: answers[item.id] ?? "" })),
        }),
      });
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/submit`, { method: "POST" });
      if (assignmentId) {
        await apiRequest("/activity", {
          method: "POST",
          body: JSON.stringify({ assignmentId: Number(assignmentId), event: "kumpul" }),
        });
      }
      setStatus("terkumpul");
      setMessage("LKPD berhasil dikumpulkan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LKPD belum dapat dikumpulkan.");
    } finally {
      setSaving(false);
    }
  }

  if (message && !data) return <main style={styles.container}><Toast message={message} onDismiss={() => setMessage("")} /><Link href="/murid">← Kembali</Link></main>;
  if (!data) return <main style={styles.container}><p>Memuat LKPD...</p></main>;

  return (
    <main style={styles.container}>
      <Link href={`/murid/modules/${data.worksheet.module_id}`} style={styles.back}>← Kembali ke materi</Link>
      <p style={styles.eyebrow}>SIMAK · LKPD</p>
      <h1 style={styles.title}>{data.worksheet.title}</h1>
      {data.worksheet.instructions ? <p style={styles.instructions}><MathText text={data.worksheet.instructions} /></p> : null}
      {assignmentId ? <p style={styles.integrityNotice}>Untuk membantu guru meninjau proses belajar, SIMAK mencatat indikasi seperti berpindah halaman dan aktivitas clipboard. Ini bukan penilaian otomatis bahwa Anda melakukan kecurangan.</p> : null}
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      <section style={styles.list}>
        {data.items.map((item, index) => (
          <article key={item.id} style={styles.question}>
            <strong>{index + 1}. <MathText text={item.prompt} /></strong>
            <span style={styles.points}>{item.points} poin</span>
            <AnswerField item={item} value={answers[item.id] ?? ""} disabled={status !== "draf"} onChange={(value) => setAnswer(item.id, value)} />
          </article>
        ))}
      </section>

      <div style={styles.actions}>
        <button type="button" disabled={saving || status !== "draf"} onClick={() => void saveDraft()} style={styles.secondaryButton}>Simpan draf</button>
        <button type="button" disabled={saving || status !== "draf"} onClick={() => void submitWorksheet()} style={styles.primaryButton}>Kumpulkan LKPD</button>
      </div>
    </main>
  );
}

function AnswerField({ item, value, disabled, onChange }: { item: WorksheetItem; value: string; disabled: boolean; onChange: (value: string) => void }) {
  if (item.item_type === "pilihan_ganda") {
    const options = Array.isArray(item.options?.options) ? item.options.options.filter((option): option is string => typeof option === "string") : [];
    return <div style={styles.options}>{options.map((option) => (
      <label key={option} style={styles.option}><input type="radio" name={`item-${item.id}`} value={option} checked={value === option} disabled={disabled} onChange={(event) => onChange(event.target.value)} /><MathText text={option} /></label>
    ))}</div>;
  }
  if (item.item_type === "uraian") {
    return <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} rows={5} placeholder="Tulis jawaban Anda" style={styles.textarea} />;
  }
  if (item.item_type === "isian_singkat") {
    return <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Jawaban singkat" style={styles.input} />;
  }
  return <p style={styles.notice}>Jenis soal ini akan tersedia pada tahap berikutnya.</p>;
}

const styles = {
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none" },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "32px 0 8px" },
  title: { fontSize: 34, margin: 0 },
  instructions: { color: "#667085", lineHeight: 1.6 },
  integrityNotice: { color: "#475467", background: "#f8f9fc", border: "1px solid #eaecf0", padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.5 },
  message: { color: "#175cd3", background: "#eff8ff", padding: 12, borderRadius: 8 },
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
  list: { display: "grid", gap: 16, marginTop: 28 },
  question: { display: "grid", gap: 12, border: "1px solid #eaecf0", borderRadius: 10, padding: 16 },
  points: { color: "#667085", fontSize: 13 },
  options: { display: "grid", gap: 10 },
  option: { display: "flex", gap: 8, alignItems: "flex-start" },
  input: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11 },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const },
  notice: { color: "#667085", background: "#f8f9fc", padding: 12, borderRadius: 8 },
  actions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700 },
  secondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "11px 14px" },
};
