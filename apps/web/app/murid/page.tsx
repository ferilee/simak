"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { Toast } from "../../components/Toast";

type ClassSummary = {
  id: number;
  name: string;
  subject: string;
  academic_year: string;
};

type ModuleSummary = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  status: "terbit";
  updated_at: string;
};
type AssignmentSummary = {
  id: number;
  module_id: number | null;
  worksheet_id: number | null;
  title: string;
  instructions: string | null;
  ruas_quiz_url: string | null;
  opens_at: string;
  due_at: string;
  progress: "belum_dibuka" | "belum" | "draf" | "terkumpul" | "dinilai" | "terlambat";
};

type TodayResponse = {
  ok: true;
  data: { classes: ClassSummary[]; modules: ModuleSummary[]; assignments: AssignmentSummary[] };
};

type MeResponse = {
  ok: true;
  user: { display_name?: string; name?: string; username: string; role: "guru" | "murid" };
};

export default function MuridPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [data, setData] = useState<TodayResponse["data"]>({ classes: [], modules: [], assignments: [] });
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [studentStep, setStudentStep] = useState(0);

  const studentSteps = [
    { title: "Kelas saya", description: "Gabung dan lihat kelas aktif" },
    { title: "Materi", description: "Baca materi yang diterbitkan" },
    { title: "Penugasan", description: "Kerjakan aktivitas yang tersedia" },
  ];
  const displayName = user?.display_name ?? user?.name ?? "Murid";
  const activeAssignments = data.assignments
    .filter((assignment) => new Date(assignment.due_at).getTime() >= Date.now())
    .sort((left, right) => new Date(left.due_at).getTime() - new Date(right.due_at).getTime());
  const pastAssignments = data.assignments
    .filter((assignment) => new Date(assignment.due_at).getTime() < Date.now())
    .sort((left, right) => new Date(right.due_at).getTime() - new Date(left.due_at).getTime());

  async function load() {
    try {
      const me = await apiRequest<MeResponse>("/auth/me");
      setUser(me.user);
      if (me.user.role !== "murid") {
        setMessage("Akun ini berperan sebagai guru. Keluar dahulu lalu masuk dengan akun murid.");
        return;
      }
      const today = await apiRequest<TodayResponse>("/murid/today");
      setData(today.data);
      setJoinOpen(today.data.classes.length === 0);
    } catch (error) {
      if (error instanceof Error && error.message === "Belum masuk.") {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Data belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  useEffect(() => {
    void load();
  }, []);

  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    setMessage("");
    try {
      await apiRequest("/classes/join", {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      });
      setJoinCode("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kelas belum dapat diikuti.");
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <main className="dashboard-shell container"><p>Memuat ruang murid...</p></main>;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header dashboard-header-murid container">
        <div>
          <Link className="brand" href="/" aria-label="SIMAK beranda">
            <span className="brand-mark" aria-hidden="true">S</span>
            SIMAK
          </Link>
          <p className="eyebrow" style={{ marginTop: 28 }}>Ruang murid</p>
          <h1 className="dashboard-title">Halo, {displayName}</h1>
          <p className="dashboard-subtitle">Ikuti langkah belajar Anda dari satu ruang yang terarah.</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" onClick={() => void logout()} className="button button-secondary dashboard-logout-murid" aria-label="Keluar" title="Keluar">
            <svg className="dashboard-logout-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
            </svg>
            <span className="dashboard-logout-label">Keluar</span>
          </button>
        </div>
      </header>

      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      <div className="container wizard-layout wizard-theme-murid">
        <aside className="wizard-sidebar" aria-label="Langkah ruang murid">
          <div className="wizard-profile">
            <span className="wizard-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <span>Ruang murid</span>
            </div>
          </div>
          <nav className={`wizard-steps wizard-steps-${studentStep}`}>
            {studentSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                className={`wizard-step ${studentStep === index ? "is-active" : ""} ${studentStep > index ? "is-complete" : ""}`}
                onClick={() => setStudentStep(index)}
                aria-current={studentStep === index ? "step" : undefined}
              >
                <span className="wizard-step-number">{studentStep > index ? "✓" : index + 1}</span>
                <span><strong>{step.title}</strong><small>{step.description}</small></span>
              </button>
            ))}
          </nav>
          <p className="wizard-side-note">Selesaikan langkah belajar sesuai kebutuhan Anda. Anda dapat berpindah langkah kapan saja.</p>
        </aside>

        <section className="wizard-main" aria-label="Isi ruang murid">
          <div className="wizard-main-heading">
            <div>
              <p className="eyebrow">Langkah {studentStep + 1} dari {studentSteps.length}</p>
              <h2>{studentSteps[studentStep].title}</h2>
              <p>{studentSteps[studentStep].description}.</p>
            </div>
            <span className="wizard-role-chip">Murid</span>
          </div>

          {studentStep === 0 ? (
            <div className="wizard-step-content">
              <section className="dashboard-section wizard-inner-section">
                <div className="dashboard-section-heading">
                  <div>
                    <h3>Kelas saya</h3>
                    <span>{data.classes.length} kelas aktif</span>
                  </div>
                  {data.classes.length > 0 && !joinOpen ? (
                    <button type="button" className="button button-secondary join-class-trigger" onClick={() => setJoinOpen(true)}>
                      + Gabung kelas
                    </button>
                  ) : null}
                </div>
                {joinOpen ? (
                  <form onSubmit={joinClass} className="join-panel wizard-join-panel">
                    <label htmlFor="join-code">Gabung kelas</label>
                    <div className="join-row">
                      <input
                        id="join-code"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                        placeholder="Masukkan kode kelas"
                        maxLength={12}
                        required
                        className="dashboard-input"
                      />
                      <button type="submit" disabled={joining} className="button">
                        {joining ? "..." : "Gabung"}
                      </button>
                    </div>
                    {data.classes.length > 0 ? (
                      <button type="button" className="button button-secondary join-class-close" onClick={() => setJoinOpen(false)}>
                        Tutup
                      </button>
                    ) : null}
                  </form>
                ) : null}
                {data.classes.length === 0 ? (
                  <p className="empty-state">Belum ada kelas. Masukkan kode kelas dari guru untuk bergabung.</p>
                ) : (
                  <div className="content-grid">
                    {data.classes.map((kelas) => (
                      <article key={kelas.id} className="content-card">
                        <strong>{kelas.name}</strong>
                        <span className="content-muted">{kelas.subject} · {kelas.academic_year}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {studentStep === 2 ? (
            <section className="wizard-step-content">
              <div className="dashboard-section-heading">
                <h3>Penugasan aktif</h3>
                <span>{activeAssignments.length} penugasan</span>
              </div>
              {activeAssignments.length > 0 ? (
                <div className="content-list">
                  {activeAssignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
                </div>
              ) : <p className="empty-state">{pastAssignments.length > 0 ? "Tidak ada penugasan aktif saat ini." : "Belum ada penugasan untuk kelas Anda."}</p>}
              {pastAssignments.length > 0 ? (
                <details className="assignment-history">
                  <summary>
                    <strong>Riwayat penugasan</strong>
                    <span>{pastAssignments.length} tugas</span>
                  </summary>
                  <div className="content-list">
                    {pastAssignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}

          {studentStep === 1 ? (
            <section className="wizard-step-content">
              <div className="dashboard-section-heading">
                <h3>Materi terbit</h3>
                <span>{data.modules.length} materi</span>
              </div>
              {data.modules.length === 0 ? (
                <p className="empty-state">Belum ada materi terbit untuk kelas Anda.</p>
              ) : (
                <div className="content-list">
                  {data.modules.map((module) => (
                    <Link key={module.id} href={`/murid/modules/${module.id}`} className="content-card content-link">
                      <span className="content-label">{module.subject}</span>
                      <strong>{module.title}</strong>
                      <span className="content-muted">{module.description ?? "Materi pembelajaran SIMAK."}</span>
                      <span className="content-action">Baca materi →</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <footer className="wizard-footer">
            <button type="button" className="button button-secondary" onClick={() => setStudentStep((current) => Math.max(0, current - 1))} disabled={studentStep === 0}>← Sebelumnya</button>
            <button type="button" className="button" onClick={() => setStudentStep((current) => Math.min(studentSteps.length - 1, current + 1))} disabled={studentStep === studentSteps.length - 1}>{studentStep === studentSteps.length - 1 ? "Selesai" : "Lanjutkan →"}</button>
          </footer>
        </section>
      </div>
    </main>
  );
}

function AssignmentCard({ assignment }: { assignment: AssignmentSummary }) {
  return (
    <Link href={`/murid/assignments/${assignment.id}`} className="content-card content-link">
      <strong>{assignment.title}</strong>
      <span className="content-muted">{assignment.instructions ?? "Buka detail penugasan untuk mulai."}</span>
      <span className="content-meta">Status: {assignment.progress} · batas {formatDate(assignment.due_at)}</span>
      <span className="content-action">Buka penugasan →</span>
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
