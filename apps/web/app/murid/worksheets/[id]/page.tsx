"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../../lib/api";
import { advanceSavedSnapshot, diffAnswersPayload, mergeLiveAnswers, type LiveAnswer, type LivePayloadEntry } from "../../../../lib/live-kelompok";
import { prepareImageForUpload } from "../../../../lib/prepare-image";
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

type MuridGroup = {
  id: number;
  name: string;
  class_id: number;
  class_name: string;
  members: { id: number; name: string; username: string }[];
};

type AttemptResponse = {
  ok: true;
  data: {
    status: "draf" | "terkumpul" | "dinilai" | null;
    answers: { item_id: number; answer_text: string | null; attachment_key: string | null }[];
    explanations?: Record<string, string>;
    ungrouped?: boolean;
    group?: MuridGroup | null;
    last_edited_by?: { id: number; name: string } | null;
    last_edited_at?: string | null;
    total_score?: number | null;
    teacher_comment?: string | null;
    member_score?: number | null;
  };
};

type LivePresenceEntry = { student_id: number; name: string; current_item_id: number | null };
type LiveStateResponse = {
  ok: true;
  data: {
    live: boolean;
    attempt_status: "draf" | "terkumpul" | "dinilai" | null;
    answers: LiveAnswer[];
    presence: LivePresenceEntry[];
    ungrouped?: boolean;
  };
};

type ContributionTeammate = { id: number; name: string; username: string; my_score: number | null };
type ContributionRatingsResponse = {
  ok: true;
  data: {
    attempt_id: number | null;
    status: "draf" | "terkumpul" | "dinilai" | null;
    can_rate: boolean;
    teammates: ContributionTeammate[];
  };
};

