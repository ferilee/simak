"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { decideBaruMarkers, readNilaiSayaBaseline } from "../../lib/nilai-saya";
import { quoteOfTheDay, salamForHour } from "../../lib/sapaan";
import { XP_EARN_WAYS, XP_INFO_NOTE, XP_INFO_TITLE, xpProgressLabel, type XpSummary } from "../../lib/xp";
import { avatarImagePath, priceLabel, stateLabel, type AvatarCatalogItem, type AvatarsResponse } from "../../lib/avatar";
import { allStepsDone, planAssignmentSteps, planReminderLevel, worksheetStatusFromProgress } from "../../lib/pengingat";
import { circleAriaLabel, initialPagerIndex, planCircle } from "../../lib/navigasi-tugas";
import { ARCHIVE_GROUP_NAME, MATERIAL_FILTERS, guidedGroupName, planGuidedMaterials, shouldShowHero, type GuidedModule, type GuidedMaterialsPlan, type MaterialFilter } from "../../lib/materi-terpandu";
import { assessmentStatusLabel, type AssessmentCardData, type HubData } from "../../lib/hub-murid";
import { kelasChip, progresChip, type MuridSectionChip } from "../../lib/beranda-murid";
import { submissionStatusLabel } from "../lib/labels";
import { Toast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { MuridBottomNav, type MuridTab } from "../../components/MuridBottomNav";

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
  // Kelompok materi mentah (modules.topic_group) — dasar pengelompokan
  // daftar materi terpandu (v1.0.65); null = belum berkelompok.
  topic_group: string | null;
  description: string | null;
  cover_key: string | null;
  status: "terbit";
  updated_at: string;
  // Penanda kunci berurutan dari server (aturan modul lib/rantai-
  // penugasan): terkunci hanya bila semua penugasan bermodul ini yang
  // menjadi sasaran murid terkunci; locked_by_title = penghambatnya.
  locked: boolean;
  locked_by_title: string | null;
  // Penanda tuntas per modul dari server (catatan baca_materi_tuntas
  // murid ini untuk modul ini) — dasar hero, progres kelompok, dan
  // arsip "Sudah tuntas" pada daftar materi terpandu.
  material_completed: boolean;
};

// Bentuk masukan perencana daftar materi terpandu (lib/materi-
// terpandu): field payload di atas diterjemahkan sekali di sini,
// field gambar kartu (deskripsi + sampul) ikut terbawa apa adanya.
type MaterialCardData = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  cover_key: string | null;
  topicGroup: string | null;
  materialCompleted: boolean;
  locked: boolean;
  lockedByTitle: string | null;
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
    members: { id: number; name: string; username: string; avatar_slug: string | null; avatar_emoji: string | null }[];
  } | null;
  opens_at: string;
  due_at: string;
  progress: "belum_dibuka" | "belum" | "draf" | "terkumpul" | "dinilai" | "terlambat";
  // Bukti checklist kartu dari server: tuntas membaca modul penugasan
  // ini (catatan baca_materi_tuntas) dan exit ticket penugasan ini
  // sudah dikirim murid.
  material_completed: boolean;
  exit_ticket_submitted: boolean;
  // Rencana urutan + kunci berurutan dari server (lib/rantai-penugasan
  // di API): posisi pada urutan global daftar murid ini, label ATP
  // modul, kunci rantai, keadaan selesai, dan keadaan kunci beserta
  // judul penghambatnya. Klien hanya menggambar ulang field ini.
  position: number | null;
  atp_label: string | null;
  chain_key: string | null;
  completed: boolean;
  locked: boolean;
  locked_by_title: string | null;
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

// Ringkasan hub beranda (Hub Murid Tahap 2): kartu asesmen RUAS +
// progres per rantai dari GET /murid/asesmen. XP tidak ikut di sini —
// kartu XP sidebar membaca ringkasan dari /murid/today seperti biasa.
type HubResponse = {
  ok: true;
  data: HubData;
};

