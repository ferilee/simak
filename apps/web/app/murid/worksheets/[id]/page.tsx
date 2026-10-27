"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../../lib/api";

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
    status: "draf" | "terkumpul";
    answers: { item_id: number; answer_text: string | null }[];
  };
};

export default function WorksheetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<WorksheetResponse["data"] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"draf" | "terkumpul">("draf");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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

  function setAnswer(itemId: number, value: string) {
    setAnswers((current) => ({ ...current, [itemId]: value }));
  }

  async function saveDraft() {
    if (!data || status === "terkumpul") return;
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
    if (!data || status === "terkumpul") return;
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
      setStatus("terkumpul");
      setMessage("LKPD berhasil dikumpulkan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LKPD belum dapat dikumpulkan.");
    } finally {
      setSaving(false);
    }
  }

  if (message && !data) return <main style={styles.container}><p role="alert" style={styles.error}>{message}</p><Link href="/murid">← Kembali</Link></main>;
  if (!data) return <main style={styles.container}><p>Memuat LKPD...</p></main>;

  return (
    <main style={styles.container}>
      <Link href={`/murid/modules/${data.worksheet.module_id}`} style={styles.back}>← Kembali ke materi</Link>
      <p style={styles.eyebrow}>SIMAK · LKPD</p>
      <h1 style={styles.title}>{data.worksheet.title}</h1>
      {data.worksheet.instructions ? <p style={styles.instructions}>{data.worksheet.instructions}</p> : null}
      {message ? <p role="status" style={styles.message}>{message}</p> : null}

      <section style={styles.list}>
        {data.items.map((item, index) => (
          <article key={item.id} style={styles.question}>
            <strong>{index + 1}. {item.prompt}</strong>
            <span style={styles.points}>{item.points} poin</span>
            <AnswerField item={item} value={answers[item.id] ?? ""} disabled={status === "terkumpul"} onChange={(value) => setAnswer(item.id, value)} />
          </article>
        ))}
      </section>

      <div style={styles.actions}>
        <button type="button" disabled={saving || status === "terkumpul"} onClick={() => void saveDraft()} style={styles.secondaryButton}>Simpan draf</button>
        <button type="button" disabled={saving || status === "terkumpul"} onClick={() => void submitWorksheet()} style={styles.primaryButton}>Kumpulkan LKPD</button>
      </div>
    </main>
  );
}

function AnswerField({ item, value, disabled, onChange }: { item: WorksheetItem; value: string; disabled: boolean; onChange: (value: string) => void }) {
  if (item.item_type === "pilihan_ganda") {
    const options = Array.isArray(item.options?.options) ? item.options.options.filter((option): option is string => typeof option === "string") : [];
    return <div style={styles.options}>{options.map((option) => (
      <label key={option} style={styles.option}><input type="radio" name={`item-${item.id}`} value={option} checked={value === option} disabled={disabled} onChange={(event) => onChange(event.target.value)} />{option}</label>
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
