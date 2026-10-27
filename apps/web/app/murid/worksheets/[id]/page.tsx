"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../../lib/api";
import { Toast } from "../../../../components/Toast";
import { MathText } from "../../../../components/MathContent";

type WorksheetItem = {
  id: number;
  item_type: "pilihan_ganda" | "isian_singkat" | "uraian" | "unggah_foto" | "langkah_berurutan" | "refleksi" | "tautan_ruas" | string;
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
    answers: { item_id: number; answer_text: string | null; attachment_key: string | null }[];
    explanations?: Record<string, string>;
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
  const [attachmentKeys, setAttachmentKeys] = useState<Record<number, string>>({});
  const [attachmentNames, setAttachmentNames] = useState<Record<number, string>>({});
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
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
        setAttachmentKeys(Object.fromEntries(
          attempt.data.answers.filter((answer) => answer.attachment_key).map((answer) => [answer.item_id, answer.attachment_key!]),
        ));
        setExplanations(Object.fromEntries(
          Object.entries(attempt.data.explanations ?? {}).map(([itemId, text]) => [Number(itemId), text]),
        ));
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

  function buildAnswersPayload() {
    if (!data) return [];
    return data.items.map((item) => {
      // Butir langkah berurutan yang belum disentuh murid memakai urutan tampil
      // sebagai urutan awal, sesuai yang dilihat murid di layar.
      const steps = item.item_type === "langkah_berurutan" && Array.isArray(item.options?.steps)
        ? item.options.steps.filter((step): step is string => typeof step === "string")
        : [];
      const answerText = answers[item.id] || (steps.length ? steps.join("\n") : "");
      return {
        itemId: item.id,
        answerText,
        ...(attachmentKeys[item.id] ? { attachmentKey: attachmentKeys[item.id] } : {}),
      };
    });
  }

  async function handlePhotoUpload(itemId: number, file: File) {
    if (!data) return;
    setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Foto harus berformat JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("Ukuran foto maksimal 10 MB.");
      return;
    }
    setUploadingItemId(itemId);
    try {
      const presign = await apiRequest<{
        ok: true;
        data: { upload_url: string; attachment_key: string; content_type: string };
      }>("/uploads/presign-worksheet", {
        method: "POST",
        body: JSON.stringify({
          worksheetId: data.worksheet.id,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const upload = await fetch(presign.data.upload_url, {
        method: "PUT",
        headers: { "Content-Type": presign.data.content_type },
        body: file,
      });
      if (!upload.ok) throw new Error("Foto gagal diunggah ke penyimpanan.");
      setAttachmentKeys((current) => ({ ...current, [itemId]: presign.data.attachment_key }));
      setAttachmentNames((current) => ({ ...current, [itemId]: file.name }));
      setMessage("Foto terunggah. Jangan lupa simpan draf atau kumpulkan LKPD.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Foto belum dapat diunggah.");
    } finally {
      setUploadingItemId(null);
    }
  }

  async function saveDraft() {
    if (!data || status !== "draf") return;
    setSaving(true);
    setMessage("");
    try {
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers: buildAnswersPayload() }),
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
        body: JSON.stringify({ answers: buildAnswersPayload() }),
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
            <AnswerField
              item={item}
              value={answers[item.id] ?? ""}
              disabled={status !== "draf"}
              onChange={(value) => setAnswer(item.id, value)}
              attachmentKey={attachmentKeys[item.id]}
              attachmentName={attachmentNames[item.id]}
              uploading={uploadingItemId === item.id}
              onPhotoUpload={(file) => void handlePhotoUpload(item.id, file)}
            />
            {status !== "draf" && explanations[item.id] ? (
              <div style={styles.explanation}>
                <strong>Pembahasan</strong>
                <p style={styles.explanationText}><MathText text={explanations[item.id]} /></p>
              </div>
            ) : null}
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

function stringOptions(item: WorksheetItem, key: string): string[] {
  const raw = item.options?.[key];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
}

function AnswerField({
  item,
  value,
  disabled,
  onChange,
  attachmentKey,
  attachmentName,
  uploading,
  onPhotoUpload,
}: {
  item: WorksheetItem;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  attachmentKey?: string;
  attachmentName?: string;
  uploading: boolean;
  onPhotoUpload: (file: File) => void;
}) {
  if (item.item_type === "pilihan_ganda") {
    const options = stringOptions(item, "options");
    return <div style={styles.options}>{options.map((option) => (
      <label key={option} style={styles.option}><input type="radio" name={`item-${item.id}`} value={option} checked={value === option} disabled={disabled} onChange={(event) => onChange(event.target.value)} /><MathText text={option} /></label>
    ))}</div>;
  }
  if (item.item_type === "uraian") {
    const placeholder = typeof item.options?.placeholder === "string" ? item.options.placeholder : "Tulis jawaban Anda";
    return <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} rows={5} placeholder={placeholder} style={styles.textarea} />;
  }
  if (item.item_type === "refleksi") {
    return <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} rows={5} placeholder="Tulis refleksi Anda" style={styles.textarea} />;
  }
  if (item.item_type === "isian_singkat") {
    const unit = typeof item.options?.unit === "string" ? item.options.unit : null;
    return (
      <div style={styles.shortAnswer}>
        <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Jawaban singkat" style={styles.input} />
        {unit ? <span style={styles.points}>{unit}</span> : null}
      </div>
    );
  }
  if (item.item_type === "langkah_berurutan") {
    const steps = stringOptions(item, "steps");
    const savedOrder = value ? value.split("\n").filter(Boolean) : [];
    const order = savedOrder.length === steps.length && steps.every((step) => savedOrder.includes(step)) ? savedOrder : steps;
    function move(index: number, direction: -1 | 1) {
      const target = index + direction;
      if (target < 0 || target >= order.length) return;
      const next = [...order];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      onChange(next.join("\n"));
    }
    return (
      <div style={styles.sequence}>
        <p style={styles.points}>Susun langkah berikut dari yang pertama sampai terakhir dengan tombol naik/turun.</p>
        {order.map((step, index) => (
          <div key={`${step}-${index}`} style={styles.sequenceRow}>
            <span style={styles.sequenceText}>{index + 1}. <MathText text={step} /></span>
            <span style={styles.sequenceButtons}>
              <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} style={styles.sequenceButton} aria-label={`Naikkan langkah ${index + 1}`}>↑</button>
              <button type="button" disabled={disabled || index === order.length - 1} onClick={() => move(index, 1)} style={styles.sequenceButton} aria-label={`Turunkan langkah ${index + 1}`}>↓</button>
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (item.item_type === "unggah_foto") {
    const instruction = typeof item.options?.instruction === "string" ? item.options.instruction : null;
    return (
      <div style={styles.photoUpload}>
        {instruction ? <p style={styles.points}>{instruction}</p> : null}
        <input
          type="file"
          accept="image/*"
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPhotoUpload(file);
            event.target.value = "";
          }}
          style={styles.input}
        />
        {uploading ? <p style={styles.points}>Mengunggah foto...</p> : null}
        {!uploading && attachmentKey ? <p style={styles.points}>Foto terunggah{attachmentName ? `: ${attachmentName}` : ""}</p> : null}
      </div>
    );
  }
  if (item.item_type === "tautan_ruas") {
    const url = typeof item.options?.url === "string" ? item.options.url : "";
    const label = typeof item.options?.label === "string" && item.options.label ? item.options.label : "Buka Kuis di RUAS";
    if (!url) return <p style={styles.notice}>Tautan kuis belum diisi guru.</p>;
    return (
      <div style={styles.ruasLink}>
        <a href={url} target="_blank" rel="noreferrer" style={styles.ruasButton}>{label}</a>
        <p style={styles.points}>Nilai kuis tercatat di RUAS, bukan di SIMAK.</p>
      </div>
    );
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
  shortAnswer: { display: "flex", gap: 8, alignItems: "center" },
  sequence: { display: "grid", gap: 8 },
  sequenceRow: { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", border: "1px solid #eaecf0", borderRadius: 8, padding: "8px 10px" },
  sequenceText: { lineHeight: 1.5 },
  sequenceButtons: { display: "flex", gap: 6 },
  sequenceButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "6px 10px", fontWeight: 700 },
  photoUpload: { display: "grid", gap: 8 },
  ruasLink: { display: "grid", gap: 8, justifyItems: "start" as const },
  ruasButton: { display: "inline-block", borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700, textDecoration: "none" },
  explanation: { background: "#f8f9fc", border: "1px solid #eaecf0", borderRadius: 8, padding: 12, display: "grid", gap: 6 },
  explanationText: { margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" as const },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const },
  notice: { color: "#667085", background: "#f8f9fc", padding: 12, borderRadius: 8 },
  actions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700 },
  secondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "11px 14px" },
};