// Ringkasan jurnal beranda (Hub Murid Tahap 3): jumlah entri + entri
// terakhir murid dari GET /murid/jurnal?limit=1 — cukup untuk kartu
// ajakan menulis; isi lengkapnya di halaman /murid/jurnal.
export default function MuridPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [data, setData] = useState<TodayResponse["data"]>({ classes: [], modules: [], assignments: [], has_viewed_material: false, needs_welcome: false, xp: null, avatar_slug: null });
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [xpInfoOpen, setXpInfoOpen] = useState(false);
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
  const [hasNewGrades, setHasNewGrades] = useState(false);
  const [activeTab, setActiveTab] = useState<MuridTab>("dashboard");
  // Hub Tahap 2: null = belum termuat/gagal muat (bagian tampil sebagai
  // catatan lembut); available:false dari server = jembatan RUAS belum
  // aktif. Keduanya tidak pernah menghalangi beranda.
  const [hub, setHub] = useState<HubData | null>(null);
  const [handoffBusy, setHandoffBusy] = useState<string | null>(null);
  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab === "materi" || requestedTab === "penugasan") setActiveTab(requestedTab);
  }, []);
  const studentStep = activeTab === "dashboard" ? 0 : activeTab === "materi" ? 1 : 2;
  const tabHeading = activeTab === "dashboard"
    ? { title: "Dashboard", description: "Lihat kelas dan progres belajar Anda" }
    : activeTab === "materi"
      ? { title: "Materi", description: "Baca materi yang diterbitkan" }
      : { title: "Penugasan", description: "Kerjakan aktivitas yang tersedia" };
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
  // Pager penugasan: daftar tampil PERSIS dalam urutan global dari
  // server (rantai ATP + kunci berurutan) — klien tidak menyaring
  // tenggat dan tidak mengurutkan ulang, karena penugasan penghambat
  // yang sudah lewat tenggat pun harus tetap terjangkau lingkarannya
  // agar murid bisa menyelesaikannya dan membuka tugas berikutnya.
  // Pemisahan aktif/riwayat lama digantikan pager ini: tugas selesai
  // tetap dapat dibuka dari lingkarannya untuk dibaca ulang.
  const [pagerIndex, setPagerIndex] = useState<number | null>(null);
  const pagerAssignments = data.assignments;
  const defaultPagerIndex = initialPagerIndex(pagerAssignments);
  const currentPagerIndex = pagerAssignments.length === 0
    ? -1
    : Math.max(0, Math.min(pagerIndex ?? defaultPagerIndex, pagerAssignments.length - 1));
  const currentAssignment = currentPagerIndex >= 0 ? pagerAssignments[currentPagerIndex] : undefined;

  // Daftar materi TERPANDU (v1.0.65): rencana gambar dihitung murni
  // oleh lib/materi-terpandu dari daftar modul server — hero "Materi
  // berikutnya untukmu", pengelompokan per kelompok materi + progres,
  // arsip "Sudah tuntas", saringan, dan pencarian semuanya sisi klien
  // di atas data yang sudah dimuat. Urutan daftar dari server TIDAK
  // diubah dan keadaan per modul (tuntas/terkunci) TIDAK dihitung
  // ulang di sini — server satu-satunya sumber kebenaran.
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>("semua");
  const [materialQuery, setMaterialQuery] = useState("");
  const [archiveOpenOverride, setArchiveOpenOverride] = useState<boolean | null>(null);
  const materialInputs: MaterialCardData[] = data.modules.map((module) => ({
    id: module.id,
    title: module.title,
    subject: module.subject,
    description: module.description,
    cover_key: module.cover_key,
    topicGroup: module.topic_group,
    materialCompleted: module.material_completed,
    locked: module.locked,
    lockedByTitle: module.locked_by_title,
  }));
  const guidedPlan = planGuidedMaterials(materialInputs, materialFilter, materialQuery);
  const archiveOpen = archiveOpenOverride ?? guidedPlan.archiveOpenByDefault;

  // Chip status kepala kartu bagian beranda (calon v1.0.74,
  // lib/beranda-murid): diturunkan dari data yang sudah dimuat tiap
  // bagian itu sendiri — tanpa panggilan data baru.
  const kelasSectionChip = kelasChip(data.classes.length);
  const progresSectionChip = progresChip(data.xp?.total ?? null);

  // Mengganti saringan/kata cari membatalkan timpaan buka-tutup arsip:
  // keterbukaan arsip kembali mengikuti bawaan rencana (saringan
  // "tuntas" atau pencarian yang berbuah di arsip membukanya).
  function changeMaterialFilter(next: MaterialFilter) {
    setMaterialFilter(next);
    setArchiveOpenOverride(null);
  }

  function changeMaterialQuery(next: string) {
    setMaterialQuery(next);
    setArchiveOpenOverride(null);
  }

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
      // Ringkasan hub (asesmen + progres) dimuat menyusul dan gagal-
      // lembut: kegagalannya hanya mengosongkan kedua bagian hub.
      void apiRequest<HubResponse>("/murid/asesmen")
        .then((response) => setHub(response.data))
        .catch(() => setHub(null));
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

  // Serah-terima ke RUAS: server menerbitkan URL penukaran sekali
  // pakai, peramban dialihkan ke sana dan murid mendarat di RUAS sudah
  // masuk. Kartu asesmen membawa target topiknya (langsung ke halaman
  // asesmen); tanpa kartu, targetnya dashboard RUAS. Kegagalan apa pun
  // berakhir pada satu pesan ramah yang sama — tanpa rincian teknis.
  async function openRuas(card?: AssessmentCardData) {
    setHandoffBusy(card ? `topik-${card.topic_id}` : "dashboard");
    try {
      const response = await apiRequest<{ ok: true; data: { url: string } }>("/murid/handoff", {
        method: "POST",
        body: JSON.stringify(card ? { topic_id: card.topic_id, ...(card.subject_id !== null ? { subject_id: card.subject_id } : {}) } : {}),
      });
      window.location.href = response.data.url;
    } catch {
      setMessage("RUAS belum bisa dibuka otomatis — buka RUAS seperti biasa.");
      setHandoffBusy(null);
    }
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

      <div className="container murid-app-shell wizard-theme-murid">
        <aside className="wizard-sidebar murid-profile-sidebar" aria-label="Profil ruang murid">
          <div className="wizard-profile">
            <span className="wizard-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <span>Ruang murid</span>
            </div>
          </div>
          {data.xp ? (
            <section className="xp-card" aria-label="Poin XP saya">
              <button
                type="button"
                className="xp-info-button"
                aria-label="Info cara mendapat XP"
                aria-expanded={xpInfoOpen}
                onClick={() => setXpInfoOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="1.4" fill="currentColor" />
                </svg>
              </button>
              {xpInfoOpen ? (
                <>
                  <div className="xp-info-backdrop" onClick={() => setXpInfoOpen(false)} aria-hidden="true" />
                  <div className="xp-info-popover" role="dialog" aria-label={XP_INFO_TITLE}>
                    <div className="xp-info-popover-head">
                      <strong>{XP_INFO_TITLE}</strong>
                      <button type="button" className="xp-info-close" aria-label="Tutup info XP" onClick={() => setXpInfoOpen(false)}>×</button>
                    </div>
                    <ul className="xp-info-list">
                      {XP_EARN_WAYS.map((way) => (
                        <li key={way.event}>
                          <span>{way.label}</span>
                          <strong>+{way.points} XP</strong>
                        </li>
                      ))}
                    </ul>
                    <p className="xp-info-note">{XP_INFO_NOTE}</p>
                  </div>
                </>
              ) : null}
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
          <nav className="murid-desktop-nav" aria-label="Menu ruang murid">
            <Link className={activeTab === "dashboard" ? "is-active" : ""} href="/murid">Dashboard</Link>
            <Link className={activeTab === "materi" ? "is-active" : ""} href="/murid?tab=materi">Materi</Link>
            <Link className={activeTab === "penugasan" ? "is-active" : ""} href="/murid?tab=penugasan">Penugasan</Link>
            <Link className={activeTab === "nilai" ? "is-active" : ""} href="/murid/nilai">Nilai saya</Link>
            <Link className={activeTab === "jurnal" ? "is-active" : ""} href="/murid/jurnal">Jurnal belajar</Link>
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

        <section className="wizard-main murid-tab-main" aria-label="Isi ruang murid">
          <div className="wizard-main-heading">
            <div>
              <p className="eyebrow">Ruang murid</p>
              <h2>{tabHeading.title}</h2>
              <p>{tabHeading.description}.</p>
            </div>
            <span className="wizard-role-chip">Murid</span>
          </div>

          {studentStep === 0 ? (
            <div className="wizard-step-content">
              <section className="murid-home-card murid-home-card--kelas">
                <div className="murid-home-card-head">
                  <span className="murid-home-card-icon murid-home-card-icon--kelas" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </span>
                  <div className="murid-home-card-titles">
                    <h3>Kelas saya</h3>
                    <span>{data.classes.length} kelas aktif</span>
                  </div>
                  <div className="murid-home-card-side">
                    <MuridSectionChipPill chip={kelasSectionChip} />
                    {data.classes.length > 0 && !joinOpen ? (
                      <button type="button" className="button button-secondary join-class-trigger" onClick={() => setJoinOpen(true)}>
                        + Gabung kelas
                      </button>
                    ) : null}
                  </div>
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

              <section className="murid-home-card murid-home-card--progres">
                <div className="murid-home-card-head">
                  <span className="murid-home-card-icon murid-home-card-icon--progres" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                  </span>
                  <div className="murid-home-card-titles">
                    <h3>Progres belajar</h3>
                    <span>{hub ? `${hub.progress.length} rangkaian materi` : "Memuat progres..."}</span>
                  </div>
                  <div className="murid-home-card-side">
                    <MuridSectionChipPill chip={progresSectionChip} />
                  </div>
                </div>
                {data.xp ? (
                  <p className="content-muted">⭐ {data.xp.total} XP · Level {data.xp.levelName}</p>
                ) : null}
                {!hub || hub.progress.length === 0 ? (
                  <p className="empty-state">Belum ada rangkaian materi yang berjalan. Progres belajarmu tampil di sini mengikuti penugasan dari gurumu.</p>
                ) : (
                  <div className="content-list">
                    {hub.progress.map((chain) => (
                      <article key={chain.chain_key} className="content-card">
                        <span className="content-label">{chain.subject}</span>
                        <strong>{chain.topic_group}</strong>
                        <div
                          className="material-progress-track"
                          role="progressbar"
                          aria-valuenow={chain.materials_pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Progres materi ${chain.topic_group}: ${chain.materials_completed} dari ${chain.materials_total} tuntas`}
                        >
                          <div className="material-progress-fill" style={{ width: `${chain.materials_pct}%` }} />
                        </div>
                        <span className="content-muted">
                          Materi {chain.materials_completed} dari {chain.materials_total} tuntas · LKPD {chain.lkpd_submitted} dari {chain.lkpd_total} terkumpul · {chain.lkpd_graded} dinilai
                        </span>
                        {chain.assessment ? (
                          <span className="content-muted">
                            Asesmen RUAS: {chain.assessment.title ?? `Topik #${chain.assessment.topic_id}`}
                            {chain.assessment.status ? ` · ${assessmentStatusLabel(chain.assessment.status)}` : ""}
                            {chain.assessment.score !== null ? ` · Skor ${chain.assessment.score}` : ""}
                          </span>
                        ) : null}
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
                <span>{pagerAssignments.length} penugasan</span>
              </div>
              {currentAssignment ? (
                <>
                  {currentAssignment.locked ? (
                    <LockedAssignmentCard assignment={currentAssignment} />
                  ) : (
                    <AssignmentCard assignment={currentAssignment} />
                  )}
                  {pagerAssignments.length > 1 ? (
                    <nav className="assignment-pager" aria-label="Navigasi tugas">
                      {pagerAssignments.map((assignment, index) => {
                        const circle = planCircle(assignment, index === currentPagerIndex);
                        const position = assignment.position ?? index + 1;
                        return (
                          <button
                            key={assignment.id}
                            type="button"
                            className={`assignment-pager-dot tone-${circle.tone}${circle.current ? " is-current" : ""}`}
                            onClick={() => setPagerIndex(index)}
                            aria-label={circleAriaLabel(position, assignment.title, assignment)}
                            aria-current={circle.current ? "true" : undefined}
                            title={assignment.title}
                          >
                            {circle.glyph === "check" ? "✓" : circle.glyph === "lock" ? "🔒" : position}
                          </button>
                        );
                      })}
                    </nav>
                  ) : null}
                </>
              ) : <p className="empty-state">Belum ada penugasan untuk kelas Anda.</p>}
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
                <>
                  <div className="material-controls">
                    <div className="material-filter-chips" role="group" aria-label="Saring materi menurut ketuntasan">
                      {MATERIAL_FILTERS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`material-filter-chip${materialFilter === item.key ? " is-active" : ""}`}
                          aria-pressed={materialFilter === item.key}
                          onClick={() => changeMaterialFilter(item.key)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="search"
                      className="dashboard-input material-search"
                      value={materialQuery}
                      onChange={(event) => changeMaterialQuery(event.target.value)}
                      placeholder="Cari judul materi…"
                      aria-label="Cari judul materi"
                    />
                  </div>

                  {shouldShowHero(guidedPlan, materialFilter, materialQuery) ? (
                    <MaterialHero plan={guidedPlan} />
                  ) : null}

                  {guidedPlan.visibleTotal === 0 ? (
                    <p className="empty-state">
                      {materialQuery.trim()
                        ? `Tidak ada materi yang cocok dengan “${materialQuery.trim()}”. Coba kata kunci lain atau longgarkan saringannya.`
                        : "Tidak ada materi pada saringan ini. Coba saringan lain di atas."}
                    </p>
                  ) : (
                    <>
                      {guidedPlan.groups.map((section) => {
                        const progressPct = section.totalCount === 0 ? 0 : Math.round((section.completedCount / section.totalCount) * 100);
                        return (
                          <div key={section.key} className="material-group">
                            <div className="material-group-head">
                              <h4>{section.groupName}</h4>
                              <span>{section.completedCount} dari {section.totalCount} tuntas</span>
                            </div>
                            <div
                              className="material-progress-track"
                              role="progressbar"
                              aria-valuenow={progressPct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Progres kelompok ${section.groupName}: ${section.completedCount} dari ${section.totalCount} tuntas`}
                            >
                              <div className="material-progress-fill" style={{ width: `${progressPct}%` }} />
                            </div>
                            <div className="content-list">
                              {section.modules.map((module) => (
                                <GuidedModuleCard key={module.id} module={module} />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {materialFilter !== "belum" && guidedPlan.archiveTotal > 0 && (guidedPlan.archive.length > 0 || !materialQuery.trim()) ? (
                        <div className="material-archive">
                          <button
                            type="button"
                            className="material-archive-toggle"
                            aria-expanded={archiveOpen}
                            onClick={() => setArchiveOpenOverride(!archiveOpen)}
                          >
                            <span>Sudah tuntas ({guidedPlan.archiveTotal})</span>
                            <span aria-hidden="true">{archiveOpen ? "▾" : "▸"}</span>
                          </button>
                          {archiveOpen ? (
                            <div className="content-list">
                              {guidedPlan.archive.map((module) => (
                                <GuidedModuleCard key={module.id} module={module} inArchive />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </section>
          ) : null}

        </section>
      </div>
      <MuridBottomNav active={activeTab} hasNewGrades={hasNewGrades} />
    </main>
  );
}

// Pil chip status di kepala kartu bagian beranda (calon v1.0.74):
// menggambar chip dari lib/beranda-murid apa adanya — chip null
// (bagian belum termuat/belum terhubung) tidak merender apa pun.
function MuridSectionChipPill({ chip }: { chip: MuridSectionChip | null }) {
  if (!chip) return null;
  return <span className={`murid-home-chip murid-home-chip--${chip.tone}`}>{chip.label}</span>;
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

// Kartu hero daftar materi terpandu (v1.0.65): menunjuk SATU materi
// yang memang giliran murid ini — modul belum-tuntas + tidak-terkunci
// paling awal pada urutan server — agar murid tidak perlu memilih
// sendiri dari daftar yang panjang. Bila semua materi terbuka sudah
// tuntas, hero menjadi pesan ramah (tanpa tombol; materi terkunci
// berikutnya hanya disebut sebagai info karena membukanya memang
// akan ditolak server). Bila semuanya terkunci, hero menjelaskan
// penghambatnya. Pilihan modulnya dari lib/materi-terpandu; komponen
// ini hanya menggambar keadaannya.
function MaterialHero({ plan }: { plan: GuidedMaterialsPlan<MaterialCardData> }) {
  if (plan.heroState === "next" && plan.hero) {
    const hero = plan.hero;
    const groupName = guidedGroupName(hero.topicGroup);
    const meta = [hero.atpLabel, groupName !== ARCHIVE_GROUP_NAME ? groupName : null, hero.subject]
      .filter((part): part is string => part !== null && part !== "")
      .join(" · ");
    return (
      <article className="material-hero">
        <span className="material-hero-label">📖 Materi berikutnya untukmu</span>
        <strong className="material-hero-title">{hero.title}</strong>
        {meta ? <span className="material-hero-meta">{meta}</span> : null}
        {hero.description ? <span className="content-muted">{hero.description}</span> : null}
        <Link href={`/murid/modules/${hero.id}`} className="button material-hero-button">
          Lanjutkan
        </Link>
      </article>
    );
  }
  if (plan.heroState === "all-done") {
    return (
      <article className="material-hero material-hero--notice">
        <span className="material-hero-label">🎉 Semua materi terbuka sudah tuntas</span>
        <p className="assignment-locked-note">
          Kerja bagus — semua materi yang bisa kamu baca sudah kamu tuntaskan. Materi yang sudah
          tuntas tetap bisa dibaca ulang dari bagian Sudah tuntas di bawah.
        </p>
        {plan.nextLocked ? (
          <p className="assignment-locked-note">
            Materi berikutnya, <strong>{plan.nextLocked.title}</strong>, masih terkunci — selesaikan
            dulu: <strong>{plan.nextLocked.lockedByTitle ?? "penugasan sebelumnya"}</strong>.
          </p>
        ) : null}
      </article>
    );
  }
  if (plan.heroState === "all-locked") {
    return (
      <article className="material-hero material-hero--notice">
        <span className="material-hero-label">🔒 Semua materi masih terkunci</span>
        <p className="assignment-locked-note">
          Selesaikan dulu: <strong>{plan.nextLocked?.lockedByTitle ?? "penugasan sebelumnya"}</strong>,
          baru materi terbuka satu per satu mengikuti urutannya.
        </p>
      </article>
    );
  }
  return null;
}

// Satu kartu modul pada daftar materi terpandu. Modul terkunci
// digambar sebagai kartu bertanda kunci BUKAN tautan (penegakan
// server v1.0.63 menolak bukanya juga); modul tuntas hanya tinggal di
// arsip (redup + lencana Tuntas, tetap tautan untuk dibaca ulang —
// dan tetap tunduk pada kunci bila ternyata terkunci); modul isi
// hero berlencana "Giliranmu" juga di sini. Penanda status dibatasi
// keadaan yang datanya ada: Tuntas / Terkunci / Giliranmu / tanpa
// penanda (belum mulai).
function GuidedModuleCard({ module, inArchive = false }: { module: GuidedModule<MaterialCardData>; inArchive?: boolean }) {
  return module.locked ? (
    <article className="content-card assignment-card--locked">
      {module.cover_key ? <ModuleListCover moduleId={module.id} coverKey={module.cover_key} /> : null}
      <span className="content-label">{module.subject}</span>
      <strong>{module.title}</strong>
      <span className="content-muted">{module.description ?? "Materi pembelajaran SIMAK."}</span>
      {module.materialCompleted ? <span className="material-done-badge">✓ Sudah tuntas</span> : null}
      <span className="assignment-locked-note">
        🔒 Terkunci{module.lockedByTitle ? <> — selesaikan dulu: <strong>{module.lockedByTitle}</strong></> : ""}
      </span>
    </article>
  ) : (
    <Link href={`/murid/modules/${module.id}`} className={`content-card content-link${inArchive ? " material-card--completed" : ""}`}>
      {module.cover_key ? <ModuleListCover moduleId={module.id} coverKey={module.cover_key} /> : null}
      <span className="content-label">{module.subject}</span>
      <strong>{module.title}</strong>
      <span className="content-muted">{module.description ?? "Materi pembelajaran SIMAK."}</span>
      {module.atpLabel || module.isHero || inArchive ? (
        <span className="material-card-badges">
          {module.atpLabel ? <span className="material-atp-badge">{module.atpLabel}</span> : null}
          {module.isHero ? <span className="material-turn-badge">Giliranmu</span> : null}
          {inArchive ? <span className="material-done-badge">✓ Tuntas</span> : null}
        </span>
      ) : null}
      <span className="content-action">{inArchive ? "Baca lagi →" : "Baca materi →"}</span>
    </Link>
  );
}

// Varian kartu untuk penugasan TERKUNCI (kunci berurutan): hanya
// judul, label ATP, tenggat, dan penjelasan penghambatnya — sengaja
// BUKAN tautan dan tanpa tombol buka materi/LKPD, karena server pun
// menolak aksesnya sampai penghambat selesai. Murid berpindah ke
// tugas penghambat lewat lingkaran navigasi di bawah kartu.
function LockedAssignmentCard({ assignment }: { assignment: AssignmentSummary }) {
  return (
    <article className="content-card assignment-card--locked" aria-label={`Penugasan terkunci: ${assignment.title}`}>
      <span className="assignment-locked-badge">🔒 Terkunci</span>
      <strong>{assignment.title}</strong>
      {assignment.atp_label ? <span className="content-label">{assignment.atp_label}</span> : null}
      <span className="content-meta">Batas {formatDate(assignment.due_at)}</span>
      <p className="assignment-locked-note">
        {assignment.locked_by_title ? (
          <>Selesaikan dulu: <strong>{assignment.locked_by_title}</strong>, baru tugas ini terbuka.</>
        ) : (
          "Selesaikan dulu penugasan sebelumnya, baru tugas ini terbuka."
        )}
      </p>
    </article>
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
