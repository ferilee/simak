"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../../lib/api";
import { Toast } from "../../../../components/Toast";
import { useConfirm } from "../../../../components/ConfirmDialog";
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

// Label jenis butir untuk chip kepala kartu — sama seperti peta label pada
// pratinjau guru; tautan_ruas tampil sebagai "Kuis RUAS" di sisi murid.
const ITEM_TYPE_LABELS: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda",
  isian_singkat: "Isian singkat",
  uraian: "Uraian",
  unggah_foto: "Unggah foto",
  langkah_berurutan: "Langkah berurutan",
  refleksi: "Refleksi",
  tautan_ruas: "Kuis RUAS",
};

export default function WorksheetPage() {
  const confirmDialog = useConfirm();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");
  const [data, setData] = useState<WorksheetResponse["data"] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [touchedSequences, setTouchedSequences] = useState<Set<number>>(new Set());
  const [attachmentKeys, setAttachmentKeys] = useState<Record<number, string>>({});
  const [attachmentNames, setAttachmentNames] = useState<Record<number, string>>({});
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"draf" | "terkumpul" | "dinilai">("draf");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Pemutar satu soal per halaman: pageIndex == items.length berarti layar
  // tinjauan. Snapshot payload terakhir tersimpan menjadi acuan "kotor"
  // untuk autosave saat berpindah halaman.
  const [pageIndex, setPageIndex] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const savedSnapshotRef = useRef<string>("");
  const cardTopRef = useRef<HTMLDivElement>(null);
  const firstPageRenderRef = useRef(true);
  const lastIntegrityEventRef = useRef<Record<string, number>>({});

  useEffect(() => {
    void Promise.all([
      apiRequest<WorksheetResponse>(`/murid/worksheets/${params.id}`),
      apiRequest<AttemptResponse>(`/murid/worksheets/${params.id}/attempt`),
    ])
      .then(([worksheet, attempt]) => {
        // Snapshot awal acuan kotor autosave: payload yang persis dibangun
        // dari jawaban terload (termasuk fallback urutan tampil untuk butir
        // langkah yang belum disentuh, sama seperti buildAnswersPayload),
        // supaya sekadar membuka halaman tidak dianggap mengubah jawaban.
        savedSnapshotRef.current = JSON.stringify(worksheet.data.items.map((item) => {
          const savedAnswer = attempt.data.answers.find((answer) => answer.item_id === item.id);
          const steps = item.item_type === "langkah_berurutan" && Array.isArray(item.options?.steps)
            ? item.options.steps.filter((step): step is string => typeof step === "string")
            : [];
          const answerText = (savedAnswer?.answer_text ?? "") || (steps.length ? steps.join("\n") : "");
          return {
            itemId: item.id,
            answerText,
            ...(savedAnswer?.attachment_key ? { attachmentKey: savedAnswer.attachment_key } : {}),
          };
        }));
        setData(worksheet.data);
        setStatus(attempt.data.status);
        setAnswers(Object.fromEntries(attempt.data.answers.map((answer) => [answer.item_id, answer.answer_text ?? ""])));
        // Butir langkah berurutan yang urutan tersimpannya berbeda dari urutan
        // tampil bawaan berarti sudah pernah disusun murid pada draf sebelumnya.
        setTouchedSequences(new Set(
          worksheet.data.items
            .filter((item) => {
              if (item.item_type !== "langkah_berurutan") return false;
              const saved = attempt.data.answers.find((answer) => answer.item_id === item.id)?.answer_text ?? "";
              const steps = Array.isArray(item.options?.steps)
                ? item.options.steps.filter((step): step is string => typeof step === "string")
                : [];
              return saved !== "" && steps.length > 0 && saved !== steps.join("\n");
            })
            .map((item) => item.id),
        ));
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

  // Setiap berganti halaman soal, gulir kembali ke awal kartu agar murid
  // selalu mulai membaca dari soal, bukan sisa posisi gulir halaman
  // sebelumnya. Render pertama dilewati.
  useEffect(() => {
    if (firstPageRenderRef.current) {
      firstPageRenderRef.current = false;
      return;
    }
    cardTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pageIndex]);

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

  // Butir tautan_ruas tidak dihitung: tidak ada jawaban murid di SIMAK untuk
  // butir itu (kuisnya dikerjakan di RUAS), jadi ia dikeluarkan dari pembilang
  // maupun penyebut hitungan "terjawab".
  function isItemAnswered(item: WorksheetItem): boolean {
    switch (item.item_type) {
      case "pilihan_ganda":
      case "isian_singkat":
      case "uraian":
      case "refleksi":
        return (answers[item.id] ?? "").trim() !== "";
      case "unggah_foto":
        // Unggahan foto langsung terkirim saat berkas dipilih, jadi kunci
        // lampiran tersimpan adalah satu-satunya tanda butir ini terjawab.
        return Boolean(attachmentKeys[item.id]);
      case "langkah_berurutan":
        return touchedSequences.has(item.id);
      default:
        return false;
    }
  }

  function answerProgress() {
    if (!data) return { answered: 0, total: 0 };
    const countable = data.items.filter((item) => item.item_type !== "tautan_ruas");
    return { answered: countable.filter((item) => isItemAnswered(item)).length, total: countable.length };
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

  // Kotor = payload jawaban saat ini berbeda dari snapshot terakhir yang
  // berhasil tersimpan di server.
  function isDirty() {
    if (!data || status !== "draf") return false;
    return savedSnapshotRef.current !== JSON.stringify(buildAnswersPayload());
  }

  // Ordinal 1-based butir di antara butir terhitung soal (semua kecuali
  // tautan_ruas); null untuk halaman tautan_ruas.
  function ordinalOf(index: number): number | null {
    if (!data || data.items[index].item_type === "tautan_ruas") return null;
    let ordinal = 0;
    for (let i = 0; i <= index; i += 1) {
      if (data.items[i].item_type !== "tautan_ruas") ordinal += 1;
    }
    return ordinal;
  }

  // Jalur simpan tunggal untuk simpan manual maupun autosave: PUT payload
  // yang sama seperti saveDraft selama ini. Mengembalikan true bila
  // tersimpan; snapshot + waktu simpan diperbarui hanya saat berhasil.
  async function persistDraft(): Promise<boolean> {
    if (!data || status !== "draf") return false;
    setAutoSaving(true);
    try {
      const payload = buildAnswersPayload();
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers: payload }),
      });
      savedSnapshotRef.current = JSON.stringify(payload);
      setLastSavedAt(new Date());
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draf belum dapat disimpan.");
      return false;
    } finally {
      setAutoSaving(false);
    }
  }

  // Pindah halaman dengan autosave: bila ada perubahan belum tersimpan,
  // simpan dulu; bila penyimpanan gagal, tetap di halaman ini agar murid
  // tidak kehilangan konteks (pesan error ditampilkan lewat persistDraft).
  async function goToPage(next: number) {
    if (!data) return;
    const target = Math.max(0, Math.min(next, data.items.length));
    if (target === pageIndex) return;
    if (status === "draf" && isDirty()) {
      const saved = await persistDraft();
      if (!saved) return;
    }
    setPageIndex(target);
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
    const saved = await persistDraft();
    if (saved) {
      setStatus("draf");
      setMessage("Draf jawaban tersimpan.");
    }
    setSaving(false);
  }

  async function submitWorksheet() {
    if (!data || status !== "draf") return;
    const { answered, total } = answerProgress();
    const confirmText = total === 0
      ? "Kumpulkan sekarang? Setelah terkumpul, jawaban tidak dapat diubah."
      : answered < total
        ? `Baru ${answered} dari ${total} soal terjawab. Soal yang belum dijawab akan terkumpul kosong, dan setelah terkumpul jawaban tidak dapat diubah. Kumpulkan sekarang?`
        : `Semua ${total} soal sudah terjawab. Kumpulkan sekarang? Setelah terkumpul, jawaban tidak dapat diubah.`;
    if (!(await confirmDialog(confirmText, { confirmLabel: "Kumpulkan sekarang" }))) return;
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

  const { answered: answeredCount, total: totalCount } = answerProgress();
  // Mode paginasi hanya untuk attempt yang masih bisa diedit; tampilan
  // terkumpul/dinilai tetap daftar penuh read-only seperti sebelumnya.
  const pagedMode = status === "draf" && data.items.length > 0;
  const onReview = pagedMode && pageIndex >= data.items.length;
  const currentItem = pagedMode && !onReview ? data.items[pageIndex] : null;
  const currentOrdinal = currentItem ? ordinalOf(pageIndex) : null;
  const saveIndicator = autoSaving
    ? "Menyimpan…"
    : isDirty()
      ? "Belum disimpan"
      : lastSavedAt
        ? `Tersimpan ${String(lastSavedAt.getHours()).padStart(2, "0")}:${String(lastSavedAt.getMinutes()).padStart(2, "0")}`
        : "";

  return (
    <main style={styles.container}>
      {assignmentId ? (
        <div style={styles.backRow}>
          <Link href={`/murid/assignments/${assignmentId}`} style={styles.back}>← Kembali ke penugasan</Link>
          <Link href={`/murid/modules/${data.worksheet.module_id}`} style={styles.backSecondary}>Lihat materi terkait</Link>
        </div>
      ) : (
        <Link href={`/murid/modules/${data.worksheet.module_id}`} style={styles.back}>← Kembali ke materi</Link>
      )}
      <p style={styles.eyebrow}>SIMAK · LKPD</p>
      <h1 style={styles.title}>{data.worksheet.title}</h1>
      {data.worksheet.instructions ? <p style={styles.instructions}><MathText text={data.worksheet.instructions} /></p> : null}
      {assignmentId ? <p style={styles.integrityNotice}>Untuk membantu guru meninjau proses belajar, SIMAK mencatat indikasi seperti berpindah halaman dan aktivitas clipboard. Ini bukan penilaian otomatis bahwa Anda melakukan kecurangan.</p> : null}
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}
      {assignmentId && status !== "draf" ? (
        <Link href={`/murid/assignments/${assignmentId}`} style={styles.continueButton}>Kembali ke penugasan untuk melanjutkan →</Link>
      ) : null}

      {status === "draf" ? (
        <div style={styles.progressBar}>
          <span style={styles.progressText}>
            {onReview
              ? `Periksa jawaban · Terjawab ${answeredCount} dari ${totalCount}`
              : currentOrdinal !== null
                ? `Soal ${currentOrdinal} dari ${totalCount} · Terjawab ${answeredCount}`
                : pagedMode
                  ? `Kuis RUAS · Terjawab ${answeredCount} dari ${totalCount}`
                  : `Terjawab ${answeredCount} dari ${totalCount}`}
            {pagedMode && saveIndicator ? <span style={styles.saveState}> · {saveIndicator}</span> : null}
          </span>
          <span style={styles.progressActions}>
            <button type="button" disabled={saving} onClick={() => void saveDraft()} style={styles.secondaryButtonSmall}>Simpan draf</button>
            <button type="button" disabled={saving} onClick={() => void submitWorksheet()} style={styles.primaryButtonSmall}>Kumpulkan</button>
          </span>
        </div>
      ) : null}

      {pagedMode ? (
        <nav style={styles.chipRow} aria-label="Navigasi soal">
          {data.items.map((item, index) => {
            const ordinal = ordinalOf(index);
            const isActive = index === pageIndex;
            const isAnswered = ordinal !== null && isItemAnswered(item);
            return (
              <button
                key={item.id}
                type="button"
                disabled={autoSaving}
                aria-label={ordinal !== null ? `Soal ${ordinal}${isAnswered ? ", sudah terjawab" : ""}` : "Kuis RUAS"}
                aria-current={isActive ? true : undefined}
                onClick={() => void goToPage(index)}
                style={{
                  ...styles.chip,
                  ...(isAnswered ? styles.chipAnswered : {}),
                  ...(isActive ? styles.chipActive : {}),
                }}
              >
                {ordinal !== null ? ordinal : "RUAS"}
              </button>
            );
          })}
        </nav>
      ) : null}

      <div ref={cardTopRef} style={styles.pageAnchor}>
        {pagedMode && onReview ? (
          <section style={styles.review}>
            <p style={styles.reviewSummary}>{answeredCount} dari {totalCount} soal terjawab</p>
            <p style={styles.reviewHint}>Periksa kembali sebelum mengumpulkan — setelah terkumpul, jawaban tidak dapat diubah.</p>
            <div style={styles.reviewList}>
              {data.items.map((item, index) => {
                const ordinal = ordinalOf(index);
                if (ordinal === null) {
                  return (
                    <button key={item.id} type="button" disabled={autoSaving} style={styles.reviewRow} onClick={() => void goToPage(index)}>
                      <span style={styles.reviewOrdinal}>RUAS</span>
                      <span style={styles.reviewPrompt}>Kuis RUAS — buka dari halaman soalnya</span>
                    </button>
                  );
                }
                const answered = isItemAnswered(item);
                const excerpt = item.prompt.length > 90 ? `${item.prompt.slice(0, 90)}…` : item.prompt;
                return (
                  <button key={item.id} type="button" disabled={autoSaving} style={styles.reviewRow} onClick={() => void goToPage(index)}>
                    <span style={styles.reviewOrdinal}>{ordinal}</span>
                    <span style={styles.reviewPrompt}>{excerpt}</span>
                    <span style={answered ? styles.reviewChipDone : styles.reviewChipTodo}>{answered ? "Terjawab" : "Belum dijawab"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : pagedMode && currentItem ? (
          <section style={styles.list}>
            <article style={styles.question}>
              <div style={styles.cardHead}>
                <span style={styles.cardTitle}>{currentOrdinal !== null ? `Soal ${currentOrdinal} dari ${totalCount}` : "Kuis RUAS"}</span>
                <span style={styles.metaChips}>
                  <span style={styles.typeChip}>{ITEM_TYPE_LABELS[currentItem.item_type] ?? "Soal"}</span>
                  {currentItem.points > 0 ? <span style={styles.pointsChip}>{currentItem.points} poin</span> : null}
                </span>
              </div>
              <div className="lkpd-prompt"><MathText text={currentItem.prompt} /></div>
              <AnswerField
                item={currentItem}
                value={answers[currentItem.id] ?? ""}
                disabled={false}
                onChange={(value) => setAnswer(currentItem.id, value)}
                attachmentKey={attachmentKeys[currentItem.id]}
                attachmentName={attachmentNames[currentItem.id]}
                uploading={uploadingItemId === currentItem.id}
                onPhotoUpload={(file) => void handlePhotoUpload(currentItem.id, file)}
                onSequenceMove={() => setTouchedSequences((current) => new Set(current).add(currentItem.id))}
              />
            </article>
          </section>
        ) : (
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
                  onSequenceMove={() => setTouchedSequences((current) => new Set(current).add(item.id))}
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
        )}
      </div>

      {pagedMode ? (
        <div style={styles.navBar}>
          {onReview ? (
            <>
              <button type="button" disabled={autoSaving} onClick={() => void goToPage(data.items.length - 1)} style={styles.navButton}>← Kembali ke soal terakhir</button>
              <button type="button" disabled={saving} onClick={() => void submitWorksheet()} style={{ ...styles.navButton, ...styles.navPrimary }}>Kumpulkan</button>
            </>
          ) : (
            <>
              <button type="button" disabled={pageIndex === 0 || autoSaving} onClick={() => void goToPage(pageIndex - 1)} style={styles.navButton}>← Sebelumnya</button>
              {pageIndex >= data.items.length - 1 ? (
                <button type="button" disabled={autoSaving} onClick={() => void goToPage(data.items.length)} style={{ ...styles.navButton, ...styles.navPrimary }}>Periksa jawaban →</button>
              ) : (
                <button type="button" disabled={autoSaving} onClick={() => void goToPage(pageIndex + 1)} style={{ ...styles.navButton, ...styles.navPrimary }}>Berikutnya →</button>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={styles.actions}>
          <button type="button" disabled={saving || status !== "draf"} onClick={() => void saveDraft()} style={styles.secondaryButton}>Simpan draf</button>
          <button type="button" disabled={saving || status !== "draf"} onClick={() => void submitWorksheet()} style={styles.primaryButton}>Kumpulkan LKPD</button>
        </div>
      )}
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
  onSequenceMove,
}: {
  item: WorksheetItem;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  attachmentKey?: string;
  attachmentName?: string;
  uploading: boolean;
  onPhotoUpload: (file: File) => void;
  onSequenceMove: () => void;
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
      onSequenceMove();
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
  backRow: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" as const },
  backSecondary: { color: "#667085", fontSize: 14, textDecoration: "none" },
  continueButton: { display: "inline-block", marginTop: 16, borderRadius: 8, background: "#175cd3", color: "white", padding: "12px 16px", fontWeight: 700, textDecoration: "none" },
  progressBar: { position: "sticky" as const, top: 0, zIndex: 10, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, background: "#f8f9fc", border: "1px solid #eaecf0", borderRadius: 10, padding: "10px 12px", marginTop: 20 },
  progressText: { fontWeight: 700, fontSize: 14 },
  saveState: { color: "#667085", fontWeight: 400 },
  progressActions: { display: "flex", gap: 8 },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 12 },
  chip: { minHeight: 40, minWidth: 40, padding: "8px 10px", borderRadius: 999, border: "1px solid #d0d5dd", background: "white", color: "#475467", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  chipAnswered: { background: "#eff8ff", borderColor: "#175cd3", color: "#175cd3" },
  chipActive: { background: "#175cd3", borderColor: "#175cd3", color: "white" },
  pageAnchor: { scrollMarginTop: 84 },
  cardHead: { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const },
  cardTitle: { fontWeight: 700, fontSize: 15, color: "#175cd3" },
  metaChips: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  typeChip: { background: "#f2f4f7", border: "1px solid #eaecf0", borderRadius: 999, padding: "3px 9px", color: "#475467", fontSize: 12, fontWeight: 700 },
  pointsChip: { background: "#eff8ff", border: "1px solid #b2ddff", borderRadius: 999, padding: "3px 9px", color: "#175cd3", fontSize: 12, fontWeight: 700 },
  review: { marginTop: 28, display: "grid", gap: 12 },
  reviewSummary: { fontWeight: 700, fontSize: 17, margin: 0 },
  reviewHint: { color: "#667085", lineHeight: 1.6, margin: 0 },
  reviewList: { display: "grid", gap: 8 },
  reviewRow: { display: "flex", gap: 10, alignItems: "center", textAlign: "left" as const, border: "1px solid #eaecf0", borderRadius: 10, background: "white", padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" },
  reviewOrdinal: { fontWeight: 700, color: "#175cd3", minWidth: 28 },
  reviewPrompt: { flex: 1, color: "#344054", lineHeight: 1.5 },
  reviewChipDone: { background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 999, padding: "3px 9px", color: "#027a48", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const },
  reviewChipTodo: { background: "#f9fafb", border: "1px solid #eaecf0", borderRadius: 999, padding: "3px 9px", color: "#667085", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const },
  navBar: { position: "sticky" as const, bottom: 0, zIndex: 10, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", background: "#f8f9fc", border: "1px solid #eaecf0", borderRadius: 10, padding: "10px 12px", marginTop: 16 },
  navButton: { minHeight: 48, border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "12px 18px", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  navPrimary: { border: 0, background: "#175cd3", color: "white" },
  primaryButtonSmall: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "8px 12px", fontWeight: 700 },
  secondaryButtonSmall: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "8px 12px" },
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
