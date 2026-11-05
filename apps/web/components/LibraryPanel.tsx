"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { apiRequest } from "../lib/api";
import {
  approvalDecisionPath,
  approvalEntryMeta,
  approvalKindLabel,
  approvalTarikPath,
  approvalToLibraryEntry,
  contributorBarPercent,
  contributorChipLabel,
  copiedDraftHref,
  copyConfirmText,
  coverGradient,
  coverInitial,
  formatRequestedDate,
  formatSharedDate,
  isSudahDisalin,
  kontributorBadgeLabel,
  libraryEntryMeta,
  libraryKindLabel,
  libraryStatsChips,
  pickPopular,
  resolveSelectedContributor,
  salinanCountLabel,
  tarikConfirmText,
  topContributors,
  SUDAH_DISALIN_LABEL,
  type ApprovalEntry,
  type ContributorSummary,
  type LibraryEntry,
  type LibraryKindFilter,
  type LibraryStats,
} from "../lib/perpustakaan";
import { ModuleBlockPreview, type ModulePreviewBlockData } from "./ModuleBlockPreview";
import { MathText } from "./MathContent";
import { Toast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";

// Perpustakaan Bersama (Fase 1, v1.0.41): katalog materi + LKPD yang
// dibagikan GURU LAIN. Guru menelusuri, mempratinjau (blok dirender dengan
// perender yang sama seperti pratinjau pemilik; butir LKPD tampil lengkap
// dengan kuncinya — permukaan khusus guru), lalu menyalin item ke akunnya
// sebagai Draf miliknya sendiri. Materi sendiri tidak pernah tampil di
// sini; API menegakkan itu, panel hanya merender.
//
// Panel ini tinggal di bilah kanan cangkang ruang guru (bukan halaman
// sendiri): cangkang memasangnya pada kunjungan pertama dan tidak pernah
// melepasnya, jadi keadaan cari/saring/gulirnya utuh saat guru bolak-balik
// antarlangkah. Rute lama /guru/perpustakaan hanya mengalihkan ke sini.

type LibraryResponse = {
  ok: true;
  data: LibraryEntry[];
  approver?: boolean;
  pending_count?: number;
  contributors?: ContributorSummary[];
  stats?: LibraryStats;
};
type ApprovalsResponse = { ok: true; data: ApprovalEntry[] };
type MeResponse = {
  ok: true;
  user: { display_name?: string; name?: string; username?: string; role: "guru" | "murid" };
};

type LibraryModulePreview = {
  kind: "module";
  id: number;
  title: string;
  subject: string;
  description: string | null;
  cover_key: string | null;
  owner_name: string;
  shared_at: string | null;
  blocks: ModulePreviewBlockData[];
  worksheets: { id: number; title: string; item_count: number; total_points: number }[];
};

type LibraryWorksheetPreviewItem = {
  id: number;
  sort_order: number;
  item_type: string;
  prompt: string;
  options: Record<string, unknown> | null;
  answer_key: string | null;
  explanation: string | null;
  points: number;
  rubric_max: number;
};

type LibraryWorksheetPreview = {
  kind: "worksheet";
  id: number;
  title: string;
  instructions: string | null;
  subject: string | null;
  module_id: number | null;
  owner_name: string;
  shared_at: string | null;
  items: LibraryWorksheetPreviewItem[];
};

type PreviewState =
  | { kind: "module"; data: LibraryModulePreview }
  | { kind: "worksheet"; data: LibraryWorksheetPreview };

const ITEM_TYPE_LABELS: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda",
  isian_singkat: "Isian singkat",
  uraian: "Uraian",
  unggah_foto: "Unggah foto",
  langkah_berurutan: "Langkah berurutan",
  refleksi: "Refleksi",
  tautan_ruas: "Tautan RUAS",
};

const KIND_OPTIONS: { value: LibraryKindFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "module", label: "Materi" },
  { value: "worksheet", label: "LKPD" },
];

export type LibraryPanelProps = {
  // Serah-terima sesudah menyalin: bila cangkang guru menyediakan callback
  // ini, tombol "Buka draf salinan" membuka drafnya di langkah Materi/LKPD
  // tanpa pindah halaman. Tanpa callback, panel kembali ke perilaku lama —
  // tautan ?modul=/?lkpd= ke cangkang (copiedDraftHref).
  onOpenCopiedDraft?: (kind: "module" | "worksheet", id: number) => void;
};

