"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { decideBaruMarkers, readNilaiSayaBaseline } from "../../lib/nilai-saya";
import { quoteOfTheDay, salamForHour } from "../../lib/sapaan";
import { xpProgressLabel, type XpSummary } from "../../lib/xp";
import { avatarImagePath, priceLabel, stateLabel, type AvatarCatalogItem, type AvatarsResponse } from "../../lib/avatar";
import { allStepsDone, planAssignmentSteps, planReminderLevel, worksheetStatusFromProgress } from "../../lib/pengingat";
import { submissionStatusLabel } from "../lib/labels";
import { Toast } from "../../components/Toast";
import { Modal } from "../../components/Modal";

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
  cover_key: string | null;
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
  work_mode?: "individu" | "kelompok";
  group?: {
    id: number;
    name: string;
    class_name: string;
    members: { id: number; name: string; username: string }[];
  } | null;
  opens_at: string;
  due_at: string;
  progress: "belum_dibuka" | "belum" | "draf" | "terkumpul" | "dinilai" | "terlambat";
  // Bukti checklist kartu dari server: tuntas membaca modul penugasan
  // ini (catatan baca_materi_tuntas) dan exit ticket penugasan ini
  // sudah dikirim murid.
  material_completed: boolean;
  exit_ticket_submitted: boolean;
};

type TodayResponse = {
  ok: true;
  data: { classes: ClassSummary[]; modules: ModuleSummary[]; assignments: AssignmentSummary[]; has_viewed_material: boolean; needs_welcome: boolean; xp: XpSummary | null; avatar_slug: string | null };
};

type MeResponse = {
  ok: true;
  user: { display_name?: string; name?: string; username: string; role: "guru" | "murid" };
};

// Bentuk minimum endpoint Nilai Saya yang dibutuhkan titik penanda beranda:
// hanya id penugasan + waktu terbit tiap nilai.
type NilaiDotResponse = {
  ok: true;
  data: { grades: { assignment_id: number; graded_at: string }[] };
};

