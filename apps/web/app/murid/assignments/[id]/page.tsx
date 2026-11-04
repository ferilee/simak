"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "../../../../lib/api";
import { countdownParts, countdownUnits, formatSchedule, parseNotYetOpen, type NotYetOpenInfo } from "../../../../lib/halaman-tunggu";
import { submissionStatusLabel } from "../../../lib/labels";
import { Toast } from "../../../../components/Toast";
import { MathText } from "../../../../components/MathContent";

type AssignmentDetail = {
  assignment: {
    id: number;
    title: string;
    instructions: string | null;
    ruas_quiz_url: string | null;
    work_mode?: "individu" | "kelompok";
    group?: {
      id: number;
      name: string;
      class_name: string;
      members: { id: number; name: string; username: string }[];
    } | null;
    opens_at: string;
    due_at: string;
    progress: string;
  };
  worksheet: { id: number; title: string } | null;
  attempt: { status: string; total_score: number | null; submitted_at: string | null; group_total_score?: number | null; member_score?: number | null } | null;
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
  // Keadaan "belum dibuka": API menolak dengan 403 + data jadwal; halaman
  // menggambar halaman tunggu (bukan layar kosong + toast). Null = bukan
  // keadaan itu.
  const [waiting, setWaiting] = useState<NotYetOpenInfo | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [understood3, setUnderstood3] = useState("");
  const [examples2, setExamples2] = useState("");
  const [confusing1, setConfusing1] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  // Cap waktu pemeriksaan-otomatis terakhir sesudah hitung mundur nol —
  // pemeriksaan berikutnya paling cepat 30 detik kemudian (jam perangkat
  // murid bisa lebih cepat dari jam server).
  const lastAutoCheckRef = useRef(0);

  async function load() {
    try {
      const response = await apiRequest<AssignmentResponse>(`/murid/assignments/${params.id}`);
      setData(response.data);
      setWaiting(null);
    } catch (error) {
      if (error instanceof Error && error.message === "Belum masuk.") {
        router.replace("/login");
        return;
      }
      const notYetOpen = error instanceof ApiError ? parseNotYetOpen(error.status, error.data) : null;
      if (notYetOpen) {
        setWaiting(notYetOpen);
        setMessage("");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Penugasan belum dapat dimuat.");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  useEffect(() => {
    loadRef.current = load;
  });

  // Detak hitung mundur tiap detik selama halaman tunggu tampil;
  // interval dibersihkan saat keadaan tunggu berakhir / halaman ditutup.
  useEffect(() => {
    if (!waiting) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  // Hitung mundur mencapai nol → periksa ulang sendiri: bila detail kini
  // termuat, tampilan beralih mulus ke rincian penugasan. Bila server
  // masih menjawab belum-dibuka (jam perangkat lebih cepat), tetap di
  // halaman tunggu dan periksa lagi paling cepat 30 detik kemudian.
  useEffect(() => {
    if (!waiting) return;
    const targetMs = new Date(waiting.opens_at).getTime();
    if (Number.isNaN(targetMs) || targetMs - nowMs > 0) return;
    if (lastAutoCheckRef.current !== 0 && nowMs - lastAutoCheckRef.current < 30_000) return;
    lastAutoCheckRef.current = nowMs;
    void loadRef.current();
  }, [waiting, nowMs]);

  function checkAgain() {
    lastAutoCheckRef.current = Date.now();
    void load();
  }

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

  if (waiting && !data) {
    const parts = countdownParts(new Date(waiting.opens_at).getTime(), nowMs);
    const units = countdownUnits(parts);
    return (
      <main style={styles.waitingContainer}>
        <Link href="/murid" style={styles.back}>← Ruang murid</Link>
        <section style={styles.waitingCard}>
          <WaitingIllustration />
          <p style={styles.waitingEyebrow}>SIMAK · PENUGASAN</p>
          <h1 style={styles.waitingTitle}>{waiting.title}</h1>
          {waiting.subject_name ? <p style={styles.waitingSubject}>{waiting.subject_name}</p> : null}
          <p style={styles.waitingStatement}>Penugasan belum dibuka</p>
          <p style={styles.waitingCopy}>Penugasan ini baru bisa dikerjakan sesudah waktu buka di bawah. Tetap di halaman ini — penugasan akan terbuka sendiri saat waktunya tiba.</p>
          <div style={styles.waitingSchedule}>
            <p style={styles.waitingScheduleLine}>Dibuka <strong>{formatSchedule(waiting.opens_at)} WIB</strong></p>
            <p style={styles.waitingScheduleLine}>Batas pengumpulan <strong>{formatSchedule(waiting.closes_at)} WIB</strong></p>
          </div>
          {parts.passed ? (
            <p style={styles.waitingOpening}>Waktunya tiba — sedang membuka penugasan…</p>
          ) : (
            <div style={styles.countdownRow} role="timer" aria-label="Hitung mundur menuju waktu buka">
              {units.map((unit) => (
                <div key={unit.label} style={styles.countdownChip}>
                  <span style={styles.countdownValue}>{unit.value}</span>
                  <span style={styles.countdownLabel}>{unit.label}</span>
                </div>
              ))}
            </div>
          )}
          <div style={styles.waitingActions}>
            <Link href="/murid" style={styles.waitingPrimaryLink}>Kembali ke beranda</Link>
            <button type="button" onClick={checkAgain} style={styles.waitingSecondaryButton}>Cek lagi</button>
          </div>
        </section>
      </main>
    );
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
      {data.assignment.work_mode === "kelompok" ? (
        data.assignment.group ? (
          <div style={styles.groupCard}>
            <strong>👥 {data.assignment.group.name} · {data.assignment.group.class_name}</strong>
            <span>Penugasan ini dikerjakan berkelompok — LKPD dikerjakan bersama dan dikumpulkan atas nama kelompok.</span>
            <span>Anggota:</span>
            <div style={styles.groupMembers}>
              {data.assignment.group.members.map((member) => <span key={member.id} className="member-chip">{member.name}</span>)}
            </div>
          </div>
        ) : (
          <div style={styles.groupCard}>
            <strong>👥 Penugasan berkelompok</strong>
            <span>Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu.</span>
          </div>
        )
      ) : null}
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
            {data.attempt?.member_score !== null && data.attempt?.member_score !== undefined ? (
              <>
                <p style={styles.score}>Nilai kelompok: {data.attempt.group_total_score ?? data.attempt.total_score}</p>
                <p style={styles.score}>Nilaimu (disesuaikan guru): {data.attempt.member_score}</p>
              </>
            ) : data.attempt?.total_score !== null && data.attempt?.total_score !== undefined ? <p style={styles.score}>Nilai LKPD: {data.attempt.total_score}</p> : null}
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

// Ilustrasi halaman tunggu: kalender ungu SIMAK + jam teal murid, SVG
// sebaris tanpa aset eksternal — datar dan lembut seperti ilustrasi
// status ramah pada umumnya.
function WaitingIllustration() {
  return (
    <svg viewBox="0 0 220 170" style={styles.waitingIllustration} role="img" aria-label="Ilustrasi kalender dan jam">
      <rect x="30" y="28" width="128" height="118" rx="14" fill="#f5f3ff" stroke="#8b5cf6" strokeWidth="3" />
      <path d="M30 62 V42 a14 14 0 0 1 14-14 h100 a14 14 0 0 1 14 14 v20 Z" fill="#8b5cf6" />
      <rect x="52" y="18" width="10" height="22" rx="5" fill="#ffffff" stroke="#8b5cf6" strokeWidth="3" />
      <rect x="126" y="18" width="10" height="22" rx="5" fill="#ffffff" stroke="#8b5cf6" strokeWidth="3" />
      <circle cx="54" cy="86" r="6" fill="#ddd6fe" />
      <circle cx="80" cy="86" r="6" fill="#0e9384" />
      <circle cx="106" cy="86" r="6" fill="#ddd6fe" />
      <circle cx="54" cy="110" r="6" fill="#ddd6fe" />
      <circle cx="80" cy="110" r="6" fill="#ddd6fe" />
      <circle cx="106" cy="110" r="6" fill="#ddd6fe" />
      <circle cx="164" cy="120" r="37" fill="#ffffff" stroke="#0e9384" strokeWidth="5" />
      <path d="M164 98 v22 l15 9" fill="none" stroke="#0e9384" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="164" cy="120" r="4.5" fill="#8b5cf6" />
    </svg>
  );
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
  groupCard: { display: "grid", gap: 6, background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 10, padding: 14, marginTop: 16, color: "#05603a", lineHeight: 1.55, fontSize: 14 },
  groupMembers: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  heading: { fontSize: 20, margin: 0 },
  actionLink: { color: "#175cd3", fontWeight: 700, textDecoration: "none" },
  score: { margin: 0, fontWeight: 700 },
  form: { display: "grid", gap: 10 },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700 },
  // Disiplin seluler yang sama seperti halaman materi murid (v1.0.25):
  // overflowX "clip" pada wadah agar satu elemen yang kebetulan lebih
  // lebar tidak pernah membuat seluruh halaman bisa digeser menyamping.
  waitingContainer: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px", overflowX: "clip" as const },
  waitingCard: { background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 16, padding: "28px 20px 30px", marginTop: 24, display: "grid", gap: 8, justifyItems: "center" as const, textAlign: "center" as const, minWidth: 0 },
  waitingIllustration: { width: 200, maxWidth: "62vw", height: "auto" },
  waitingEyebrow: { color: "#6941c6", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "10px 0 0" },
  waitingTitle: { fontSize: 26, margin: 0, lineHeight: 1.3, overflowWrap: "anywhere" as const },
  waitingSubject: { color: "#8b5cf6", fontWeight: 700, margin: 0, overflowWrap: "anywhere" as const },
  waitingStatement: { fontSize: 18, fontWeight: 700, margin: "8px 0 0", overflowWrap: "anywhere" as const },
  waitingCopy: { color: "#667085", lineHeight: 1.6, margin: 0, maxWidth: 460, overflowWrap: "anywhere" as const },
  waitingSchedule: { display: "grid", gap: 4, marginTop: 8, color: "#475467", fontSize: 15, minWidth: 0 },
  waitingScheduleLine: { margin: 0, overflowWrap: "anywhere" as const },
  countdownRow: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" as const, justifyContent: "center" as const, minWidth: 0, maxWidth: "100%" },
  countdownChip: { background: "#ffffff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "8px 0 7px", flex: "1 1 56px", maxWidth: 76, minWidth: 0, display: "grid", gap: 2 },
  countdownValue: { fontSize: 24, fontWeight: 800, color: "#175cd3", fontVariantNumeric: "tabular-nums" as const },
  countdownLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#667085", textTransform: "uppercase" as const },
  waitingOpening: { color: "#067647", fontWeight: 700, margin: "12px 0 0", overflowWrap: "anywhere" as const },
  waitingActions: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" as const, justifyContent: "center" as const, maxWidth: "100%" },
  waitingPrimaryLink: { borderRadius: 8, background: "#175cd3", color: "white", padding: "12px 16px", minHeight: 44, fontWeight: 700, textDecoration: "none" },
  waitingSecondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "#ffffff", color: "#344054", padding: "12px 16px", minHeight: 44, fontWeight: 700, cursor: "pointer" },
};