export function LibraryPanel({ onOpenCopiedDraft }: LibraryPanelProps) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LibraryKindFilter>("all");
  // Saringan kontributor: daftarnya datang dari meta respons katalog
  // (seluruh semesta tayang), pilihannya teacher_id guru penyumbang;
  // null = semua kontributor.
  const [contributors, setContributors] = useState<ContributorSummary[]>([]);
  const [selectedContributor, setSelectedContributor] = useState<number | null>(null);
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  // Nama tampilan guru untuk sapaan hero — dari /auth/me, sumber yang
  // sama seperti sapaan beranda murid (display_name, cadangan name).
  const [teacherName, setTeacherName] = useState("");
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copiedLink, setCopiedLink] = useState<{ kind: "module" | "worksheet"; id: number; title: string } | null>(null);
  // Keadaan khusus penyetuju (dari meta respons katalog): antrean pengajuan
  // berbagi guru lain yang menunggu keputusannya. Guru lain tidak pernah
  // menerima approver=true, jadi seluruh bagian ini tidak tampil untuknya.
  const [isApprover, setIsApprover] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvals, setApprovals] = useState<ApprovalEntry[] | null>(null);
  const [decidingKey, setDecidingKey] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [queueVersion, setQueueVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiRequest<MeResponse>("/auth/me");
        if (cancelled) return;
        if (me.user.role !== "guru") setForbidden(true);
        setTeacherName(me.user.display_name ?? me.user.name ?? "");
      } catch (error) {
        if (error instanceof Error && error.message === "Belum masuk.") {
          router.replace("/login");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (forbidden) return;
    let cancelled = false;
    setEntries(null);
    setLoadError("");
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (kind !== "all") params.set("kind", kind);
        if (selectedContributor !== null) params.set("teacher_id", String(selectedContributor));
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const response = await apiRequest<LibraryResponse>(`/library${suffix}`);
        if (!cancelled) {
          setEntries(response.data);
          setIsApprover(response.approver === true);
          setPendingCount(response.pending_count ?? 0);
          setStats(response.stats ?? null);
          const freshContributors = response.contributors ?? [];
          setContributors(freshContributors);
          // Kontributor terpilih yang sudah tidak punya butir tayang
          // gugur sendiri ke "Semua kontributor" pada muatan berikutnya.
          setSelectedContributor((current) => resolveSelectedContributor(current, freshContributors));
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Katalog belum dapat dimuat.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, kind, selectedContributor, forbidden, listVersion]);

  useEffect(() => {
    if (forbidden || !isApprover) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiRequest<ApprovalsResponse>("/library/approvals");
        if (!cancelled) setApprovals(response.data);
      } catch {
        if (!cancelled) setApprovals([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forbidden, isApprover, queueVersion, listVersion]);

  async function openPreview(entry: LibraryEntry) {
    setPreviewLoading(true);
    setMessage("");
    try {
      if (entry.kind === "module") {
        const response = await apiRequest<{ ok: true; data: LibraryModulePreview }>(`/library/modules/${entry.id}`);
        setPreview({ kind: "module", data: response.data });
      } else {
        const response = await apiRequest<{ ok: true; data: LibraryWorksheetPreview }>(`/library/worksheets/${entry.id}`);
        setPreview({ kind: "worksheet", data: response.data });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pratinjau belum dapat dimuat.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function copyEntry(entry: LibraryEntry) {
    if (!(await confirmDialog(copyConfirmText(entry), { confirmLabel: "Salin" }))) return;
    const copyKey = `${entry.kind}:${entry.id}`;
    setCopyingId(copyKey);
    setCopiedLink(null);
    try {
      if (entry.kind === "module") {
        const response = await apiRequest<{ ok: true; data: { module_id: number; worksheet_ids: number[] } }>(
          `/library/modules/${entry.id}/copy`,
          { method: "POST" },
        );
        setCopiedLink({ kind: "module", id: response.data.module_id, title: entry.title });
        setMessage(
          response.data.worksheet_ids.length > 0
            ? `Materi tersalin sebagai Draf — ${response.data.worksheet_ids.length} LKPD ikut tersalin.`
            : "Materi tersalin sebagai Draf.",
        );
      } else {
        const response = await apiRequest<{ ok: true; data: { worksheet_id: number } }>(
          `/library/worksheets/${entry.id}/copy`,
          { method: "POST" },
        );
        setCopiedLink({ kind: "worksheet", id: response.data.worksheet_id, title: entry.title });
        setMessage("LKPD tersalin sebagai Draf.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penyalinan belum dapat dilakukan.");
    } finally {
      setCopyingId(null);
    }
  }

  async function decideApproval(entry: ApprovalEntry, decision: "setujui" | "tolak") {
    const decideKey = `${entry.kind}:${entry.id}`;
    setDecidingKey(decideKey);
    try {
      await apiRequest(approvalDecisionPath(entry), {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setMessage(
        decision === "setujui"
          ? `“${entry.title}” disetujui dan kini tayang di Perpustakaan Bersama.`
          : `Pengajuan “${entry.title}” ditolak.`,
      );
      // Antrean dan katalog sama-sama dimuat ulang: butir yang disetujui
      // hilang dari antrean dan mulai tampil di katalog.
      setQueueVersion((version) => version + 1);
      setListVersion((version) => version + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Keputusan belum dapat disimpan.");
    } finally {
      setDecidingKey(null);
    }
  }

  async function tarikEntry(entry: LibraryEntry) {
    if (!(await confirmDialog(tarikConfirmText(), { confirmLabel: "Tarik" }))) return;
    const tarikKey = `${entry.kind}:${entry.id}`;
    setDecidingKey(tarikKey);
    try {
      await apiRequest(approvalTarikPath(entry), { method: "POST" });
      setMessage(`“${entry.title}” ditarik dari Perpustakaan Bersama.`);
      setListVersion((version) => version + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penarikan belum dapat dilakukan.");
    } finally {
      setDecidingKey(null);
    }
  }

  const filtersActive = query.trim() !== "" || kind !== "all" || selectedContributor !== null;
  // Rak Populer diturunkan dari hasil katalog saat ini; disembunyikan
  // selama pencarian aktif agar hasil cari tampil bersih.
  const popularEntries = entries !== null && query.trim() === "" ? pickPopular(entries) : [];
  const topFive = topContributors(contributors);
  const topTotal = contributors[0]?.total ?? 0;

  return (
    <div className="library-root">
      <section style={styles.hero}>
        <div style={styles.heroText}>
          <p style={styles.heroEyebrow}>SIMAK · PERPUSTAKAAN BERSAMA</p>
          <h1 style={styles.heroTitle}>Perpustakaan Bersama</h1>
          {teacherName ? <p style={styles.heroGreeting}>Halo, {teacherName}</p> : null}
          <p style={styles.heroTagline}>
            Materi dan LKPD yang dibagikan guru lain. Pratinjau isinya, lalu salin ke akun Anda sebagai Draf —
            salinan bebas Anda ubah dan tugaskan tanpa memengaruhi aslinya.
          </p>
          {stats ? (
            <div style={styles.heroChips}>
              {libraryStatsChips(stats).map((label) => (
                <span key={label} style={styles.heroChip}>{label}</span>
              ))}
            </div>
          ) : null}
        </div>
        <BooksIllustration />
      </section>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}
      {copiedLink ? (
        <p style={styles.copiedBanner}>
          “{copiedLink.title}” sudah ada di ruang kerja Anda.{" "}
          {onOpenCopiedDraft ? (
            <button
              type="button"
              onClick={() => onOpenCopiedDraft(copiedLink.kind, copiedLink.id)}
              style={styles.copiedLinkButton}
            >
              Buka draf salinan →
            </button>
          ) : (
            <Link href={copiedDraftHref(copiedLink.kind, copiedLink.id)} style={styles.copiedLink}>Buka draf salinan →</Link>
          )}
        </p>
      ) : null}

      {forbidden ? (
        <p style={styles.empty}>Halaman ini khusus guru. Keluar dahulu lalu masuk dengan akun guru.</p>
      ) : preview ? (
        <PreviewView
          preview={preview}
          copyingId={copyingId}
          onBack={() => setPreview(null)}
          onCopy={(entry) => void copyEntry(entry)}
        />
      ) : (
        <div className="library-shell">
          <div style={styles.mainColumn}>
          {isApprover && approvals !== null && approvals.length > 0 ? (
            <section id="antrean-persetujuan" style={styles.approvalSection}>
              <h2 style={styles.sectionTitle}>Menunggu persetujuan ({pendingCount || approvals.length})</h2>
              <p style={styles.muted}>
                Pengajuan berbagi dari guru lain. Pratinjau isinya terlebih dahulu, lalu putuskan.
              </p>
              <div style={styles.list}>
                {approvals.map((entry) => (
                  <article key={`antrean-${entry.kind}:${entry.id}`} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <span style={styles.kindChip}>{approvalKindLabel(entry.kind)}</span>
                      {entry.subject ? <span style={styles.subjectChip}>{entry.subject}</span> : null}
                    </div>
                    <h3 style={styles.cardTitle}><MathText text={entry.title} /></h3>
                    <p style={styles.meta}>oleh {entry.teacher_name}</p>
                    <p style={styles.meta}>{approvalEntryMeta(entry)}</p>
                    {formatRequestedDate(entry.share_requested_at) ? (
                      <p style={styles.meta}>Diajukan {formatRequestedDate(entry.share_requested_at)}</p>
                    ) : null}
                    <div style={styles.cardActions}>
                      <button
                        type="button"
                        onClick={() => void openPreview(approvalToLibraryEntry(entry))}
                        disabled={previewLoading}
                        style={styles.secondaryButton}
                      >
                        <span className="action-icon" aria-hidden="true">👁</span>Pratinjau
                      </button>
                      <button
                        type="button"
                        onClick={() => void decideApproval(entry, "setujui")}
                        disabled={decidingKey === `${entry.kind}:${entry.id}`}
                        style={styles.primaryButton}
                      >
                        <span className="action-icon" aria-hidden="true">✓</span>Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => void decideApproval(entry, "tolak")}
                        disabled={decidingKey === `${entry.kind}:${entry.id}`}
                        style={styles.dangerButton}
                      >
                        <span className="action-icon" aria-hidden="true">✕</span>Tolak
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div style={styles.toolbar}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari judul atau mata pelajaran…"
              aria-label="Cari di Perpustakaan Bersama"
              style={styles.searchInput}
            />
            <div style={styles.chipRow} role="group" aria-label="Saring jenis">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={kind === option.value}
                  onClick={() => setKind(option.value)}
                  style={kind === option.value ? styles.chipActive : styles.chip}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {contributors.length > 0 ? (
              <div style={styles.chipRow} role="group" aria-label="Saring kontributor">
                <button
                  type="button"
                  aria-pressed={selectedContributor === null}
                  onClick={() => setSelectedContributor(null)}
                  style={selectedContributor === null ? styles.chipActive : styles.chip}
                >
                  Semua kontributor
                </button>
                {contributors.map((contributor) => (
                  <button
                    key={contributor.teacher_id}
                    type="button"
                    aria-pressed={selectedContributor === contributor.teacher_id}
                    onClick={() => setSelectedContributor(contributor.teacher_id)}
                    style={selectedContributor === contributor.teacher_id ? styles.chipActive : styles.chip}
                  >
                    {contributorChipLabel(contributor)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {entries === null && !loadError ? <p style={styles.muted}>Memuat katalog...</p> : null}
          {loadError ? <p style={styles.error}>{loadError}</p> : null}
          {entries !== null && entries.length === 0 ? (
            <p style={styles.empty}>
              {filtersActive
                ? "Tidak ada materi atau LKPD yang cocok dengan pencarian ini."
                : "Belum ada materi yang dibagikan guru lain."}
            </p>
          ) : null}
          {popularEntries.length >= 2 ? (
            <section>
              <h2 style={styles.sectionTitle}>Populer — paling sering disalin</h2>
              <div className="library-shelf">
                {popularEntries.map((entry) => (
                  <article
                    key={`populer-${entry.kind}:${entry.id}`}
                    style={styles.shelfCard}
                    onClick={() => void openPreview(entry)}
                  >
                    <LibraryCoverArt entry={entry} compact />
                    <div style={styles.shelfBody}>
                      <span className="library-clamp-2" style={styles.shelfTitle}>
                        <MathText text={entry.title} />
                      </span>
                      <span style={styles.shelfMeta}>disalin {entry.salinan_count ?? 0} kali</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {entries !== null && entries.length > 0 ? (
            <div className="library-card-grid">
              {entries.map((entry) => (
                <LibraryCard
                  key={`${entry.kind}:${entry.id}`}
                  entry={entry}
                  previewLoading={previewLoading}
                  copyingId={copyingId}
                  decidingKey={decidingKey}
                  isApprover={isApprover}
                  onPreview={(entry) => void openPreview(entry)}
                  onCopy={(entry) => void copyEntry(entry)}
                  onTarik={(entry) => void tarikEntry(entry)}
                />
              ))}
            </div>
          ) : null}
          </div>

          <aside style={styles.sidebar}>
            {contributors.length > 0 ? (
              <section style={styles.sideCard}>
                <h2 style={styles.sideTitle}>Kontributor teratas</h2>
                <div style={styles.contributorRows}>
                  {topFive.map((contributor) => (
                    <button
                      key={contributor.teacher_id}
                      type="button"
                      aria-pressed={selectedContributor === contributor.teacher_id}
                      onClick={() => setSelectedContributor(contributor.teacher_id)}
                      style={
                        selectedContributor === contributor.teacher_id
                          ? { ...styles.contributorRow, ...styles.contributorRowActive }
                          : styles.contributorRow
                      }
                    >
                      <span style={styles.contributorRowTop}>
                        <span style={styles.contributorName}>{contributor.name}</span>
                        <span style={styles.contributorRowCount}>{contributor.total} dibagikan</span>
                      </span>
                      <span style={styles.barTrack}>
                        <span style={{ ...styles.barFill, width: `${contributorBarPercent(contributor, topTotal)}%` }} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {isApprover ? (
              <section style={styles.sideCard}>
                <h2 style={styles.sideTitle}>Menunggu persetujuan</h2>
                <p style={styles.sideBigCount}>{pendingCount}</p>
                <p style={styles.meta}>pengajuan berbagi dari guru lain menunggu keputusan Anda.</p>
                <a href="#antrean-persetujuan" style={styles.sideLink}>Lihat antrean</a>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

// Ilustrasi hero: tumpukan buku datar ungu/putih/kuning dalam semangat
// ilustrasi halaman tunggu murid — SVG sebaris, murni dekoratif, tanpa
// aset eksternal.
function BooksIllustration() {
  return (
    <svg viewBox="0 0 220 150" style={styles.heroArt} aria-hidden="true" focusable="false">
      <circle cx="188" cy="26" r="5" fill="#fde68a" />
      <circle cx="30" cy="38" r="4" fill="#ddd6fe" />
      <circle cx="200" cy="66" r="3.5" fill="#fde68a" />
      <rect x="150" y="34" width="17" height="76" rx="5" fill="#a78bfa" transform="rotate(16 158 72)" />
      <rect x="42" y="110" width="128" height="19" rx="6" fill="#f59e0b" />
      <rect x="42" y="116" width="128" height="4" fill="#fde68a" opacity="0.75" />
      <rect x="54" y="87" width="106" height="19" rx="6" fill="#ffffff" />
      <rect x="54" y="87" width="16" height="19" fill="#ddd6fe" />
      <path d="M118 87 h10 v14 l-5 -3.6 -5 3.6 Z" fill="#f59e0b" />
      <rect x="66" y="64" width="84" height="19" rx="6" fill="#c4b5fd" />
      <rect x="66" y="70" width="84" height="4" fill="#ede9fe" opacity="0.8" />
      <rect x="84" y="44" width="52" height="16" rx="6" fill="#8b5cf6" />
    </svg>
  );
}

// Sampul kartu katalog: gambar sampul asli modul (bila ada) menutupi
// sampul tipografisnya. URL unduhan diterbitkan segar lewat
// /uploads/download dengan id modul SUMBER — mekanisme yang sama seperti
// sampul pada pratinjau dan ruang guru; selama URL belum terbit atau
// gagal, sampul tipografis (gradien pastel deterministik + huruf awal
// judul + mapel) yang tampil. LKPD selalu tipografis.
function LibraryCoverArt({ entry, compact = false }: { entry: LibraryEntry; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const coverKey = entry.kind === "module" ? (entry.cover_key ?? null) : null;

  useEffect(() => {
    if (!coverKey) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    void apiRequest<{ ok: true; data: { download_url: string } }>(
      `/uploads/download?moduleId=${entry.id}&key=${encodeURIComponent(coverKey)}`,
    )
      .then((response) => {
        if (!cancelled) setUrl(response.data.download_url);
      })
      .catch(() => {
        // Sampul gagal diterbitkan URL-nya: tipografis tetap tampil.
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id, coverKey]);

  return (
    <div
      style={{ ...(compact ? styles.coverArtCompact : styles.coverArt), background: coverGradient(entry) }}
      aria-hidden="true"
    >
      <span style={compact ? styles.coverInitialSmall : styles.coverInitial}>{coverInitial(entry.title)}</span>
      <span style={styles.coverSubject}>
        {entry.kind === "worksheet" ? (entry.subject ?? "LKPD") : entry.subject}
      </span>
      {url ? <img src={url} alt="" style={styles.coverImg} /> : null}
    </div>
  );
}

// Kartu katalog bergaya buku: sampul di atas (chip jenis di kiri atas,
// chip mapel di kanan atas), badan di bawahnya. Semua tombol dan
// penangannya sama persis seperti kartu daftar sebelumnya — Pratinjau,
// Salin/✓ Sudah disalin, dan Tarik khusus penyetuju.
function LibraryCard({
  entry,
  previewLoading,
  copyingId,
  decidingKey,
  isApprover,
  onPreview,
  onCopy,
  onTarik,
}: {
  entry: LibraryEntry;
  previewLoading: boolean;
  copyingId: string | null;
  decidingKey: string | null;
  isApprover: boolean;
  onPreview: (entry: LibraryEntry) => void;
  onCopy: (entry: LibraryEntry) => void;
  onTarik: (entry: LibraryEntry) => void;
}) {
  const sharedLabel = formatSharedDate(entry.shared_at) ? `Dibagikan ${formatSharedDate(entry.shared_at)}` : null;
  const salinanLabel = salinanCountLabel(entry);
  return (
    <article style={styles.bookCard}>
      <div style={styles.coverWrap}>
        <LibraryCoverArt entry={entry} />
        <div style={styles.coverChips}>
          <span style={styles.kindChip}>{libraryKindLabel(entry.kind)}</span>
          {entry.subject ? <span style={styles.subjectChip}>{entry.subject}</span> : null}
        </div>
      </div>
      <div style={styles.bookBody}>
        <h2 className="library-clamp-2" style={styles.cardTitle}><MathText text={entry.title} /></h2>
        <p style={styles.meta}>
          oleh {entry.owner_name}
          <span style={styles.contributorBadge}>{kontributorBadgeLabel(entry)}</span>
        </p>
        <p style={styles.meta}>{libraryEntryMeta(entry)}</p>
        {sharedLabel || salinanLabel ? (
          <p style={styles.meta}>{[sharedLabel, salinanLabel].filter(Boolean).join(" · ")}</p>
        ) : null}
        <div style={{ ...styles.cardActions, ...styles.cardActionsPush }}>
          <button type="button" onClick={() => onPreview(entry)} disabled={previewLoading} style={styles.secondaryButton}>
            <span className="action-icon" aria-hidden="true">👁</span>Pratinjau
          </button>
          {isSudahDisalin(entry) ? (
            <button type="button" disabled style={styles.primaryButtonDisabled}>
              {SUDAH_DISALIN_LABEL}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCopy(entry)}
              disabled={copyingId === `${entry.kind}:${entry.id}`}
              style={styles.primaryButton}
            >
              {copyingId === `${entry.kind}:${entry.id}` ? <><span className="action-icon" aria-hidden="true">📋</span>Menyalin...</> : <><span className="action-icon" aria-hidden="true">📋</span>Salin ke punya saya</>}
            </button>
          )}
          {isApprover ? (
            <button
              type="button"
              onClick={() => onTarik(entry)}
              disabled={decidingKey === `${entry.kind}:${entry.id}`}
              style={styles.tarikButton}
            >
              <span className="action-icon" aria-hidden="true">⬇</span>Tarik
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PreviewView({
  preview,
  copyingId,
  onBack,
  onCopy,
}: {
  preview: PreviewState;
  copyingId: string | null;
  onBack: () => void;
  onCopy: (entry: LibraryEntry) => void;
}) {
  if (preview.kind === "module") {
    const data = preview.data;
    const entry: LibraryEntry = {
      kind: "module",
      id: data.id,
      title: data.title,
      subject: data.subject,
      owner_name: data.owner_name,
      shared_at: data.shared_at,
      block_count: data.blocks.length,
      shared_worksheet_count: data.worksheets.length,
    };
    return (
      <section style={styles.previewPanel}>
        <button type="button" onClick={onBack} style={styles.backButton}>← Kembali ke perpustakaan</button>
        <div style={styles.cardHeader}>
          <span style={styles.kindChip}>Materi</span>
          <span style={styles.subjectChip}>{data.subject}</span>
        </div>
        <h2 style={styles.previewTitle}><MathText text={data.title} /></h2>
        <p style={styles.meta}>
          oleh {data.owner_name}
          {formatSharedDate(data.shared_at) ? ` · Dibagikan ${formatSharedDate(data.shared_at)}` : ""}
        </p>
        {data.description ? <p style={styles.muted}><MathText text={data.description} /></p> : null}
        <div style={styles.cardActions}>
          <button type="button" onClick={() => onCopy(entry)} disabled={copyingId === `module:${data.id}`} style={styles.primaryButton}>
            {copyingId === `module:${data.id}` ? <><span className="action-icon" aria-hidden="true">📋</span>Menyalin...</> : <><span className="action-icon" aria-hidden="true">📋</span>Salin ke punya saya</>}
          </button>
        </div>
        {data.cover_key ? <LibraryCoverImage moduleId={data.id} coverKey={data.cover_key} /> : null}
        <div style={styles.blockList}>
          {data.blocks.length === 0 ? (
            <p style={styles.empty}>Belum ada isi pada materi ini.</p>
          ) : (
            data.blocks.map((block) => <ModuleBlockPreview key={block.id} block={block} moduleId={data.id} />)
          )}
        </div>
        <h3 style={styles.sectionTitle}>LKPD yang ikut tersalin ({data.worksheets.length})</h3>
        {data.worksheets.length === 0 ? (
          <p style={styles.muted}>Tidak ada LKPD yang dibagikan pada materi ini.</p>
        ) : (
          <div style={styles.list}>
            {data.worksheets.map((worksheet) => (
              <article key={worksheet.id} style={styles.miniCard}>
                <strong><MathText text={worksheet.title} /></strong>
                <p style={styles.meta}>{worksheet.item_count} soal · {worksheet.total_points} poin</p>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  const data = preview.data;
  const entry: LibraryEntry = {
    kind: "worksheet",
    id: data.id,
    title: data.title,
    subject: data.subject,
    owner_name: data.owner_name,
    shared_at: data.shared_at,
    item_count: data.items.length,
    total_points: data.items.reduce((sum, item) => sum + item.points, 0),
  };
  return (
    <section style={styles.previewPanel}>
      <button type="button" onClick={onBack} style={styles.backButton}>← Kembali ke perpustakaan</button>
      <div style={styles.cardHeader}>
        <span style={styles.kindChip}>LKPD</span>
        {data.subject ? <span style={styles.subjectChip}>{data.subject}</span> : null}
      </div>
      <h2 style={styles.previewTitle}><MathText text={data.title} /></h2>
      <p style={styles.meta}>
        oleh {data.owner_name}
        {formatSharedDate(data.shared_at) ? ` · Dibagikan ${formatSharedDate(data.shared_at)}` : ""}
      </p>
      {data.instructions ? <p style={styles.muted}><MathText text={data.instructions} /></p> : null}
      <div style={styles.cardActions}>
        <button type="button" onClick={() => onCopy(entry)} disabled={copyingId === `worksheet:${data.id}`} style={styles.primaryButton}>
          {copyingId === `worksheet:${data.id}` ? <><span className="action-icon" aria-hidden="true">📋</span>Menyalin...</> : <><span className="action-icon" aria-hidden="true">📋</span>Salin ke punya saya</>}
        </button>
      </div>
      <div style={styles.list}>
        {data.items.length === 0 ? (
          <p style={styles.empty}>Belum ada soal pada LKPD ini.</p>
        ) : (
          data.items.map((item, index) => <WorksheetPreviewItem key={item.id} item={item} index={index} />)
        )}
      </div>
    </section>
  );
}

function WorksheetPreviewItem({ item, index }: { item: LibraryWorksheetPreviewItem; index: number }) {
  const typeLabel = ITEM_TYPE_LABELS[item.item_type] ?? item.item_type;
  const options = Array.isArray(item.options?.options)
    ? item.options.options.filter((entry: unknown): entry is string => typeof entry === "string")
    : [];
  const steps = Array.isArray(item.options?.steps)
    ? item.options.steps.filter((entry: unknown): entry is string => typeof entry === "string")
    : [];
  return (
    <article style={styles.itemCard}>
      <div style={styles.cardHeader}>
        <span style={styles.kindChip}>{typeLabel}</span>
        <span style={styles.subjectChip}>{item.points} poin</span>
        <span style={styles.subjectChip}>Rubrik maks {item.rubric_max}</span>
      </div>
      <p style={styles.itemPrompt}>
        <strong>{index + 1}. <MathText text={item.prompt} /></strong>
      </p>
      {item.item_type === "pilihan_ganda" && options.length > 0 ? (
        <div style={styles.optionList}>
          {options.map((option, optionIndex) => (
            <p key={`${option}-${optionIndex}`} style={styles.optionRow}>
              {String.fromCharCode(65 + optionIndex)}. <MathText text={option} />
              {item.answer_key === option ? <strong> (kunci)</strong> : null}
            </p>
          ))}
        </div>
      ) : null}
      {item.item_type === "langkah_berurutan" && steps.length > 0 ? (
        <ol style={styles.stepList}>
          {steps.map((step, stepIndex) => (
            <li key={`${step}-${stepIndex}`}><MathText text={step} /></li>
          ))}
        </ol>
      ) : null}
      <div style={styles.teacherOnlyBox}>
        <p style={styles.teacherOnlyTitle}>Khusus guru</p>
        {item.answer_key ? (
          <p style={styles.teacherOnlyText}><strong>Kunci/Rubrik:</strong> <MathText text={item.answer_key} /></p>
        ) : (
          <p style={styles.teacherOnlyText}>Belum ada kunci jawaban.</p>
        )}
        {item.explanation ? (
          <p style={styles.teacherOnlyText}><strong>Pembahasan:</strong> <MathText text={item.explanation} /></p>
        ) : null}
      </div>
    </article>
  );
}

function LibraryCoverImage({ moduleId, coverKey }: { moduleId: number; coverKey: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    void apiRequest<{ ok: true; data: { download_url: string } }>(
      `/uploads/download?moduleId=${moduleId}&key=${encodeURIComponent(coverKey)}`,
    )
      .then((response) => {
        if (!cancelled) setUrl(response.data.download_url);
      })
      .catch(() => {
        // Sampul gagal diterbitkan URL-nya: tampilkan tanpa gambar.
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, coverKey]);
  if (!url) return null;
  return <img src={url} alt="Sampul materi" style={styles.coverImage} />;
}

const styles: Record<string, CSSProperties> = {
  hero: {
    background: "linear-gradient(135deg, #6941c6 0%, #8b5cf6 55%, #a78bfa 100%)",
    borderRadius: 20,
    padding: "28px 28px 30px",
    marginTop: 20,
    color: "#ffffff",
    display: "flex",
    gap: 20,
    alignItems: "center",
    flexWrap: "wrap",
  },
  heroText: { flex: "1 1 320px", minWidth: 0, display: "grid", gap: 8 },
  heroEyebrow: { color: "#ddd6fe", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: 0 },
  heroTitle: { fontSize: 32, margin: 0, color: "#ffffff" },
  heroGreeting: { margin: 0, fontSize: 17, fontWeight: 600, color: "#ede9fe" },
  heroTagline: { color: "rgba(255, 255, 255, 0.88)", lineHeight: 1.55, margin: 0 },
  heroChips: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 },
  heroChip: {
    background: "rgba(255, 255, 255, 0.16)",
    border: "1px solid rgba(255, 255, 255, 0.35)",
    color: "#ffffff",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 600,
  },
  heroArt: { width: 180, maxWidth: "40vw", height: "auto", flex: "0 0 auto" },
  mainColumn: { minWidth: 0 },
  sidebar: { display: "grid", gap: 16, alignContent: "start", minWidth: 0 },
  sideCard: { border: "1px solid #eaecf0", borderRadius: 12, padding: 16, background: "#ffffff", display: "grid", gap: 10 },
  sideTitle: { fontSize: 16, margin: 0 },
  sideBigCount: { fontSize: 34, fontWeight: 800, margin: 0, color: "#6941c6", lineHeight: 1 },
  sideLink: { color: "#175cd3", fontWeight: 700, textDecoration: "none" },
  contributorRows: { display: "grid", gap: 2 },
  contributorRow: {
    border: 0,
    borderRadius: 8,
    background: "transparent",
    padding: "6px 6px",
    cursor: "pointer",
    font: "inherit",
    display: "grid",
    gap: 5,
    textAlign: "left",
    width: "100%",
  },
  contributorRowActive: { background: "#f5f3ff" },
  contributorRowTop: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" },
  contributorName: { fontWeight: 600, color: "#101828", fontSize: 14 },
  contributorRowCount: { color: "#667085", fontSize: 13, whiteSpace: "nowrap" },
  barTrack: { display: "block", height: 6, borderRadius: 999, background: "#eaecf0", overflow: "hidden" },
  barFill: { display: "block", height: "100%", background: "#8b5cf6", borderRadius: 999 },
  bookCard: {
    border: "1px solid #eaecf0",
    borderRadius: 14,
    overflow: "hidden",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  coverWrap: { position: "relative" },
  coverArt: { position: "relative", aspectRatio: "16 / 10", display: "grid", placeItems: "center", overflow: "hidden" },
  coverArtCompact: { position: "relative", aspectRatio: "16 / 9", display: "grid", placeItems: "center", overflow: "hidden" },
  coverInitial: { fontSize: 52, fontWeight: 800, color: "rgba(255, 255, 255, 0.92)", lineHeight: 1 },
  coverInitialSmall: { fontSize: 32, fontWeight: 800, color: "rgba(255, 255, 255, 0.92)", lineHeight: 1 },
  coverSubject: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.88)",
    padding: "0 10px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  coverImg: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  coverChips: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    pointerEvents: "none",
  },
  bookBody: { padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 },
  cardActionsPush: { marginTop: "auto", paddingTop: 4 },
  shelfCard: {
    // Basis tetap 230px dan tidak menyusut (flex "0 0 …"): kartu rak tidak
    // pernah terjepit; raknya sendiri bergeser mendatar bila sempit.
    flex: "0 0 230px",
    width: 230,
    border: "1px solid #eaecf0",
    borderRadius: 12,
    overflow: "hidden",
    background: "#ffffff",
    cursor: "pointer",
  },
  shelfBody: { padding: "8px 10px 10px", display: "grid", gap: 2 },
  shelfTitle: { fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: "#101828" },
  shelfMeta: { fontSize: 12, color: "#667085" },
  backButton: { border: 0, background: "transparent", color: "#175cd3", fontWeight: 700, cursor: "pointer", padding: 0, font: "inherit" },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "28px 0 8px" },
  title: { fontSize: 32, margin: 0 },
  muted: { color: "#667085", lineHeight: 1.5 },
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
  empty: { color: "#667085", background: "#f8f9fc", padding: 16, borderRadius: 8 },
  copiedBanner: { background: "#ecfdf3", color: "#067647", padding: 12, borderRadius: 8, lineHeight: 1.5 },
  copiedLink: { color: "#067647", fontWeight: 700 },
  copiedLinkButton: { border: 0, background: "transparent", color: "#067647", fontWeight: 700, cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" },
  toolbar: { display: "grid", gap: 10, marginTop: 20 },
  searchInput: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", font: "inherit" },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: { border: "1px solid #d0d5dd", background: "#ffffff", color: "#344054", borderRadius: 999, padding: "6px 14px", fontWeight: 600, cursor: "pointer", font: "inherit", fontSize: 14 },
  chipActive: { border: "1px solid #175cd3", background: "#175cd3", color: "#ffffff", borderRadius: 999, padding: "6px 14px", fontWeight: 700, cursor: "pointer", font: "inherit", fontSize: 14 },
  list: { display: "grid", gap: 12, marginTop: 16 },
  card: { border: "1px solid #eaecf0", borderRadius: 12, padding: 18, display: "grid", gap: 8, background: "#ffffff" },
  miniCard: { border: "1px solid #eaecf0", borderRadius: 12, padding: 14, display: "grid", gap: 4, background: "#ffffff" },
  itemCard: { border: "1px solid #eaecf0", borderRadius: 12, padding: 16, display: "grid", gap: 10, background: "#ffffff" },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kindChip: { background: "#eff8ff", color: "#175cd3", border: "1px solid #b2ddff", borderRadius: 999, padding: "1px 10px", fontSize: 12, fontWeight: 700 },
  subjectChip: { background: "#f8f9fc", color: "#475467", border: "1px solid #eaecf0", borderRadius: 999, padding: "1px 10px", fontSize: 12, fontWeight: 600 },
  contributorBadge: { background: "#f8f9fc", color: "#475467", border: "1px solid #eaecf0", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 600, marginLeft: 8, whiteSpace: "nowrap" },
  cardTitle: { fontSize: 19, margin: 0 },
  meta: { color: "#475467", fontSize: 14, margin: 0 },
  cardActions: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700, cursor: "pointer", font: "inherit" },
  primaryButtonDisabled: { border: 0, borderRadius: 8, background: "#eaecf0", color: "#98a2b3", padding: "11px 14px", fontWeight: 700, cursor: "not-allowed", font: "inherit" },
  secondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "11px 14px", fontWeight: 600, cursor: "pointer", font: "inherit" },
  dangerButton: { border: "1px solid #fecdca", borderRadius: 8, background: "#fef3f2", color: "#b42318", padding: "11px 14px", fontWeight: 700, cursor: "pointer", font: "inherit" },
  tarikButton: { border: 0, borderRadius: 8, background: "transparent", color: "#b42318", padding: "11px 6px", fontWeight: 600, cursor: "pointer", font: "inherit" },
  approvalSection: { display: "grid", gap: 4, marginTop: 24, border: "1px solid #fedf89", background: "#fffaeb", borderRadius: 12, padding: 16 },
  previewPanel: { display: "grid", gap: 12, marginTop: 24 },
  previewTitle: { fontSize: 24, margin: 0 },
  sectionTitle: { fontSize: 18, margin: "12px 0 0" },
  blockList: { display: "grid", gap: 12 },
  coverImage: { maxWidth: "100%", borderRadius: 10 },
  itemPrompt: { margin: 0, lineHeight: 1.5 },
  optionList: { display: "grid", gap: 4 },
  optionRow: { margin: 0, lineHeight: 1.5 },
  stepList: { margin: 0, paddingLeft: 20, display: "grid", gap: 4, lineHeight: 1.5 },
  teacherOnlyBox: { background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 8, padding: 12, display: "grid", gap: 6 },
  teacherOnlyTitle: { margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#93370d", textTransform: "uppercase" },
  teacherOnlyText: { margin: 0, lineHeight: 1.5 },
};
