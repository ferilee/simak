"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../../../lib/api";
import { submissionStatusLabel } from "../../../lib/labels";
import { Toast } from "../../../../components/Toast";
import { MathText } from "../../../../components/MathContent";

type AssignmentDetail = {
  assignment: {
    id: number;
    title: string;
    instructions: string | null;
    ruas_quiz_url: string | null;
    opens_at: string;
    due_at: string;
    progress: string;
  };
  worksheet: { id: number; title: string } | null;
  attempt: { status: string; total_score: number | null; submitted_at: string | null } | null;
  exit_ticket_submitted: boolean;
  ruas_quiz_completed: boolean;
};
type AssignmentResponse = { ok: true; data: AssignmentDetail };
type AssignmentStepId = "worksheet" | "quiz" | "exit";
type AssignmentStep = { id: AssignmentStepId; label: string; title: string; description: string; complete: boolean };

export default function AssignmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<AssignmentDetail | null>(null);
  const [understood3, setUnderstood3] = useState("");
  const [examples2, setExamples2] = useState("");
  const [confusing1, setConfusing1] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  async function load() {
    try {
      const response = await apiRequest<AssignmentResponse>(`/murid/assignments/${params.id}`);
      setData(response.data);
    } catch (error) {
      if (error instanceof Error && error.message === "Belum masuk.") {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Penugasan belum dapat dimuat.");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function submitExitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await apiRequest(`/murid/assignments/${params.id}/exit-ticket`, {
        method: "POST",
        body: JSON.stringify({ understood3, examples2, confusing1 }),
      });
      setMessage("Exit ticket tersimpan.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Exit ticket belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }

  function openRuas() {
    if (!data?.assignment.ruas_quiz_url) return;
    void apiRequest("/activity", { method: "POST", body: JSON.stringify({ assignmentId: data.assignment.id, event: "buka_kuis_ruas" }) });
    window.open(data.assignment.ruas_quiz_url, "_blank", "noopener,noreferrer");
  }

  if (message && !data) return <main style={styles.container}><Toast message={message} onDismiss={() => setMessage("")} /><Link href="/murid">← Kembali</Link></main>;
  if (!data) return <main style={styles.container}><p>Memuat penugasan...</p></main>;

  // Tanda selesai per langkah hanya dari bukti nyata: LKPD dari status
  // attempt (terkumpul/dinilai), Kuis RUAS dari status "completed" di RUAS
  // yang dicek API lewat endpoint internal RUAS, exit ticket dari kiriman
  // exit ticket murid itu sendiri.
  const steps: AssignmentStep[] = [
    ...(data.worksheet ? [{ id: "worksheet" as const, label: "LKPD", title: "Kerjakan LKPD", description: "Selesaikan latihan sebelum mengikuti kuis.", complete: data.attempt !== null && (data.attempt.status === "terkumpul" || data.attempt.status === "dinilai") }] : []),
    ...(data.assignment.ruas_quiz_url ? [{ id: "quiz" as const, label: "Kuis RUAS", title: "Ikuti kuis RUAS", description: "Buka asesmen melalui RUAS setelah menyelesaikan LKPD.", complete: data.ruas_quiz_completed }] : []),
    { id: "exit", label: "Exit ticket", title: "Refleksi 3-2-1", description: "Tuliskan hal yang sudah dipahami dan yang masih membingungkan.", complete: data.exit_ticket_submitted },
  ];
  const currentStepIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[currentStepIndex];
  // Ordinal tiap langkah di antara langkah yang selesai (0, 1, 2, …),
  // dipakai menjenjangkan animasi centang lewat --step-check-delay.
  let completedSeen = 0;
  const stepCheckOrdinals = steps.map((step) => (step.complete ? completedSeen++ : -1));

  return (
    <main style={styles.container}>
      <Link href="/murid" style={styles.back}>← Ruang murid</Link>
      <p style={styles.eyebrow}>SIMAK · PENUGASAN</p>
      <h1 style={styles.title}>{data.assignment.title}</h1>
      {data.assignment.instructions ? <p style={styles.instructions}><MathText text={data.assignment.instructions} /></p> : null}
      <p style={styles.meta}>Status: <strong>{submissionStatusLabel(data.assignment.progress)}</strong> · batas {formatDate(data.assignment.due_at)}</p>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      <nav className="assignment-stepper" aria-label="Urutan penugasan">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={`assignment-step ${index === currentStepIndex ? "is-active" : ""} ${step.complete ? "is-complete" : ""}`}
            style={step.complete ? ({ "--step-check-delay": `${stepCheckOrdinals[index] * 120}ms` } as CSSProperties) : undefined}
            onClick={() => setStepIndex(index)}
            aria-current={index === currentStepIndex ? "step" : undefined}
          >
            <span className="assignment-step-number">
              {step.complete ? (
                <svg className="assignment-step-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={20} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="assignment-step-copy"><strong>{step.label}</strong>{step.complete ? <span className="visually-hidden">(sudah selesai)</span> : null}<small>{step.description}</small></span>
          </button>
        ))}
      </nav>

      <section className="assignment-flow-panel">
        <p className="assignment-flow-kicker">Langkah {currentStepIndex + 1} dari {steps.length}</p>
        <h2 style={styles.heading}>{currentStep.title}</h2>
        <p style={styles.muted}>{currentStep.description}</p>

        {currentStep.id === "worksheet" && data.worksheet ? (
          <div className="assignment-flow-content">
            <p style={styles.muted}>Buka LKPD berikut dan kirimkan jawaban sesuai instruksi.</p>
            <Link href={`/murid/worksheets/${data.worksheet.id}?assignmentId=${data.assignment.id}`} className="assignment-flow-action" style={styles.actionLink}>Buka {data.worksheet.title} →</Link>
            {data.attempt?.total_score !== null && data.attempt?.total_score !== undefined ? <p style={styles.score}>Nilai LKPD: {data.attempt.total_score}</p> : null}
          </div>
        ) : null}

        {currentStep.id === "quiz" && data.assignment.ruas_quiz_url ? (
          <div className="assignment-flow-content">
            <p style={styles.muted}>Buka kuis asesmen melalui RUAS. Aktivitas pembukaan dicatat di SIMAK.</p>
            <button type="button" onClick={openRuas} style={styles.primaryButton}>Buka Kuis di RUAS</button>
          </div>
        ) : null}

        {currentStep.id === "exit" ? (
          <form onSubmit={submitExitTicket} style={styles.form}>
            <textarea required value={understood3} onChange={(event) => setUnderstood3(event.target.value)} placeholder="3 hal yang saya pahami" rows={3} style={styles.textarea} />
            <textarea required value={examples2} onChange={(event) => setExamples2(event.target.value)} placeholder="2 contoh penerapan" rows={3} style={styles.textarea} />
            <textarea required value={confusing1} onChange={(event) => setConfusing1(event.target.value)} placeholder="1 hal yang masih membingungkan" rows={3} style={styles.textarea} />
            <button type="submit" disabled={saving} style={styles.primaryButton}>{data.exit_ticket_submitted ? "Perbarui exit ticket" : "Kirim exit ticket"}</button>
          </form>
        ) : null}

        <div className="assignment-flow-navigation">
          <button type="button" className="assignment-flow-secondary" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={currentStepIndex === 0}>← Sebelumnya</button>
          {currentStepIndex < steps.length - 1 ? (
            <button type="button" className="assignment-flow-primary" onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}>Lanjut ke {steps[currentStepIndex + 1].label} →</button>
          ) : (
            <Link href="/murid" className="assignment-flow-primary">Selesai</Link>
          )}
        </div>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const styles = {
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none" },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "32px 0 8px" },
  title: { fontSize: 34, margin: 0 },
  instructions: { color: "#667085", lineHeight: 1.6 },
  meta: { color: "#475467", fontSize: 14 },
  muted: { color: "#667085", lineHeight: 1.5 },
  message: { color: "#175cd3", background: "#eff8ff", padding: 12, borderRadius: 8 },
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
  panel: { border: "1px solid #eaecf0", borderRadius: 12, padding: 18, marginTop: 20, display: "grid", gap: 12 },
  heading: { fontSize: 20, margin: 0 },
  actionLink: { color: "#175cd3", fontWeight: 700, textDecoration: "none" },
  score: { margin: 0, fontWeight: 700 },
  form: { display: "grid", gap: 10 },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700 },
};