export default function MuridPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [data, setData] = useState<TodayResponse["data"]>({ classes: [], modules: [], assignments: [], has_viewed_material: false, needs_welcome: false, xp: null, avatar_slug: null });
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatars, setAvatars] = useState<AvatarsResponse["data"] | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarBusy, setAvatarBusy] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [studentStep, setStudentStep] = useState(0);
  const [hasNewGrades, setHasNewGrades] = useState(false);

  const studentSteps = [
    { title: "Kelas saya", description: "Gabung dan lihat kelas aktif" },
    { title: "Materi", description: "Baca materi yang diterbitkan" },
    { title: "Penugasan", description: "Kerjakan aktivitas yang tersedia" },
  ];
  // Tanda selesai langkah hanya dari syarat nyata, bukan posisi wizard:
  // Kelas saya = sudah tergabung minimal satu kelas; Materi = sudah pernah
  // membuka minimal satu materi (has_viewed_material dari catatan
  // activity_logs event "buka_materi" — sinyal yang sama dengan statistik
  // penonton guru); Penugasan = ada penugasan.
  const studentStepComplete = [
    data.classes.length > 0,
    data.has_viewed_material,
    data.assignments.length > 0,
  ];
  const displayName = user?.display_name ?? user?.name ?? "Murid";

  // Menutup sambutan (tombol "Mulai belajar", X, klik luar, Escape —
  // semuanya lewat onClose Modal) mencatat penanda ke server agar
  // tidak tampil lagi. Gagal catat tidak menghalangi penutupan; modal
  // paling-paling tampil sekali lagi pada kunjungan berikutnya.
  function dismissWelcome() {
    setWelcomeOpen(false);
    setData((current) => ({ ...current, needs_welcome: false }));
    void apiRequest("/murid/welcome/seen", { method: "POST" }).catch(() => undefined);
  }

  // Pemilih avatar: katalog + kepemilikan + saldo selalu segar dari
  // server saat modal dibuka (GET /murid/avatars). Sesudah tukar/pakai/
  // lepas berhasil, state lokal diperbarui di tempat — termasuk saldo
  // pada kartu XP beranda — tanpa memuat ulang halaman.
  async function openAvatarPicker() {
    setAvatarOpen(true);
    setAvatarMessage("");
    setAvatarError("");
    try {
      const response = await apiRequest<AvatarsResponse>("/murid/avatars");
      setAvatars(response.data);
    } catch {
      setAvatars(null);
      setAvatarError("Katalog avatar belum dapat dimuat. Coba lagi nanti.");
    }
  }

  async function redeemAvatar(item: AvatarCatalogItem) {
    setAvatarBusy(item.slug);
    setAvatarMessage("");
    try {
      const response = await apiRequest<{ ok: true; data: { slug: string; balance: number; owned: boolean } }>(
        `/murid/avatars/${item.slug}/redeem`,
        { method: "POST" },
      );
      setAvatars((current) => (current ? {
        ...current,
        balance: response.data.balance,
        catalog: current.catalog.map((entry) => (entry.slug === item.slug ? { ...entry, owned: true } : entry)),
      } : current));
      setData((current) => ({
        ...current,
        xp: current.xp ? { ...current.xp, balance: response.data.balance } : current.xp,
      }));
      setAvatarMessage(`${item.name} sekarang milikmu. Pasang lewat tombol Pakai.`);
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "Avatar belum dapat ditukar.");
    } finally {
      setAvatarBusy(null);
    }
  }

  async function equipAvatar(item: AvatarCatalogItem) {
    setAvatarBusy(item.slug);
    setAvatarMessage("");
    try {
      await apiRequest(`/murid/avatars/${item.slug}/equip`, { method: "POST" });
      setAvatars((current) => (current ? {
        ...current,
        equipped_slug: item.slug,
        catalog: current.catalog.map((entry) => ({ ...entry, equipped: entry.slug === item.slug })),
      } : current));
      setData((current) => ({ ...current, avatar_slug: item.slug }));
      setAvatarMessage(`${item.name} terpasang.`);
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "Avatar belum dapat dipasang.");
    } finally {
      setAvatarBusy(null);
    }
  }

  async function unequipAvatar() {
    setAvatarBusy("unequip");
    setAvatarMessage("");
    try {
      await apiRequest("/murid/avatars/unequip", { method: "POST" });
      setAvatars((current) => (current ? {
        ...current,
        equipped_slug: null,
        catalog: current.catalog.map((entry) => ({ ...entry, equipped: false })),
      } : current));
      setData((current) => ({ ...current, avatar_slug: null }));
      setAvatarMessage("Avatar dilepas.");
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "Avatar belum dapat dilepas.");
    } finally {
      setAvatarBusy(null);
    }
  }
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
      // Sambutan pertama: server yang memutuskan (penanda welcomed_at),
      // jadi modal ini tampil tepat sekali untuk akun ini di perangkat
      // mana pun.
      if (today.data.needs_welcome) setWelcomeOpen(true);
      setJoinOpen(today.data.classes.length === 0);
      // Titik penanda "ada nilai baru" untuk tautan Nilai Saya: satu
      // pengambilan ringan, baseline kunjungan terakhir hanya DIBACA di
      // sini (tidak pernah dimajukan — itu hak halaman Nilai Saya, supaya
      // titik tidak padam sebelum murid benar-benar membukanya). Gagal
      // ambil → tautan tetap tampil tanpa titik, tanpa pesan apa pun.
      void apiRequest<NilaiDotResponse>("/murid/nilai")
        .then((response) => {
          const decision = decideBaruMarkers(response.data.grades, readNilaiSayaBaseline(), new Date());
          setHasNewGrades(decision.baruIds.size > 0);
        })
        .catch(() => undefined);
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

      <Modal
        open={welcomeOpen}
        title={`${salamForHour(new Date().getHours())}, ${displayName}!`}
        subtitle="Selamat datang di SIMAK — ruang belajarmu"
        onClose={dismissWelcome}
        footer={(
          <button type="button" className="button button-primary" onClick={dismissWelcome}>
            Mulai belajar
          </button>
        )}
      >
        <p>
          Senang kamu ada di sini. Di SIMAK kamu membaca materi dari gurumu, mengerjakan LKPD
          bersama kelompokmu, dan melihat nilaimu bertumbuh — semua dalam satu tempat.
        </p>
        <blockquote className="welcome-quote">{quoteOfTheDay(new Date())}</blockquote>
        <p><strong>Tiga langkah belajar di SIMAK:</strong></p>
        <ol className="welcome-steps">
          <li><strong>Baca materi</strong> sampai tuntas — daftar isi di bagian atas materi membantumu melompat antar bagian.</li>
          <li><strong>Kerjakan LKPD lewat menu Penugasan</strong> — dengan begitu jawabanmu tercatat bersama kelompokmu.</li>
          <li><strong>Isi exit ticket</strong> sesudahnya — ceritakan kesan dan kesulitanmu supaya gurumu tahu cara membantumu.</li>
        </ol>
      </Modal>

      <Modal
        open={avatarOpen}
        title="Avatar saya"
        subtitle="Tukar poin XP untuk membuka avatar baru, lalu pasang yang kamu suka."
        onClose={() => setAvatarOpen(false)}
      >
        {avatarError ? <p className="avatar-error">{avatarError}</p> : null}
        {!avatars && !avatarError ? <p>Memuat katalog avatar...</p> : null}
        {avatars ? (
          <>
            <p className="avatar-balance">Saldo tukar kamu: <strong>{avatars.balance} XP</strong></p>
            <div className="avatar-grid">
              {avatars.catalog.map((item) => {
                const kurang = item.price - avatars.balance;
                return (
                  <article key={item.slug} className={`avatar-card${item.equipped ? " is-equipped" : ""}`}>
                    <img className="avatar-card-img" src={item.image_url} alt={item.name} width={72} height={72} />
                    <strong>{item.name}</strong>
                    <span className="avatar-card-state">{stateLabel(item)}</span>
                    {item.equipped ? (
                      <button type="button" className="button button-secondary" disabled>Terpasang</button>
                    ) : item.owned ? (
                      <button type="button" className="button" disabled={avatarBusy !== null} onClick={() => void equipAvatar(item)}>
                        Pakai
                      </button>
                    ) : kurang > 0 ? (
                      <button type="button" className="button button-secondary" disabled>Kurang {kurang} XP</button>
                    ) : (
                      <button type="button" className="button" disabled={avatarBusy !== null} onClick={() => void redeemAvatar(item)}>
                        {item.price === 0 ? "Ambil Gratis" : `Tukar ${priceLabel(item.price)}`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            {avatars.equipped_slug ? (
              <button type="button" className="button button-secondary avatar-unequip" disabled={avatarBusy !== null} onClick={() => void unequipAvatar()}>
                Lepas Avatar
              </button>
            ) : null}
            {avatarMessage ? <p className="avatar-note" role="status">{avatarMessage}</p> : null}
          </>
        ) : null}
      </Modal>

      <div className="container wizard-layout wizard-theme-murid">
        <aside className="wizard-sidebar" aria-label="Langkah ruang murid">
          <div className="wizard-profile">
            <span className="wizard-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <span>Ruang murid</span>
            </div>
          </div>
          {data.xp ? (
            <section className="xp-card" aria-label="Poin XP saya">
              <div className="xp-card-top">
                {data.avatar_slug ? (
                  <img
                    className="xp-card-avatar"
                    src={avatarImagePath(data.avatar_slug)}
                    alt="Avatar saya"
                    width={52}
                    height={52}
                  />
                ) : null}
                <div className="xp-card-headings">
                  <div className="xp-card-head">
                    <span aria-hidden="true">⭐</span>
                    <strong>{data.xp.total} XP</strong>
                  </div>
                  <span className="xp-card-level">{data.xp.levelName}</span>
                </div>
              </div>
              <div
                className="xp-progress-track"
                role="progressbar"
                aria-valuenow={data.xp.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Kemajuan menuju level berikutnya: ${data.xp.progressPct}%`}
              >
                <div className="xp-progress-fill" style={{ width: `${data.xp.progressPct}%` }} />
              </div>
              <span className="xp-card-note">{xpProgressLabel(data.xp)}</span>
              <span className="xp-card-balance">Saldo tukar: {data.xp.balance} XP</span>
              <button type="button" className="button button-secondary xp-card-button" onClick={() => void openAvatarPicker()}>
                Ganti Avatar
              </button>
            </section>
          ) : null}
          <nav className={`wizard-steps wizard-steps-${studentStep}`}>
            {studentSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                className={`wizard-step ${studentStep === index ? "is-active" : ""} ${studentStepComplete[index] ? "is-complete" : ""}`}
                onClick={() => setStudentStep(index)}
                aria-current={studentStep === index ? "step" : undefined}
              >
                <span className="wizard-step-number">{studentStepComplete[index] ? "✓" : index + 1}</span>
                <span><strong>{step.title}</strong><small>{step.description}</small></span>
              </button>
            ))}
          </nav>
          <Link href="/murid/nilai" className="content-card content-link" style={{ marginTop: 16 }}>
            <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Nilai Saya
              {hasNewGrades ? <span aria-label="Ada nilai baru" title="Ada nilai baru" style={{ width: 10, height: 10, borderRadius: "50%", background: "#d92d20", display: "inline-block", flexShrink: 0 }} /> : null}
            </strong>
            <span className="content-muted">Lihat semua nilai LKPD yang sudah terbit.</span>
            <span className="content-action">Buka nilai →</span>
          </Link>
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
                      {module.cover_key ? <ModuleListCover moduleId={module.id} coverKey={module.cover_key} /> : null}
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

// Thumbnail sampul pada kartu daftar materi: URL diterbitkan segar dari
// kuncinya lewat /uploads/download; selama belum terbit tidak ada yang
// dirender agar kartu tanpa sampul tidak berubah bentuk.
function ModuleListCover({ moduleId, coverKey }: { moduleId: number; coverKey: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ ok: true; data: { download_url: string } }>(
      `/uploads/download?moduleId=${moduleId}&key=${encodeURIComponent(coverKey)}`,
    )
      .then((response) => {
        if (!cancelled) setUrl(response.data.download_url);
      })
      .catch(() => {
        // Kartu tetap tampil tanpa thumbnail.
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, coverKey]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt="Sampul materi"
      style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 8, display: "block" }}
    />
  );
}

function AssignmentCard({ assignment }: { assignment: AssignmentSummary }) {
  // Checklist langkah dari bukti server pada payload kartu: ketuntasan
  // materi + exit ticket datang sebagai field /murid/today, status LKPD
  // mengikuti progres kartu (attempt efektif — kelompok memakai attempt
  // bersamanya). Exit ticket selalu berlaku karena halaman detail
  // penugasan selalu menggambar langkah itu (lib/pengingat.ts).
  const steps = planAssignmentSteps({
    hasModule: assignment.module_id !== null,
    materialCompleted: assignment.material_completed,
    hasWorksheet: assignment.worksheet_id !== null,
    worksheetStatus: assignment.worksheet_id !== null ? worksheetStatusFromProgress(assignment.progress) : null,
    hasExitTicket: true,
    exitTicketSubmitted: assignment.exit_ticket_submitted,
  });
  const reminder = planReminderLevel({ dueAt: assignment.due_at, steps, now: new Date() });
  const stepsDone = allStepsDone(steps);
  const nextStepIndex = steps.findIndex((step) => !step.done);
  // Penugasan yang sudah dinilai tidak perlu checklist: nilainya sudah
  // terbit dan tidak ada langkah yang bisa dikejar lagi dari kartu ini.
  const showSteps = assignment.progress !== "dinilai";
  return (
    <Link
      href={`/murid/assignments/${assignment.id}`}
      className={`content-card content-link${reminder.level === "mendesak" ? " assignment-card--mendesak" : ""}`}
    >
      <strong>{assignment.title}</strong>
      {assignment.work_mode === "kelompok" ? (
        <span className="group-mode-badge" style={{ alignSelf: "flex-start" }}>👥 Kelompok{assignment.group ? ` · ${assignment.group.name}` : ""}</span>
      ) : null}
      <span className="content-muted">{assignment.instructions ?? "Buka detail penugasan untuk mulai."}</span>
      {reminder.level !== "none" ? (
        <span className={`assign-reminder assign-reminder--${reminder.level}`} role="note">
          ⏰ {reminder.level === "mendesak" ? (reminder.overdue ? "Sudah lewat tenggat" : "Tenggat dekat") : "Segera tenggat"} — {reminder.missingLabels.join(" · ")}
        </span>
      ) : null}
      <span className="content-meta">Status: {submissionStatusLabel(assignment.progress)} · batas {formatDate(assignment.due_at)}</span>
      {showSteps ? (
        stepsDone ? (
          <span className="assign-steps-done">Semua langkah selesai ✓</span>
        ) : (
          <ul className="assign-steps">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className={`assign-step${step.done ? " is-done" : ""}${index === nextStepIndex ? " is-next" : ""}`}
              >
                <span className="assign-step-mark" aria-hidden="true">{step.done ? "✓" : "○"}</span>
                <span className="assign-step-label">{step.label}</span>
                {step.hint ? <span className="assign-step-hint">{step.hint}</span> : null}
                {index === nextStepIndex ? <span className="assign-step-next">Berikutnya</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      <span className="content-action">Buka penugasan →</span>
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