const CONTRIBUTION_LABELS: Record<number, string> = {
  1: "Sangat kurang",
  2: "Kurang",
  3: "Cukup",
  4: "Baik",
  5: "Sangat baik",
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
  const [groupInfo, setGroupInfo] = useState<MuridGroup | null>(null);
  const [ungrouped, setUngrouped] = useState(false);
  const [lastEditedBy, setLastEditedBy] = useState<{ name: string; at: string | null } | null>(null);
  const [groupScore, setGroupScore] = useState<number | null>(null);
  const [groupTeacherComment, setGroupTeacherComment] = useState<string | null>(null);
  const [memberScore, setMemberScore] = useState<number | null>(null);
  const [contributionTeammates, setContributionTeammates] = useState<ContributionTeammate[] | null>(null);
  const [contributionDrafts, setContributionDrafts] = useState<Record<number, number>>({});
  const [contributionSaving, setContributionSaving] = useState(false);
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
  // Live kelompok (versi ringan — polling): presensi teman yang aktif,
  // sorotan jawaban yang baru diperbarui teman, dan catatan konflik untuk
  // butir yang sedang diketik murid ini. Semuanya hanya hidup pada attempt
  // kelompok yang masih draf.
  const [livePresence, setLivePresence] = useState<LivePresenceEntry[]>([]);
  // Gerbang kelengkapan kelompok: daftar soal (ordinal + indeks halaman)
  // yang masih kosong saat murid menekan kumpulkan — selama tidak null,
  // modal pemblokir tampil dan pengumpulan tidak mungkin terjadi.
  const [incompleteGate, setIncompleteGate] = useState<{ ordinal: number; index: number }[] | null>(null);
  const [liveFlash, setLiveFlash] = useState<{ itemId: number; editorName: string | null } | null>(null);
  const [liveConflict, setLiveConflict] = useState<{ itemId: number; editorName: string | null; key: string } | null>(null);
  const liveConflictDismissedKeyRef = useRef("");
  const displayedItemIdRef = useRef<number | null>(null);
  const pollLiveRef = useRef<() => Promise<void>>(async () => {});
  const sendHeartbeatRef = useRef<() => void>(() => {});
  // Butir yang sedang tampil menurut keadaan mentah (untuk keperluan live):
  // sama dengan butir pemutar soal; null di layar tinjauan / mode baca-saja.
  const displayedItemIdForLive = data && status === "draf" && pageIndex < data.items.length
    ? (data.items[pageIndex]?.id ?? null)
    : null;
  const liveActive = Boolean(groupInfo) && Boolean(assignmentId) && status === "draf" && Boolean(data);

  useEffect(() => {
    const attemptQuery = assignmentId ? `?assignmentId=${assignmentId}` : "";
    void Promise.all([
      apiRequest<WorksheetResponse>(`/murid/worksheets/${params.id}`),
      apiRequest<AttemptResponse>(`/murid/worksheets/${params.id}/attempt${attemptQuery}`),
    ])
      .then(([worksheet, attempt]) => {
        if (attempt.data.ungrouped) {
          // Murid belum masuk kelompok pada penugasan ini: tampilkan
          // keadaan khusus, jangan bangun pemutar soal sama sekali.
          setData(worksheet.data);
          setUngrouped(true);
          return;
        }
        applyLoadedAttempt(worksheet.data, attempt.data);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "Belum masuk.") {
          router.replace("/login");
          return;
        }
        setMessage(error instanceof Error ? error.message : "LKPD belum dapat dimuat.");
      });
  }, [params.id, router]);

  // Terapkan data attempt (beserta jawaban-jawabannya) ke keadaan halaman.
  // Dipakai muatan awal DAN penyelesaian live: saat polling melihat attempt
  // sudah dikumpulkan teman, keadaan akhir diambil sekali lagi lewat jalur
  // yang persis sama ini agar tampilan baca-sajanya identik.
  function applyLoadedAttempt(worksheetData: WorksheetResponse["data"], attemptData: AttemptResponse["data"]) {
    // Snapshot awal acuan kotor autosave: payload yang persis dibangun
    // dari jawaban terload (termasuk fallback urutan tampil untuk butir
    // langkah yang belum disentuh, sama seperti buildAnswersPayload),
    // supaya sekadar membuka halaman tidak dianggap mengubah jawaban.
    savedSnapshotRef.current = JSON.stringify(worksheetData.items.map((item) => {
      const savedAnswer = attemptData.answers.find((answer) => answer.item_id === item.id);
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
    setData(worksheetData);
    setStatus(attemptData.status ?? "draf");
    setGroupInfo(attemptData.group ?? null);
    if (attemptData.last_edited_by) {
      setLastEditedBy({ name: attemptData.last_edited_by.name, at: attemptData.last_edited_at ?? null });
    }
    if (attemptData.total_score !== undefined) setGroupScore(attemptData.total_score);
    if (attemptData.teacher_comment !== undefined) setGroupTeacherComment(attemptData.teacher_comment);
    if (attemptData.member_score !== undefined) setMemberScore(attemptData.member_score);
    if (attemptData.group && (attemptData.status ?? "draf") === "terkumpul") {
      void loadContributionRatings();
    }
    setAnswers(Object.fromEntries(attemptData.answers.map((answer) => [answer.item_id, answer.answer_text ?? ""])));
    // Butir langkah berurutan yang urutan tersimpannya berbeda dari urutan
    // tampil bawaan berarti sudah pernah disusun murid pada draf sebelumnya.
    setTouchedSequences(new Set(
      worksheetData.items
        .filter((item) => {
          if (item.item_type !== "langkah_berurutan") return false;
          const saved = attemptData.answers.find((answer) => answer.item_id === item.id)?.answer_text ?? "";
          const steps = Array.isArray(item.options?.steps)
            ? item.options.steps.filter((step): step is string => typeof step === "string")
            : [];
          return saved !== "" && steps.length > 0 && saved !== steps.join("\n");
        })
        .map((item) => item.id),
    ));
    setAttachmentKeys(Object.fromEntries(
      attemptData.answers.filter((answer) => answer.attachment_key).map((answer) => [answer.item_id, answer.attachment_key!]),
    ));
    setExplanations(Object.fromEntries(
      Object.entries(attemptData.explanations ?? {}).map(([itemId, text]) => [Number(itemId), text]),
    ));
  }

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

  // --- Live kelompok (versi ringan — polling) ------------------------------
  // Heartbeat memberi tahu server butir yang sedang dibuka murid ini;
  // polling mengambil presensi teman + jawaban tersimpan terbaru. Keduanya
  // hanya berjalan pada attempt kelompok yang masih draf (liveActive) dan
  // hanya saat tab terlihat. Fungsi terbaru selalu disalin ke ref agar
  // interval tidak pernah memakai closure basi.
  useEffect(() => {
    pollLiveRef.current = pollLive;
    sendHeartbeatRef.current = sendHeartbeat;
  });

  useEffect(() => {
    displayedItemIdRef.current = displayedItemIdForLive;
  }, [displayedItemIdForLive]);

  useEffect(() => {
    if (!liveActive) return;
    sendHeartbeatRef.current();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") sendHeartbeatRef.current();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [liveActive, data?.worksheet.id, assignmentId]);

  // Butir berganti (navigasi pemutar) → detak segera, tanpa menunggu interval.
  useEffect(() => {
    if (!liveActive) return;
    sendHeartbeatRef.current();
  }, [liveActive, displayedItemIdForLive]);

  useEffect(() => {
    if (!liveActive) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void pollLiveRef.current();
    }, 4000);
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void pollLiveRef.current();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [liveActive, data?.worksheet.id, assignmentId]);

  // Sorotan "baru diperbarui teman" hanya singgah beberapa detik.
  useEffect(() => {
    if (!liveFlash) return;
    const timer = window.setTimeout(() => setLiveFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [liveFlash]);

  function sendHeartbeat() {
    if (!data || !assignmentId) return;
    void apiRequest(`/murid/worksheets/${data.worksheet.id}/presence`, {
      method: "POST",
      body: JSON.stringify({ assignmentId: Number(assignmentId), currentItemId: displayedItemIdRef.current }),
    }).catch(() => undefined);
  }

  async function pollLive() {
    if (!data || !assignmentId || !groupInfo) return;
    try {
      const response = await apiRequest<LiveStateResponse>(
        `/murid/worksheets/${data.worksheet.id}/live?assignmentId=${assignmentId}`,
      );
      const live = response.data;
      setLivePresence(live.presence);
      if (live.attempt_status !== null && live.attempt_status !== "draf") {
        // Teman mengumpulkan atas nama kelompok: ambil keadaan akhir
        // sekali lagi (jawaban + pembahasan) lalu selesai — status yang
        // berubah mematikan liveActive, jadi polling berhenti sendiri.
        const attempt = await apiRequest<AttemptResponse>(
          `/murid/worksheets/${data.worksheet.id}/attempt?assignmentId=${assignmentId}`,
        );
        setLivePresence([]);
        if (!attempt.data.ungrouped) applyLoadedAttempt(data, attempt.data);
        setMessage("LKPD ini sudah dikumpulkan atas nama kelompok.");
        return;
      }
      const saved = readSavedSnapshot();
      const result = mergeLiveAnswers({
        remote: live.answers,
        local: buildAnswersPayload(),
        saved,
        displayedItemId: displayedItemIdForLive,
        photoItemIds: new Set(data.items.filter((item) => item.item_type === "unggah_foto").map((item) => item.id)),
      });
      savedSnapshotRef.current = JSON.stringify(result.nextSaved);
      if (result.patches.length > 0) {
        setAnswers((current) => {
          const next = { ...current };
          for (const patch of result.patches) next[patch.itemId] = patch.answerText;
          return next;
        });
        setAttachmentKeys((current) => {
          const next = { ...current };
          for (const patch of result.patches) {
            if (patch.attachmentKey) next[patch.itemId] = patch.attachmentKey;
            else delete next[patch.itemId];
          }
          return next;
        });
        // Urutan langkah dari teman yang berbeda dari urutan tampil bawaan
        // berarti butir itu kini tersusun — hitungan terjawab mengikutinya.
        const remoteTouched = result.patches
          .filter((patch) => {
            const item = data.items.find((candidate) => candidate.id === patch.itemId);
            if (!item || item.item_type !== "langkah_berurutan") return false;
            const steps = Array.isArray(item.options?.steps)
              ? item.options.steps.filter((step): step is string => typeof step === "string")
              : [];
            return patch.answerText !== "" && steps.length > 0 && patch.answerText !== steps.join("\n");
          })
          .map((patch) => patch.itemId);
        if (remoteTouched.length > 0) {
          setTouchedSequences((current) => new Set([...current, ...remoteTouched]));
        }
      }
      if (result.updatedDisplayed) {
        setLiveFlash({ itemId: result.updatedDisplayed.itemId, editorName: result.updatedDisplayed.editorName });
      }
      if (result.conflict) {
        const key = `${result.conflict.itemId}:${result.conflict.remoteUpdatedAt ?? ""}`;
        if (liveConflictDismissedKeyRef.current !== key) {
          setLiveConflict({ itemId: result.conflict.itemId, editorName: result.conflict.editorName, key });
        }
      }
    } catch {
      // Polling yang gagal (jaringan berkedip, dsb.) diam saja — pengerjaan
      // murid tidak boleh terganggu; siklus berikutnya mencoba lagi.
    }
  }

  function dismissLiveConflict() {
    if (liveConflict) liveConflictDismissedKeyRef.current = liveConflict.key;
    setLiveConflict(null);
  }

  function setAnswer(itemId: number, value: string) {
    setAnswers((current) => ({ ...current, [itemId]: value }));
    // Ketikan murid sendiri mengakhiri sorotan "diperbarui teman" pada butir itu.
    setLiveFlash((current) => (current?.itemId === itemId ? null : current));
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

  // Baca snapshot tersimpan terakhir (bentuk entri payload, urutan butir).
  function readSavedSnapshot(): LivePayloadEntry[] {
    try {
      const parsed = JSON.parse(savedSnapshotRef.current || "[]") as LivePayloadEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Jalur simpan tunggal untuk simpan manual maupun autosave. Jaga jawaban
  // kelompok: yang dikirim HANYA butir yang berubah dari snapshot tersimpan
  // (diffAnswersPayload) — butir yang tidak disentuh murid ini tidak pernah
  // ikut terkirim, jadi simpanan dari potret halaman yang lama tidak bisa
  // menimpa jawaban tersimpan teman satu kelompok. Snapshot acuan hanya
  // maju pada butir yang terkirim. Mengembalikan true bila tersimpan (atau
  // memang tidak ada yang perlu disimpan); snapshot + waktu simpan
  // diperbarui hanya saat berhasil.
  async function persistDraft(): Promise<boolean> {
    if (!data || status !== "draf") return false;
    const current = buildAnswersPayload();
    const saved = readSavedSnapshot();
    const changed = diffAnswersPayload(current, saved);
    if (changed.length === 0) {
      // Tidak ada perubahan: tanpa permintaan pun keadaan sudah tersimpan.
      setLastSavedAt(new Date());
      return true;
    }
    setAutoSaving(true);
    try {
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/answers${assignmentId ? `?assignmentId=${assignmentId}` : ""}`, {
        method: "PUT",
        body: JSON.stringify({ answers: changed }),
      });
      savedSnapshotRef.current = JSON.stringify(advanceSavedSnapshot(saved, current, new Set(changed.map((entry) => entry.itemId))));
      setLastSavedAt(new Date());
      // Simpanan sendiri menimpa versi server — konflik live pada butir yang
      // sedang dibuka selesai dengan sendirinya.
      setLiveConflict(null);
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
      // JPG/PNG dikonversi ke WebP lebih dulu; presign menggambar berkas
      // hasil konversi agar kunci objeknya berakhiran .webp.
      const prepared = await prepareImageForUpload(file);
      const presign = await apiRequest<{
        ok: true;
        data: { upload_url: string; attachment_key: string; content_type: string };
      }>("/uploads/presign-worksheet", {
        method: "POST",
        body: JSON.stringify({
          worksheetId: data.worksheet.id,
          filename: prepared.name,
          contentType: prepared.type,
          size: prepared.size,
        }),
      });
      const upload = await fetch(presign.data.upload_url, {
        method: "PUT",
        headers: { "Content-Type": presign.data.content_type },
        body: prepared,
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

  // Soal terhitung yang belum terjawab, sebagai pasangan ordinal (untuk
  // disebut ke murid) + indeks halaman (untuk lompat ke soalnya). Memakai
  // definisi "terjawab" yang sama dengan answerProgress di halaman ini.
  function unansweredQuestions(): { ordinal: number; index: number }[] {
    if (!data) return [];
    const missing: { ordinal: number; index: number }[] = [];
    data.items.forEach((item, index) => {
      const ordinal = ordinalOf(index);
      if (ordinal !== null && !isItemAnswered(item)) missing.push({ ordinal, index });
    });
    return missing;
  }

  async function submitWorksheet() {
    if (!data || status !== "draf") return;
    // Gerbang kelengkapan khusus attempt KELOMPOK: bila masih ada soal yang
    // belum dijawab siapa pun, tampilkan modal pemblokir — pengumpulan
    // tidak mungkin dari sana. Server memberlakukan pemeriksaan yang sama
    // atas jawaban tersimpan. Attempt individu tetap memakai dialog
    // peringatan lama (boleh mengumpulkan dengan soal kosong).
    if (groupInfo) {
      const missing = unansweredQuestions();
      if (missing.length > 0) {
        setIncompleteGate(missing);
        return;
      }
    }
    const { answered, total } = answerProgress();
    const confirmText = total === 0
      ? "Kumpulkan sekarang? Setelah terkumpul, jawaban tidak dapat diubah."
      : answered < total
        ? `Baru ${answered} dari ${total} soal terjawab. Soal yang belum dijawab akan terkumpul kosong, dan setelah terkumpul jawaban tidak dapat diubah. Kumpulkan sekarang?`
        : `Semua ${total} soal sudah terjawab. Kumpulkan sekarang? Setelah terkumpul, jawaban tidak dapat diubah.`;
    if (!(await confirmDialog(confirmText, { confirmLabel: "Kumpulkan sekarang" }))) return;
    setSaving(true);
    setMessage("");
    // Simpan dulu perubahan yang belum tersimpan lewat jalur diff yang sama
    // (persistDraft), baru kumpulkan — server memeriksa keadaan tersimpan.
    const persisted = await persistDraft();
    if (!persisted) {
      setSaving(false);
      return;
    }
    try {
      const attemptQuery = assignmentId ? `?assignmentId=${assignmentId}` : "";
      await apiRequest(`/murid/worksheets/${data.worksheet.id}/submit${attemptQuery}`, { method: "POST" });
      if (assignmentId) {
        await apiRequest("/activity", {
          method: "POST",
          body: JSON.stringify({ assignmentId: Number(assignmentId), event: "kumpul" }),
        });
      }
      setStatus("terkumpul");
      setLivePresence([]);
      setMessage("LKPD berhasil dikumpulkan.");
      if (groupInfo) void loadContributionRatings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LKPD belum dapat dikumpulkan.");
    } finally {
      setSaving(false);
    }
  }

  // Penilaian kontribusi antarteman (Tahap 2): hanya nilai yang diberikan
  // murid ini yang dimuat; penilaian teman tidak pernah ditampilkan.
  async function loadContributionRatings() {
    if (!assignmentId) return;
    try {
      const response = await apiRequest<ContributionRatingsResponse>(
        `/murid/worksheets/${params.id}/contribution-ratings?assignmentId=${assignmentId}`,
      );
      setContributionTeammates(response.data.teammates);
      setContributionDrafts(Object.fromEntries(
        response.data.teammates.flatMap((teammate) => (teammate.my_score === null ? [] : [[teammate.id, teammate.my_score] as const])),
      ));
    } catch {
      // Kartu kontribusi bersifat tambahan — kegagalan memuatnya tidak
      // boleh mengganggu tampilan pengumpulan.
      setContributionTeammates(null);
    }
  }

  async function saveContributionRatings() {
    if (!assignmentId || !contributionTeammates) return;
    const ratings = contributionTeammates
      .filter((teammate) => contributionDrafts[teammate.id] !== undefined)
      .map((teammate) => ({ rateeStudentId: teammate.id, score: contributionDrafts[teammate.id]! }));
    if (ratings.length === 0) {
      setMessage("Pilih nilai kontribusi untuk minimal satu teman dulu.");
      return;
    }
    setContributionSaving(true);
    setMessage("");
    try {
      const response = await apiRequest<ContributionRatingsResponse>(
        `/murid/worksheets/${params.id}/contribution-ratings?assignmentId=${assignmentId}`,
        { method: "PUT", body: JSON.stringify({ ratings }) },
      );
      setContributionTeammates(response.data.teammates);
      setMessage("Penilaian kontribusi tersimpan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penilaian kontribusi belum dapat disimpan.");
    } finally {
      setContributionSaving(false);
    }
  }

  if (message && !data) return <main style={styles.container}><Toast message={message} onDismiss={() => setMessage("")} /><Link href="/murid">← Kembali</Link></main>;
  if (!data) return <main style={styles.container}><p>Memuat LKPD...</p></main>;

  if (ungrouped) {
    return (
      <main style={styles.container}>
        {assignmentId ? (
          <div style={styles.backRow}>
            <Link href={`/murid/assignments/${assignmentId}`} style={styles.back}>← Kembali ke penugasan</Link>
          </div>
        ) : (
          <Link href={`/murid/modules/${data.worksheet.module_id}`} style={styles.back}>← Kembali ke materi</Link>
        )}
        <p style={styles.eyebrow}>SIMAK · LKPD</p>
        <h1 style={styles.title}>{data.worksheet.title}</h1>
        <div style={styles.groupNotice}>
          <strong>👥 Penugasan berkelompok</strong>
          <p style={{ margin: 0, lineHeight: 1.6 }}>Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu.</p>
        </div>
      </main>
    );
  }

  const { answered: answeredCount, total: totalCount } = answerProgress();
  // Mode paginasi hanya untuk attempt yang masih bisa diedit; tampilan
  // terkumpul/dinilai tetap daftar penuh read-only seperti sebelumnya.
  const pagedMode = status === "draf" && data.items.length > 0;
  const onReview = pagedMode && pageIndex >= data.items.length;
  const currentItem = pagedMode && !onReview ? data.items[pageIndex] : null;
  const currentOrdinal = currentItem ? ordinalOf(pageIndex) : null;
  // Teman satu kelompok yang presensinya menunjuk butir yang sedang tampil.
  const teammatesHere = currentItem ? livePresence.filter((entry) => entry.current_item_id === currentItem.id) : [];
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
      {groupInfo ? (
        <div style={styles.groupCard}>
          <strong>👥 {groupInfo.name} · {groupInfo.class_name}</strong>
          <div style={styles.groupMembers}>
            {groupInfo.members.map((member) => <span key={member.id} className="member-chip">{member.name}</span>)}
          </div>
          {livePresence.length > 0 ? (
            <span>Aktif sekarang: {livePresence.map((entry) => entry.name).join(", ")}</span>
          ) : null}
          <span>Jawaban di halaman ini dikerjakan bersama — perubahan temanmu tampil otomatis dalam beberapa detik.</span>
          {lastEditedBy ? (
            <span>Terakhir diubah oleh {lastEditedBy.name}{lastEditedBy.at ? `, ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date(lastEditedBy.at))}` : ""}</span>
          ) : null}
        </div>
      ) : null}
      {assignmentId ? (
        <div style={styles.integrityNotice}>
          <span style={styles.integrityNoticeIcon} aria-hidden="true">ℹ️</span>
          <div>
            <p style={styles.integrityNoticeTitle}>Aktivitasmu di halaman ini dicatat</p>
            <p style={styles.integrityNoticeBody}>Untuk membantu guru meninjau proses belajar, SIMAK mencatat indikasi seperti berpindah halaman dan aktivitas clipboard. Ini bukan penilaian otomatis bahwa Anda melakukan kecurangan.</p>
          </div>
        </div>
      ) : null}
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}
      {assignmentId && status !== "draf" ? (
        <Link href={`/murid/assignments/${assignmentId}`} style={styles.continueButton}>Kembali ke penugasan untuk melanjutkan →</Link>
      ) : null}
      {groupInfo && status === "dinilai" ? (
        <div style={styles.groupScoreCard}>
          <strong>Nilai kelompok: {groupScore ?? "—"}</strong>
          {memberScore !== null ? <span>Nilaimu (disesuaikan guru): {memberScore}</span> : null}
          {groupTeacherComment ? <p style={{ margin: 0, lineHeight: 1.6 }}>Komentar guru: {groupTeacherComment}</p> : null}
        </div>
      ) : null}
      {groupInfo && status === "terkumpul" && contributionTeammates ? (
        <div style={styles.contributionCard}>
          <strong>Nilai kontribusi teman</strong>
          <p style={{ margin: 0, lineHeight: 1.6 }}>Nilai seberapa besar kontribusi tiap temanmu dalam kerja kelompok ini. Penilaianmu hanya dilihat guru.</p>
          {contributionTeammates.length === 0 ? (
            <p style={{ margin: 0 }}>Tidak ada teman satu kelompok untuk dinilai.</p>
          ) : (
            <>
              {contributionTeammates.map((teammate) => (
                <div key={teammate.id} style={styles.contributionRow}>
                  <span style={styles.contributionName}>{teammate.name}</span>
                  <span style={styles.contributionButtons}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        title={CONTRIBUTION_LABELS[score]}
                        aria-label={`${teammate.name}: ${score} — ${CONTRIBUTION_LABELS[score]}`}
                        aria-pressed={contributionDrafts[teammate.id] === score}
                        onClick={() => setContributionDrafts((current) => ({ ...current, [teammate.id]: score }))}
                        style={{ ...styles.contributionButton, ...(contributionDrafts[teammate.id] === score ? styles.contributionButtonActive : {}) }}
                      >
                        {score}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 13 }}>1 Sangat kurang · 2 Kurang · 3 Cukup · 4 Baik · 5 Sangat baik</p>
              <div>
                <button type="button" disabled={contributionSaving} onClick={() => void saveContributionRatings()} style={styles.primaryButtonSmall}>Simpan penilaian</button>
              </div>
            </>
          )}
        </div>
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
            <button type="button" disabled={saving} onClick={() => void submitWorksheet()} style={styles.primaryButtonSmall}>{groupInfo ? "Kumpulkan atas nama kelompok" : "Kumpulkan"}</button>
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
            <article
              style={{ ...styles.question, ...(liveFlash?.itemId === currentItem.id ? styles.questionLiveFlash : {}) }}
              onFocus={() => { if (liveActive) sendHeartbeatRef.current(); }}
            >
              <div style={styles.cardHead}>
                <span style={styles.cardTitle}>{currentOrdinal !== null ? `Soal ${currentOrdinal} dari ${totalCount}` : "Kuis RUAS"}</span>
                <span style={styles.metaChips}>
                  <span style={styles.typeChip}>{ITEM_TYPE_LABELS[currentItem.item_type] ?? "Soal"}</span>
                  {currentItem.points > 0 ? <span style={styles.pointsChip}>{currentItem.points} poin</span> : null}
                </span>
              </div>
              {teammatesHere.length > 0 ? (
                <span style={styles.presenceChip}>👤 {teammatesHere.map((entry) => entry.name).join(", ")} sedang mengerjakan soal ini</span>
              ) : null}
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
              {liveFlash?.itemId === currentItem.id ? (
                <p style={styles.liveUpdateNote}>Diperbarui oleh {liveFlash.editorName ?? "temanmu"}</p>
              ) : null}
              {liveConflict?.itemId === currentItem.id ? (
                <div style={styles.liveConflictNote}>
                  <span>Jawaban soal ini baru diperbarui oleh {liveConflict.editorName ?? "temanmu"} — salin dulu jawabanmu bila perlu, lalu muat ulang halaman untuk melihat versi terbaru.</span>
                  <button type="button" onClick={dismissLiveConflict} style={styles.liveConflictDismiss}>Tutup</button>
                </div>
              ) : null}
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
              <button type="button" disabled={saving} onClick={() => void submitWorksheet()} style={{ ...styles.navButton, ...styles.navPrimary }}>{groupInfo ? "Kumpulkan atas nama kelompok" : "Kumpulkan"}</button>
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
          <button type="button" disabled={saving || status !== "draf"} onClick={() => void submitWorksheet()} style={styles.primaryButton}>{groupInfo ? "Kumpulkan atas nama kelompok" : "Kumpulkan LKPD"}</button>
        </div>
      )}

      {incompleteGate ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setIncompleteGate(null)}
        >
          <div
            className="confirm-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="incomplete-gate-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="incomplete-gate-title" style={styles.gateTitle}>Masih ada soal yang belum terjawab</h2>
            <p className="confirm-message">
              LKPD kelompok hanya bisa dikumpulkan bila semua soal sudah dijawab bersama. Soal berikut masih kosong — ketuk nomornya untuk langsung ke soal itu:
            </p>
            <div style={styles.gateNumbers}>
              {incompleteGate.map((missing) => (
                <button
                  key={missing.ordinal}
                  type="button"
                  style={styles.gateNumberButton}
                  onClick={() => {
                    setIncompleteGate(null);
                    void goToPage(missing.index);
                  }}
                >
                  Soal {missing.ordinal}
                </button>
              ))}
            </div>
            <div className="confirm-actions">
              <button type="button" className="button" onClick={() => setIncompleteGate(null)}>Kembali mengerjakan</button>
            </div>
          </div>
        </div>
      ) : null}
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
  groupCard: { display: "grid", gap: 8, background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 10, padding: 14, marginTop: 16, color: "#05603a", fontSize: 14, lineHeight: 1.55 },
  groupMembers: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  groupNotice: { display: "grid", gap: 8, background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 10, padding: 16, marginTop: 20, color: "#05603a" },
  groupScoreCard: { display: "grid", gap: 6, background: "#eff8ff", border: "1px solid #b2ddff", borderRadius: 10, padding: 14, marginTop: 16, color: "#175cd3" },
  contributionCard: { display: "grid", gap: 10, background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 10, padding: 14, marginTop: 16, color: "#93370d" },
  contributionRow: { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, background: "white", border: "1px solid #eaecf0", borderRadius: 8, padding: "8px 10px" },
  contributionName: { fontWeight: 600, color: "#344054" },
  contributionButtons: { display: "flex", gap: 6 },
  contributionButton: { minWidth: 40, minHeight: 40, border: "1px solid #d0d5dd", borderRadius: 8, background: "white", color: "#475467", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  contributionButtonActive: { background: "#175cd3", borderColor: "#175cd3", color: "white" },
  integrityNotice: { display: "flex", gap: 10, alignItems: "flex-start", background: "#FFFAEB", border: "1px solid #F79009", padding: 14, borderRadius: 10 },
  integrityNoticeIcon: { fontSize: 18, lineHeight: 1.4 },
  integrityNoticeTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "#93370D", lineHeight: 1.4 },
  integrityNoticeBody: { margin: "2px 0 0", fontSize: 14, color: "#93370D", lineHeight: 1.55 },
  message: { color: "#175cd3", background: "#eff8ff", padding: 12, borderRadius: 8 },
  error: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8 },
  list: { display: "grid", gap: 16, marginTop: 28 },
  question: { display: "grid", gap: 12, border: "1px solid #eaecf0", borderRadius: 10, padding: 16 },
  questionLiveFlash: { borderColor: "#32d583", background: "#f6fef9" },
  presenceChip: { justifySelf: "start" as const, background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 999, padding: "4px 10px", color: "#05603a", fontSize: 13, fontWeight: 700 },
  liveUpdateNote: { margin: 0, color: "#027a48", background: "#ecfdf3", border: "1px solid #a6f4c5", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600 },
  liveConflictNote: { display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", color: "#93370d", background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.55 },
  liveConflictDismiss: { border: "1px solid #fedf89", borderRadius: 8, background: "white", color: "#93370d", padding: "4px 10px", fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  gateTitle: { margin: "0 0 10px", fontSize: 18, lineHeight: 1.35 },
  gateNumbers: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 14 },
  gateNumberButton: { border: "1px solid #f79009", borderRadius: 999, background: "#fffaeb", color: "#93370d", padding: "6px 14px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
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
