"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { apiRequest } from "../../../lib/api";
import {
  approvalDecisionPath,
  approvalEntryMeta,
  approvalKindLabel,
  approvalTarikPath,
  approvalToLibraryEntry,
  contributorChipLabel,
  copiedDraftHref,
  copyConfirmText,
  formatRequestedDate,
  formatSharedDate,
  isSudahDisalin,
  kontributorBadgeLabel,
  libraryEntryMeta,
  libraryKindLabel,
  resolveSelectedContributor,
  tarikConfirmText,
  SUDAH_DISALIN_LABEL,
  type ApprovalEntry,
  type ContributorSummary,
  type LibraryEntry,
  type LibraryKindFilter,
} from "../../../lib/perpustakaan";
import { ModuleBlockPreview, type ModulePreviewBlockData } from "../../../components/ModuleBlockPreview";
import { MathText } from "../../../components/MathContent";
import { Toast } from "../../../components/Toast";
import { useConfirm } from "../../../components/ConfirmDialog";

// Perpustakaan Bersama (Fase 1, v1.0.41): katalog materi + LKPD yang
// dibagikan GURU LAIN. Guru menelusuri, mempratinjau (blok dirender dengan
// perender yang sama seperti pratinjau pemilik; butir LKPD tampil lengkap
// dengan kuncinya — permukaan khusus guru), lalu menyalin item ke akunnya
// sebagai Draf miliknya sendiri. Materi sendiri tidak pernah tampil di
// sini; API menegakkan itu, halaman hanya merender.

type LibraryResponse = {
  ok: true;
  data: LibraryEntry[];
  approver?: boolean;
  pending_count?: number;
  contributors?: ContributorSummary[];
};
type ApprovalsResponse = { ok: true; data: ApprovalEntry[] };
type MeResponse = { ok: true; user: { role: "guru" | "murid" } };

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

export default function PerpustakaanPage() {
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
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copiedLink, setCopiedLink] = useState<{ href: string; title: string } | null>(null);
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
        setCopiedLink({ href: copiedDraftHref("module", response.data.module_id), title: entry.title });
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
        setCopiedLink({ href: copiedDraftHref("worksheet", response.data.worksheet_id), title: entry.title });
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

  return (
    <main style={styles.container}>
      <Link href="/guru" style={styles.back}>← Ruang guru</Link>
      <p style={styles.eyebrow}>SIMAK · PERPUSTAKAAN BERSAMA</p>
      <h1 style={styles.title}>Perpustakaan Bersama</h1>
      <p style={styles.muted}>
        Materi dan LKPD yang dibagikan guru lain. Pratinjau isinya, lalu salin ke akun Anda sebagai Draf —
        salinan bebas Anda ubah dan tugaskan tanpa memengaruhi aslinya.
      </p>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}
      {copiedLink ? (
        <p style={styles.copiedBanner}>
          “{copiedLink.title}” sudah ada di ruang kerja Anda.{" "}
          <Link href={copiedLink.href} style={styles.copiedLink}>Buka draf salinan →</Link>
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
        <>
          {isApprover && approvals !== null && approvals.length > 0 ? (
            <section style={styles.approvalSection}>
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
                        Pratinjau
                      </button>
                      <button
                        type="button"
                        onClick={() => void decideApproval(entry, "setujui")}
                        disabled={decidingKey === `${entry.kind}:${entry.id}`}
                        style={styles.primaryButton}
                      >
                        Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => void decideApproval(entry, "tolak")}
                        disabled={decidingKey === `${entry.kind}:${entry.id}`}
                        style={styles.dangerButton}
                      >
                        Tolak
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
          {entries !== null && entries.length > 0 ? (
            <div style={styles.list}>
              {entries.map((entry) => (
                <article key={`${entry.kind}:${entry.id}`} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <span style={styles.kindChip}>{libraryKindLabel(entry.kind)}</span>
                    {entry.subject ? <span style={styles.subjectChip}>{entry.subject}</span> : null}
                  </div>
                  <h2 style={styles.cardTitle}><MathText text={entry.title} /></h2>
                  <p style={styles.meta}>
                    oleh {entry.owner_name}
                    <span style={styles.contributorBadge}>{kontributorBadgeLabel(entry)}</span>
                  </p>
                  <p style={styles.meta}>{libraryEntryMeta(entry)}</p>
                  {formatSharedDate(entry.shared_at) ? (
                    <p style={styles.meta}>Dibagikan {formatSharedDate(entry.shared_at)}</p>
                  ) : null}
                  <div style={styles.cardActions}>
                    <button type="button" onClick={() => void openPreview(entry)} disabled={previewLoading} style={styles.secondaryButton}>
                      Pratinjau
                    </button>
                    {isSudahDisalin(entry) ? (
                      <button type="button" disabled style={styles.primaryButtonDisabled}>
                        {SUDAH_DISALIN_LABEL}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void copyEntry(entry)}
                        disabled={copyingId === `${entry.kind}:${entry.id}`}
                        style={styles.primaryButton}
                      >
                        {copyingId === `${entry.kind}:${entry.id}` ? "Menyalin..." : "Salin ke punya saya"}
                      </button>
                    )}
                    {isApprover ? (
                      <button
                        type="button"
                        onClick={() => void tarikEntry(entry)}
                        disabled={decidingKey === `${entry.kind}:${entry.id}`}
                        style={styles.tarikButton}
                      >
                        Tarik
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </>
      )}
    </main>
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
            {copyingId === `module:${data.id}` ? "Menyalin..." : "Salin ke punya saya"}
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
          {copyingId === `worksheet:${data.id}` ? "Menyalin..." : "Salin ke punya saya"}
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
  container: { maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none", fontWeight: 600 },
  backButton: { border: 0, background: "transparent", color: "#175cd3", fontWeight: 700, cursor: "pointer", padding: 0, font: "inherit" },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "28px 0 8px" },
  title: { fontSize: 32, margin: 0 },
  muted: { color: "#667085", lineHeight: 1.5 },
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
  empty: { color: "#667085", background: "#f8f9fc", padding: 16, borderRadius: 8 },
  copiedBanner: { background: "#ecfdf3", color: "#067647", padding: 12, borderRadius: 8, lineHeight: 1.5 },
  copiedLink: { color: "#067647", fontWeight: 700 },
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
