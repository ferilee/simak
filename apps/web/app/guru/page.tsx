"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiBase, apiRequest } from "../../lib/api";
import { Toast } from "../../components/Toast";
import { MathHtml, MathText } from "../../components/MathContent";

type ModuleSummary = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  status: "draf" | "terbit" | "arsip";
  version: number;
  viewer_count: number;
  view_count: number;
  last_viewed_at: string | null;
  updated_at: string;
};

type ModulesResponse = { ok: true; data: ModuleSummary[] };
type ModuleBlock = {
  id: number;
  sort_order: number;
  type: "teks" | "gambar" | "video" | "berkas" | "sub_bab";
  content: Record<string, unknown>;
  attachment_key: string | null;
};
type ModuleBlocksResponse = { ok: true; data: ModuleBlock[] };
type WorksheetSummary = {
  id: number;
  module_id: number | null;
  title: string;
  instructions: string | null;
  status: "draf" | "terbit" | "arsip";
  started_count: number;
  submitted_count: number;
  last_activity_at: string | null;
  updated_at: string;
};
type WorksheetsResponse = { ok: true; data: WorksheetSummary[] };
type WorksheetPreviewItem = {
  id: number;
  sort_order: number;
  item_type: string;
  prompt: string;
  options: Record<string, unknown> | null;
  answer_key: string | null;
  explanation: string | null;
  points: number;
};
type WorksheetItemsResponse = { ok: true; data: WorksheetPreviewItem[] };
type ClassSummary = { id: number; name: string; subject: string; academic_year: string; join_code: string; is_archived: boolean };
type ClassesResponse = { ok: true; data: ClassSummary[] };
type AssignmentSummary = {
  id: number;
  module_id: number | null;
  worksheet_id: number | null;
  title: string;
  instructions: string | null;
  ruas_quiz_url: string | null;
  opens_at: string;
  due_at: string;
  status: "draf" | "terbit" | "ditutup";
  classes: { id: number; name: string }[];
};
type AssignmentsResponse = { ok: true; data: AssignmentSummary[] };
type WorksheetAttemptSummary = {
  id: number;
  student_id: number;
  student_name: string;
  username: string;
  status: "draf" | "terkumpul" | "dinilai";
  submitted_at: string | null;
  total_score: number | null;
  updated_at: string;
};
type WorksheetAttemptsResponse = { ok: true; data: WorksheetAttemptSummary[] };
type ExitTicketSummary = {
  understood_3: string;
  examples_2: string;
  confusing_1: string;
  submitted_at: string;
};
type AssignmentStudentSummary = {
  id: number;
  name: string;
  username: string;
  status: "belum" | "draf" | "terkumpul" | "dinilai";
  submitted_at: string | null;
  total_score: number | null;
  exit_ticket: ExitTicketSummary | null;
};
type AssignmentGradingSummary = {
  assignment: { id: number; title: string; worksheet_id: number | null; due_at: string };
  students: AssignmentStudentSummary[];
};
type AssignmentGradingResponse = { ok: true; data: AssignmentGradingSummary };
type SessionReportRow = {
  student_id: number;
  name: string;
  username: string;
  class_name: string;
  hadir: boolean;
  opened_at: string | null;
  started_lkpd_at: string | null;
  submission_status: "belum" | "draf" | "terkumpul" | "dinilai";
  submitted_at: string | null;
  total_score: number | null;
  exit_ticket_submitted: boolean;
  exit_ticket_submitted_at: string | null;
  ruas_opened_at: string | null;
  ruas_score: number | null;
  ruas_match_status: "cocok" | "tidak_ditemukan" | "duplikat" | null;
};
type SessionReport = {
  assignment: { id: number; title: string; opens_at: string; due_at: string };
  summary: { total_students: number; hadir: number; submitted: number; exit_ticket: number; ruas_scored: number; ruas_unmatched: number };
  students: SessionReportRow[];
  ruas_unmatched: { identifier: string; student_name: string | null; score: number; match_status: string; note: string | null }[];
};
type SessionReportResponse = { ok: true; data: SessionReport };
type RangeReport = {
  from: string;
  to: string;
  summary: { assignments: number; students: number; hadir: number; submitted: number; exit_ticket: number; ruas_scored: number; ruas_unmatched: number };
  assignments: SessionReport[];
};
type RangeReportResponse = { ok: true; data: RangeReport };
type RuasImportResponse = { ok: true; data: { assignment_id: number; total: number; cocok: number; tidak_ditemukan: number; duplikat: number; unmatched: { identifier: string; student_name: string | null; score: number; match_status: string; note: string | null }[] } };
type IntegrityAlert = {
  assignment_id: number;
  assignment_title: string;
  student_id: number;
  student_name: string;
  username: string;
  total_events: number;
  risk: "info" | "perlu_ditinjau" | "peringatan";
  last_event: string;
  events: { event: string; count: number }[];
};
type IntegrityAlertsResponse = { ok: true; data: IntegrityAlert[] };
type WorksheetAttemptItem = {
  id: number;
  prompt: string;
  item_type: string;
  points: number;
  answer_key: string | null;
  answer_text: string | null;
  attachment_key: string | null;
  score: number | null;
  teacher_note: string | null;
};
type WorksheetAttemptDetail = {
  attempt: {
    id: number;
    student_name: string;
    username: string;
    status: "draf" | "terkumpul" | "dinilai";
    submitted_at: string | null;
    total_score: number | null;
    teacher_comment: string | null;
  };
  items: WorksheetAttemptItem[];
};
type WorksheetAttemptDetailResponse = { ok: true; data: WorksheetAttemptDetail };
type MeResponse = { ok: true; user: { role: "guru" | "murid" } };

export default function GuruPage() {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [moduleQuery, setModuleQuery] = useState("");
  const [moduleStatusFilter, setModuleStatusFilter] = useState<"semua" | "draf" | "terbit" | "arsip">("semua");
  const [moduleSubjectFilter, setModuleSubjectFilter] = useState("semua");
  const [moduleSort, setModuleSort] = useState<"terbaru" | "judul" | "penonton">("terbaru");
  const [worksheetQuery, setWorksheetQuery] = useState("");
  const [worksheetStatusFilter, setWorksheetStatusFilter] = useState<"semua" | "draf" | "terbit" | "arsip">("semua");
  const [worksheetModuleFilter, setWorksheetModuleFilter] = useState("semua");
  const [worksheetSort, setWorksheetSort] = useState<"terbaru" | "judul" | "dikerjakan">("terbaru");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [blockHtml, setBlockHtml] = useState("");
  const [blockType, setBlockType] = useState<"teks" | "sub_bab" | "video" | "lampiran">("teks");
  const [attachment, setAttachment] = useState<File | null>(null);
  const blockFirstFieldRef = useRef<HTMLElement | null>(null);
  const [worksheets, setWorksheets] = useState<WorksheetSummary[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [className, setClassName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [classAcademicYear, setClassAcademicYear] = useState("2026/2027");
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [selectedWorksheetId, setSelectedWorksheetId] = useState<number | null>(null);
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [worksheetInstructions, setWorksheetInstructions] = useState("");
  const [itemType, setItemType] = useState<"pilihan_ganda" | "isian_singkat" | "uraian" | "unggah_foto" | "langkah_berurutan" | "refleksi" | "tautan_ruas">("pilihan_ganda");
  const [itemPrompt, setItemPrompt] = useState("");
  const [itemOptions, setItemOptions] = useState("");
  const [itemAnswerKey, setItemAnswerKey] = useState("");
  const [itemExplanation, setItemExplanation] = useState("");
  const [itemPoints, setItemPoints] = useState("10");
  const [itemTolerance, setItemTolerance] = useState("0");
  const [itemUnit, setItemUnit] = useState("");
  const [itemPlaceholder, setItemPlaceholder] = useState("");
  const [itemMaxFiles, setItemMaxFiles] = useState("1");
  const [itemPhotoInstruction, setItemPhotoInstruction] = useState("");
  const [itemSteps, setItemSteps] = useState("");
  const [itemCorrectOrder, setItemCorrectOrder] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [itemUrlLabel, setItemUrlLabel] = useState("Buka Kuis di RUAS");
  const [subBabTitle, setSubBabTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoCaption, setVideoCaption] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [assignmentOpensAt, setAssignmentOpensAt] = useState(() => toDateTimeLocal(new Date()));
  const [assignmentDueAt, setAssignmentDueAt] = useState(() => toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [assignmentClassIds, setAssignmentClassIds] = useState<number[]>([]);
  const [assignmentRuasUrl, setAssignmentRuasUrl] = useState("");
  const [attempts, setAttempts] = useState<WorksheetAttemptSummary[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<number | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<WorksheetAttemptDetail | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [assignmentSummary, setAssignmentSummary] = useState<AssignmentGradingSummary | null>(null);
  const [assignmentSummaryLoading, setAssignmentSummaryLoading] = useState(false);
  const [selectedReportAssignmentId, setSelectedReportAssignmentId] = useState<number | null>(null);
  const [sessionReport, setSessionReport] = useState<SessionReport | null>(null);
  const [sessionReportLoading, setSessionReportLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => toDateInputLocal(new Date()));
  const [rangeTo, setRangeTo] = useState(() => toDateInputLocal(new Date()));
  const [rangeReport, setRangeReport] = useState<RangeReport | null>(null);
  const [rangeReportLoading, setRangeReportLoading] = useState(false);
  const [ruasImportAssignmentId, setRuasImportAssignmentId] = useState<number | null>(null);
  const [ruasImportText, setRuasImportText] = useState("");
  const [ruasImportLoading, setRuasImportLoading] = useState(false);
  const [ruasImportResult, setRuasImportResult] = useState<RuasImportResponse["data"] | null>(null);
  const [integrityAlerts, setIntegrityAlerts] = useState<IntegrityAlert[]>([]);
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [teacherComment, setTeacherComment] = useState("");
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [guruStep, setGuruStep] = useState(0);
  const [previewModule, setPreviewModule] = useState<ModuleSummary | null>(null);
  const [previewBlocks, setPreviewBlocks] = useState<ModuleBlock[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewWorksheet, setPreviewWorksheet] = useState<WorksheetSummary | null>(null);
  const [previewItems, setPreviewItems] = useState<WorksheetPreviewItem[] | null>(null);
  const [previewWorksheetLoading, setPreviewWorksheetLoading] = useState(false);
  const [previewWorksheetError, setPreviewWorksheetError] = useState("");

  const guruSteps = [
    { title: "Bangun materi", mobileTitle: "Materi", description: "Buat modul dan susun isi" },
    { title: "Siapkan LKPD", mobileTitle: "LKPD", description: "Buat lembar kerja dan soal" },
    { title: "Atur kelas", mobileTitle: "Kelas", description: "Kelola kelas tujuan" },
    { title: "Terbitkan tugas", mobileTitle: "Terbit", description: "Hubungkan materi ke kelas" },
    { title: "Pantau hasil", mobileTitle: "Hasil", description: "Nilai dan lihat rekap" },
  ];

  const moduleSubjects = [...new Set(modules.map((module) => module.subject))].sort((a, b) => a.localeCompare(b, "id"));
  const normalizedModuleQuery = moduleQuery.trim().toLowerCase();
  const visibleModules = modules
    .filter((module) => moduleStatusFilter === "semua" || module.status === moduleStatusFilter)
    .filter((module) => moduleSubjectFilter === "semua" || module.subject === moduleSubjectFilter)
    .filter((module) => normalizedModuleQuery === ""
      || module.title.toLowerCase().includes(normalizedModuleQuery)
      || module.subject.toLowerCase().includes(normalizedModuleQuery)
      || (module.description ?? "").toLowerCase().includes(normalizedModuleQuery))
    .slice()
    .sort((a, b) => {
      if (moduleSort === "judul") return a.title.localeCompare(b.title, "id");
      if (moduleSort === "penonton") return b.viewer_count - a.viewer_count || a.title.localeCompare(b.title, "id");
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  function resetModuleFilters() {
    setModuleQuery("");
    setModuleStatusFilter("semua");
    setModuleSubjectFilter("semua");
    setModuleSort("terbaru");
  }

  const normalizedWorksheetQuery = worksheetQuery.trim().toLowerCase();
  const visibleWorksheets = worksheets
    .filter((worksheet) => worksheetStatusFilter === "semua" || worksheet.status === worksheetStatusFilter)
    .filter((worksheet) => worksheetModuleFilter === "semua" || worksheet.module_id === Number(worksheetModuleFilter))
    .filter((worksheet) => normalizedWorksheetQuery === ""
      || worksheet.title.toLowerCase().includes(normalizedWorksheetQuery)
      || (worksheet.instructions ?? "").toLowerCase().includes(normalizedWorksheetQuery))
    .slice()
    .sort((a, b) => {
      if (worksheetSort === "judul") return a.title.localeCompare(b.title, "id");
      if (worksheetSort === "dikerjakan") return b.started_count - a.started_count || a.title.localeCompare(b.title, "id");
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  function resetWorksheetFilters() {
    setWorksheetQuery("");
    setWorksheetStatusFilter("semua");
    setWorksheetModuleFilter("semua");
    setWorksheetSort("terbaru");
  }

  async function loadModules() {
    try {
      const me = await apiRequest<MeResponse>("/auth/me");
      if (me.user.role !== "guru") {
        setMessage("Akun ini berperan sebagai murid. Keluar dahulu lalu masuk dengan akun guru.");
        return;
      }
      const [response, worksheetResponse, classResponse, assignmentResponse, integrityResponse] = await Promise.all([
        apiRequest<ModulesResponse>("/modules"),
        apiRequest<WorksheetsResponse>("/worksheets"),
        apiRequest<ClassesResponse>("/classes"),
        apiRequest<AssignmentsResponse>("/assignments"),
        apiRequest<IntegrityAlertsResponse>("/integrity/alerts"),
      ]);
      setModules(response.data);
      setSelectedId((current) => current ?? response.data[0]?.id ?? null);
      setWorksheets(worksheetResponse.data);
      setSelectedWorksheetId((current) => current ?? worksheetResponse.data[0]?.id ?? null);
      setClasses(classResponse.data.filter((kelas) => !kelas.is_archived));
      setAssignments(assignmentResponse.data);
      setIntegrityAlerts(integrityResponse.data);
      setRuasImportAssignmentId((current) => current ?? assignmentResponse.data[0]?.id ?? null);
      setAssignmentClassIds((current) => current.length > 0 ? current : classResponse.data.filter((kelas) => !kelas.is_archived).map((kelas) => kelas.id));
    } catch (error) {
      if (error instanceof Error && (error.message === "Belum masuk." || error.message.includes("Peran Anda"))) {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Modul belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  useEffect(() => {
    void loadModules();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void apiRequest<IntegrityAlertsResponse>("/integrity/alerts")
        .then((response) => setIntegrityAlerts(response.data))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!previewModule && !previewWorksheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreview();
        closeWorksheetPreview();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewModule, previewWorksheet]);

  async function loadAttempts(worksheetId: number) {
    setAttemptLoading(true);
    try {
      const response = await apiRequest<WorksheetAttemptsResponse>(`/worksheets/${worksheetId}/attempts`);
      setAttempts(response.data);
      setSelectedAttemptId((current) => current && response.data.some((attempt) => attempt.id === current)
        ? current
        : response.data[0]?.id ?? null);
      if (response.data.length === 0) {
        setSelectedAttemptId(null);
        setAttemptDetail(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pengumpulan belum dapat dimuat.");
    } finally {
      setAttemptLoading(false);
    }
  }

  async function loadAttemptDetail(worksheetId: number, attemptId: number) {
    setAttemptLoading(true);
    try {
      const response = await apiRequest<WorksheetAttemptDetailResponse>(`/worksheets/${worksheetId}/attempts/${attemptId}`);
      setAttemptDetail(response.data);
      setScoreDrafts(Object.fromEntries(response.data.items.map((item) => [item.id, item.score === null ? "" : String(item.score)])));
      setNoteDrafts(Object.fromEntries(response.data.items.map((item) => [item.id, item.teacher_note ?? ""])));
      setTeacherComment(response.data.attempt.teacher_comment ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Detail pengumpulan belum dapat dimuat.");
    } finally {
      setAttemptLoading(false);
    }
  }

  async function openAnswerPhoto(attachmentKey: string) {
    if (!selectedWorksheetId) return;
    try {
      const response = await apiRequest<{ ok: true; data: { download_url: string } }>(
        `/uploads/download-answer?key=${encodeURIComponent(attachmentKey)}&worksheetId=${selectedWorksheetId}`,
      );
      window.open(response.data.download_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Foto jawaban belum dapat dibuka.");
    }
  }

  async function loadAssignmentSummary(assignmentId: number) {
    setSelectedAssignmentId(assignmentId);
    setAssignmentSummaryLoading(true);
    try {
      const response = await apiRequest<AssignmentGradingResponse>(`/grading/assignments/${assignmentId}`);
      setAssignmentSummary(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ringkasan penugasan belum dapat dimuat.");
    } finally {
      setAssignmentSummaryLoading(false);
    }
  }

  async function loadSessionReport(assignmentId: number) {
    setSelectedReportAssignmentId(assignmentId);
    setSessionReportLoading(true);
    try {
      const response = await apiRequest<SessionReportResponse>(`/reports/session?assignmentId=${assignmentId}`);
      setSessionReport(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rekap sesi belum dapat dimuat.");
    } finally {
      setSessionReportLoading(false);
    }
  }

  async function downloadSessionReport(assignmentId: number, format: "csv" | "pdf") {
    try {
      const response = await fetch(`${apiBase}/reports/session?assignmentId=${assignmentId}&format=${format}`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "Rekap belum dapat diunduh.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `simak-rekap-${assignmentId}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rekap belum dapat diunduh.");
    }
  }

  async function loadRangeReport() {
    if (!rangeFrom || !rangeTo) return;
    setRangeReportLoading(true);
    try {
      const response = await apiRequest<RangeReportResponse>(`/reports/range?from=${rangeFrom}&to=${rangeTo}`);
      setRangeReport(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rekap rentang belum dapat dimuat.");
    } finally {
      setRangeReportLoading(false);
    }
  }

  async function downloadRangeReport(format: "csv" | "pdf") {
    try {
      const response = await fetch(`${apiBase}/reports/range?from=${rangeFrom}&to=${rangeTo}&format=${format}`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "Rekap rentang belum dapat diunduh.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `simak-rekap-${rangeFrom}-${rangeTo}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rekap rentang belum dapat diunduh.");
    }
  }

  async function importRuasScores(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ruasImportAssignmentId) {
      setMessage("Pilih penugasan untuk impor nilai RUAS.");
      return;
    }
    const rows = parseRuasCsv(ruasImportText);
    if (rows.length === 0) {
      setMessage("Isi CSV belum memiliki baris nilai yang valid.");
      return;
    }
    setRuasImportLoading(true);
    try {
      const response = await apiRequest<RuasImportResponse>("/reports/ruas-import", {
        method: "POST",
        body: JSON.stringify({ assignmentId: ruasImportAssignmentId, rows }),
      });
      setRuasImportResult(response.data);
      setMessage(`Impor RUAS selesai: ${response.data.cocok} cocok, ${response.data.tidak_ditemukan} tidak ditemukan, ${response.data.duplikat} duplikat.`);
      if (selectedReportAssignmentId === ruasImportAssignmentId) await loadSessionReport(ruasImportAssignmentId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nilai RUAS belum dapat diimpor.");
    } finally {
      setRuasImportLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedWorksheetId) {
      setAttempts([]);
      setSelectedAttemptId(null);
      setAttemptDetail(null);
      return;
    }
    void loadAttempts(selectedWorksheetId);
  }, [selectedWorksheetId]);

  useEffect(() => {
    if (selectedWorksheetId && selectedAttemptId) void loadAttemptDetail(selectedWorksheetId, selectedAttemptId);
  }, [selectedWorksheetId, selectedAttemptId]);

  async function createModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await apiRequest<{ ok: true; data: ModuleSummary }>("/modules", {
        method: "POST",
        body: JSON.stringify({ title, subject, description }),
      });
      setTitle("");
      setSubject("");
      setDescription("");
      setSelectedId(response.data.id);
      setShowCreateModule(false);
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modul belum dapat dibuat.");
    }
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await apiRequest<{ ok: true; data: ClassSummary }>("/classes", {
        method: "POST",
        body: JSON.stringify({ name: className, subject: classSubject, academicYear: classAcademicYear }),
      });
      setClassName("");
      setClassSubject("");
      setAssignmentClassIds((current) => [...current, response.data.id]);
      setMessage(`Kelas dibuat. Kode gabung: ${response.data.join_code}`);
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kelas belum dapat dibuat.");
    }
  }

  async function changeStatus(module: ModuleSummary) {
    const status = module.status === "terbit" ? "arsip" : "terbit";
    try {
      await apiRequest(`/modules/${module.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status modul belum dapat diubah.");
    }
  }

  async function openPreview(module: ModuleSummary) {
    setPreviewModule(module);
    setPreviewBlocks(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const response = await apiRequest<ModuleBlocksResponse>(`/modules/${module.id}/blocks`);
      setPreviewBlocks(response.data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Isi materi belum dapat dimuat.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewModule(null);
    setPreviewBlocks(null);
    setPreviewError("");
    setPreviewLoading(false);
  }

  async function openWorksheetPreview(worksheet: WorksheetSummary) {
    setPreviewWorksheet(worksheet);
    setPreviewItems(null);
    setPreviewWorksheetError("");
    setPreviewWorksheetLoading(true);
    try {
      const response = await apiRequest<WorksheetItemsResponse>(`/worksheets/${worksheet.id}/items`);
      setPreviewItems(response.data);
    } catch (error) {
      setPreviewWorksheetError(error instanceof Error ? error.message : "Soal LKPD belum dapat dimuat.");
    } finally {
      setPreviewWorksheetLoading(false);
    }
  }

  function closeWorksheetPreview() {
    setPreviewWorksheet(null);
    setPreviewItems(null);
    setPreviewWorksheetError("");
    setPreviewWorksheetLoading(false);
  }

  function setBlockFirstField(element: HTMLElement | null) {
    blockFirstFieldRef.current = element;
  }

  async function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const added = blockType === "teks"
      ? await addTextBlock(event)
      : blockType === "sub_bab"
        ? await addSubBabBlock(event)
        : blockType === "video"
          ? await addVideoBlock(event)
          : await addAttachmentBlock(event);
    if (added) blockFirstFieldRef.current?.focus();
  }

  async function addTextBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !blockHtml.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          content: { type: "teks", html: blockHtml },
          sortOrder: 0,
        }),
      });
      setBlockHtml("");
      setMessage("Blok materi ditambahkan.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat ditambahkan.");
      return false;
    }
  }

  async function addSubBabBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !subBabTitle.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          content: { type: "sub_bab", title: subBabTitle.trim() },
          sortOrder: 0,
        }),
      });
      setSubBabTitle("");
      setMessage("Blok materi ditambahkan.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat ditambahkan.");
      return false;
    }
  }

  async function addVideoBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !videoUrl.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          content: {
            type: "video",
            youtubeUrl: videoUrl.trim(),
            ...(videoCaption.trim() ? { caption: videoCaption.trim() } : {}),
          },
          sortOrder: 0,
        }),
      });
      setVideoUrl("");
      setVideoCaption("");
      setMessage("Blok materi ditambahkan.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat ditambahkan.");
      return false;
    }
  }

  async function addAttachmentBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !attachment) return false;
    const form = event.currentTarget;
    setMessage("");
    try {
      if (attachment.size > 10 * 1024 * 1024) throw new Error("Ukuran lampiran maksimal 10 MB.");
      const presign = await apiRequest<{
        ok: true;
        data: { upload_url: string; attachment_key: string; content_type: string };
      }>("/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          moduleId: selectedId,
          filename: attachment.name,
          contentType: attachment.type,
          size: attachment.size,
        }),
      });
      const upload = await fetch(presign.data.upload_url, {
        method: "PUT",
        headers: { "Content-Type": presign.data.content_type },
        body: attachment,
      });
      if (!upload.ok) throw new Error("Lampiran gagal diunggah ke penyimpanan.");

      const isImage = attachment.type.startsWith("image/");
      await apiRequest(`/modules/${selectedId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          content: isImage
            ? { type: "gambar", attachmentKey: presign.data.attachment_key, caption: attachment.name }
            : { type: "berkas", attachmentKey: presign.data.attachment_key, label: attachment.name },
          attachmentKey: presign.data.attachment_key,
          sortOrder: 0,
        }),
      });
      setAttachment(null);
      form.reset();
      setMessage("Lampiran ditambahkan.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lampiran belum dapat ditambahkan.");
      return false;
    }
  }

  async function createWorksheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      const response = await apiRequest<{ ok: true; data: WorksheetSummary }>("/worksheets", {
        method: "POST",
        body: JSON.stringify({ moduleId: selectedId, title: worksheetTitle, instructions: worksheetInstructions }),
      });
      setWorksheetTitle("");
      setWorksheetInstructions("");
      setSelectedWorksheetId(response.data.id);
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LKPD belum dapat dibuat.");
    }
  }

  async function changeWorksheetStatus(worksheet: WorksheetSummary) {
    const status = worksheet.status === "terbit" ? "arsip" : "terbit";
    try {
      await apiRequest(`/worksheets/${worksheet.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status LKPD belum dapat diubah.");
    }
  }

  async function addWorksheetItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorksheetId) return;
    const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
    let options: Record<string, unknown>;
    let answerKey: string | undefined = itemAnswerKey.trim() || undefined;
    if (itemType === "pilihan_ganda") {
      options = { itemType, options: lines(itemOptions) };
    } else if (itemType === "isian_singkat") {
      options = {
        itemType,
        tolerance: Number(itemTolerance) || 0,
        caseSensitive: false,
        ...(itemUnit.trim() ? { unit: itemUnit.trim() } : {}),
      };
    } else if (itemType === "uraian") {
      options = { itemType, ...(itemPlaceholder.trim() ? { placeholder: itemPlaceholder.trim() } : {}) };
    } else if (itemType === "unggah_foto") {
      const maxFiles = Math.min(5, Math.max(1, Number(itemMaxFiles) || 1));
      options = {
        itemType,
        maxFiles,
        ...(itemPhotoInstruction.trim() ? { instruction: itemPhotoInstruction.trim() } : {}),
      };
    } else if (itemType === "langkah_berurutan") {
      options = { itemType, steps: lines(itemSteps) };
      answerKey = lines(itemCorrectOrder).join("\n") || undefined;
    } else if (itemType === "refleksi") {
      options = { itemType };
      answerKey = undefined;
    } else {
      const url = itemUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        setMessage("URL tautan RUAS harus diawali http:// atau https://.");
        return;
      }
      options = { itemType, url, label: itemUrlLabel.trim() || "Buka Kuis di RUAS" };
      answerKey = undefined;
    }
    try {
      await apiRequest(`/worksheets/${selectedWorksheetId}/items`, {
        method: "POST",
        body: JSON.stringify({
          itemType,
          prompt: itemPrompt,
          options,
          answerKey,
          explanation: itemExplanation.trim() || undefined,
          points: Number(itemPoints) || 10,
        }),
      });
      setItemPrompt("");
      setItemOptions("");
      setItemAnswerKey("");
      setItemExplanation("");
      setItemTolerance("0");
      setItemUnit("");
      setItemPlaceholder("");
      setItemMaxFiles("1");
      setItemPhotoInstruction("");
      setItemSteps("");
      setItemCorrectOrder("");
      setItemUrl("");
      setItemUrlLabel("Buka Kuis di RUAS");
      setMessage("Soal LKPD ditambahkan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Soal belum dapat ditambahkan.");
    }
  }

  async function saveGrades() {
    if (!selectedWorksheetId || !selectedAttemptId || !attemptDetail) return;
    const answers = attemptDetail.items
      .filter((item) => scoreDrafts[item.id]?.trim() !== "")
      .map((item) => ({
        itemId: item.id,
        score: Number(scoreDrafts[item.id]),
        teacherNote: noteDrafts[item.id]?.trim() || undefined,
      }));
    if (answers.some((answer) => !Number.isFinite(answer.score) || answer.score < 0)) {
      setMessage("Nilai harus berupa angka nol atau lebih.");
      return;
    }
    if (answers.some((answer) => answer.score > (attemptDetail.items.find((item) => item.id === answer.itemId)?.points ?? 0))) {
      setMessage("Nilai tidak boleh melebihi poin soal.");
      return;
    }
    try {
      await apiRequest(`/worksheets/${selectedWorksheetId}/attempts/${selectedAttemptId}`, {
        method: "PATCH",
        body: JSON.stringify({ answers, teacherComment: teacherComment.trim() || undefined }),
      });
      setMessage("Penilaian disimpan.");
      await loadAttempts(selectedWorksheetId);
      await loadAttemptDetail(selectedWorksheetId, selectedAttemptId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penilaian belum dapat disimpan.");
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedWorksheetId || assignmentClassIds.length === 0) {
      setMessage("Pilih modul, LKPD, dan minimal satu kelas tujuan.");
      return;
    }
    try {
      await apiRequest("/assignments", {
        method: "POST",
        body: JSON.stringify({
          moduleId: selectedId,
          worksheetId: selectedWorksheetId,
          title: assignmentTitle,
          instructions: assignmentInstructions || undefined,
          opensAt: new Date(assignmentOpensAt).toISOString(),
          dueAt: new Date(assignmentDueAt).toISOString(),
          ruasQuizUrl: assignmentRuasUrl || undefined,
          classIds: assignmentClassIds,
        }),
      });
      setAssignmentTitle("");
      setAssignmentInstructions("");
      setAssignmentRuasUrl("");
      setMessage("Penugasan dibuat sebagai draf.");
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penugasan belum dapat dibuat.");
    }
  }

  async function changeAssignmentStatus(assignment: AssignmentSummary) {
    const status = assignment.status === "terbit" ? "ditutup" : "terbit";
    try {
      await apiRequest(`/assignments/${assignment.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status penugasan belum dapat diubah.");
    }
  }

  if (loading) return <main className="dashboard-shell container"><p>Memuat ruang guru...</p></main>;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header container">
        <div>
          <Link className="brand" href="/" aria-label="SIMAK beranda">
            <span className="brand-mark" aria-hidden="true">S</span>
            SIMAK
          </Link>
          <p className="eyebrow" style={{ marginTop: 28 }}>Ruang guru</p>
          <h1 className="dashboard-title">Ruang kerja guru</h1>
          <p className="dashboard-subtitle">Susun pembelajaran dari materi hingga rekap hasil dalam langkah yang jelas.</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" onClick={() => void logout()} className="button button-secondary">Keluar</button>
        </div>
      </header>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      <div className="container wizard-layout wizard-theme-guru">
        <aside className="wizard-sidebar" aria-label="Langkah ruang guru">
          <div className="wizard-profile">
            <span className="wizard-avatar">G</span>
            <div>
              <strong>Ruang guru</strong>
              <span>Alur pengelolaan kelas</span>
            </div>
          </div>
          <nav className="wizard-steps">
            {guruSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                className={`wizard-step ${guruStep === index ? "is-active" : ""} ${guruStep > index ? "is-complete" : ""}`}
                onClick={() => setGuruStep(index)}
                aria-current={guruStep === index ? "step" : undefined}
              >
                <span className="wizard-step-number">{guruStep > index ? "✓" : index + 1}</span>
                <span>
                  <strong>
                    <span className="wizard-step-title-desktop">{step.title}</span>
                    <span className="wizard-step-title-mobile">{step.mobileTitle}</span>
                  </strong>
                  <small>{step.description}</small>
                </span>
              </button>
            ))}
          </nav>
          <p className="wizard-side-note">Mulai dari materi, lanjutkan ke LKPD dan kelas, lalu pantau hasil belajar murid.</p>
        </aside>

        <section className="wizard-main" aria-label="Isi ruang guru">
          <div className="wizard-main-heading">
            <div>
              <p className="eyebrow">Langkah {guruStep + 1} dari {guruSteps.length}</p>
              <h2>{guruSteps[guruStep].title}</h2>
              <p>{guruSteps[guruStep].description}.</p>
            </div>
            <div className="guru-heading-indicators">
              {integrityAlerts.length > 0 ? <span className="guru-integrity-badge">{integrityAlerts.length} perlu ditinjau</span> : null}
              <span className="wizard-role-chip">Guru</span>
            </div>
          </div>

          <div className="guru-content">
      <section className="wizard-step-panel module-overview" data-active={guruStep === 0}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Materi saya</h2>
            <p className="module-section-summary">{visibleModules.length === modules.length ? `${modules.length} modul · pilih satu untuk mengelola isinya` : `Menampilkan ${visibleModules.length} dari ${modules.length} materi`}</p>
          </div>
          {modules.length > 0 ? (
            <button type="button" className="module-create-trigger" onClick={() => setShowCreateModule((current) => !current)}>
              {showCreateModule ? "Tutup" : "+ Buat modul"}
            </button>
          ) : <span className="module-create-hint">Mulai dari modul pertama</span>}
        </div>

        {modules.length > 0 ? (
          <div style={styles.moduleToolbar}>
            <input
              type="search"
              value={moduleQuery}
              onChange={(event) => setModuleQuery(event.target.value)}
              placeholder="Cari materi…"
              aria-label="Cari materi"
              style={{ ...styles.input, ...styles.moduleSearchInput }}
            />
            <select
              value={moduleStatusFilter}
              onChange={(event) => setModuleStatusFilter(event.target.value as "semua" | "draf" | "terbit" | "arsip")}
              aria-label="Saring status materi"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="semua">Semua status</option>
              <option value="draf">Draf</option>
              <option value="terbit">Terbit</option>
              <option value="arsip">Arsip</option>
            </select>
            <select
              value={moduleSubjectFilter}
              onChange={(event) => setModuleSubjectFilter(event.target.value)}
              aria-label="Saring mata pelajaran"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="semua">Semua mata pelajaran</option>
              {moduleSubjects.map((subjectName) => (
                <option key={subjectName} value={subjectName}>{subjectName}</option>
              ))}
            </select>
            <select
              value={moduleSort}
              onChange={(event) => setModuleSort(event.target.value as "terbaru" | "judul" | "penonton")}
              aria-label="Urutkan materi"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="terbaru">Terakhir diubah</option>
              <option value="judul">Judul A–Z</option>
              <option value="penonton">Paling banyak dilihat</option>
            </select>
          </div>
        ) : null}

        {showCreateModule || modules.length === 0 ? (
          <form onSubmit={createModule} className="module-create-panel" style={styles.form}>
            <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul modul" style={styles.input} />
            <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Mata pelajaran" style={styles.input} />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Deskripsi singkat" rows={3} style={styles.textarea} />
            <button type="submit" style={styles.primaryButton}>Buat draf</button>
          </form>
        ) : null}

        {modules.length === 0 ? <p style={styles.empty}>Belum ada modul. Buat modul pertama untuk mulai menyusun materi.</p> : visibleModules.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ margin: "0 0 10px" }}>Tidak ada materi yang cocok dengan pencarian/saringan ini.</p>
            <button type="button" onClick={resetModuleFilters} style={styles.secondaryButton}>Atur ulang saringan</button>
          </div>
        ) : (
          <div className="module-list">
            {visibleModules.map((module) => (
              <article key={module.id} className={`module-row ${selectedId === module.id ? "is-selected" : ""}`}>
                <button type="button" onClick={() => setSelectedId(module.id)} className="module-row-main">
                  <strong>{module.title}</strong>
                  <span>{module.subject} · versi {module.version}</span>
                  <span>{module.viewer_count > 0 ? `Dilihat ${module.viewer_count} murid` : "Belum ada murid yang melihat"}</span>
                </button>
                <span className={`module-status module-status-${module.status}`}>{module.status}</span>
                <button type="button" onClick={() => void openPreview(module)} className="module-row-action">
                  Pratinjau
                </button>
                <button type="button" onClick={() => void changeStatus(module)} className="module-row-action">
                  {module.status === "terbit" ? "Arsipkan" : "Terbitkan"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 2} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Kelas saya</h2>
            <p className="module-section-summary">{classes.length} kelas aktif · kode gabung tersedia di setiap baris</p>
          </div>
        </div>
        <details className="guru-collapsible" open={classes.length === 0}>
          <summary>+ Buat kelas</summary>
          <form onSubmit={createClass} style={styles.form}>
            <input required value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Nama kelas, misalnya XI DPIB" style={styles.input} />
            <input required value={classSubject} onChange={(event) => setClassSubject(event.target.value)} placeholder="Mata pelajaran" style={styles.input} />
            <input required value={classAcademicYear} onChange={(event) => setClassAcademicYear(event.target.value)} placeholder="Tahun ajaran, misalnya 2026/2027" style={styles.input} />
            <button type="submit" style={styles.primaryButton}>Buat kelas</button>
          </form>
        </details>
        {classes.length > 0 ? <div className="module-list">{classes.map((kelas) => <article key={kelas.id} className="resource-row"><div className="module-row-main"><strong>{kelas.name}</strong><span>{kelas.subject} · {kelas.academic_year}</span><span>Kode gabung: <strong>{kelas.join_code}</strong></span></div><span className="module-status module-status-terbit">aktif</span></article>)}</div> : <p style={styles.empty}>Belum ada kelas. Buat kelas untuk dapat dipilih sebagai tujuan penugasan.</p>}
      </section>

      {selectedId ? (
        <section className="wizard-step-panel" data-active={guruStep === 0} style={styles.panel}>
          <h2 style={styles.sectionTitle}>Tambah isi materi</h2>
          <div style={styles.blockTypeRow} role="group" aria-label="Jenis blok">
            {([
              { value: "teks", label: "Teks" },
              { value: "sub_bab", label: "Sub-bab" },
              { value: "video", label: "Video" },
              { value: "lampiran", label: "Lampiran" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={blockType === option.value}
                onClick={() => setBlockType(option.value)}
                style={blockType === option.value ? styles.blockTypeButtonActive : styles.blockTypeButton}
              >
                {option.label}
              </button>
            ))}
          </div>
          <form onSubmit={addBlock} style={styles.form}>
            {blockType === "teks" ? (
              <>
                <textarea
                  ref={setBlockFirstField}
                  required
                  value={blockHtml}
                  onChange={(event) => setBlockHtml(event.target.value)}
                  placeholder="Tulis isi materi. HTML dasar seperti <strong>tebal</strong> boleh digunakan."
                  rows={6}
                  style={styles.textarea}
                />
                <small style={styles.muted}>Rumus LaTeX didukung: gunakan <code>\(...\)</code> untuk rumus sebaris atau <code>\[...\]</code> untuk rumus terpisah.</small>
              </>
            ) : null}
            {blockType === "sub_bab" ? (
              <input
                ref={setBlockFirstField}
                required
                value={subBabTitle}
                onChange={(event) => setSubBabTitle(event.target.value)}
                placeholder="Judul sub-bab"
                style={styles.input}
              />
            ) : null}
            {blockType === "video" ? (
              <>
                <input
                  ref={setBlockFirstField}
                  required
                  type="url"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="URL video YouTube"
                  style={styles.input}
                />
                <input
                  value={videoCaption}
                  onChange={(event) => setVideoCaption(event.target.value)}
                  placeholder="Keterangan video (opsional)"
                  style={styles.input}
                />
              </>
            ) : null}
            {blockType === "lampiran" ? (
              <>
                <div style={styles.filePickerRow}>
                  <label ref={setBlockFirstField} htmlFor="module-attachment-file" tabIndex={-1} style={styles.filePickerButton}>
                    Pilih gambar/PDF
                  </label>
                  <span style={styles.fileName}>{attachment ? attachment.name : "Belum ada berkas dipilih"}</span>
                  <input
                    id="module-attachment-file"
                    required
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                    style={styles.hiddenFileInput}
                  />
                </div>
                <small style={styles.muted}>JPG, PNG, WebP, atau PDF. Maksimal 10 MB.</small>
              </>
            ) : null}
            <button type="submit" style={styles.primaryButton}>
              {blockType === "teks" ? "Tambahkan blok" : blockType === "sub_bab" ? "Tambahkan sub-bab" : blockType === "video" ? "Tambahkan video" : "Unggah lampiran"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 1} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>LKPD</h2>
            <p className="module-section-summary">{visibleWorksheets.length === worksheets.length ? `${worksheets.length} LKPD · pilih satu untuk menambah soal` : `Menampilkan ${visibleWorksheets.length} dari ${worksheets.length} LKPD`}</p>
          </div>
        </div>
        <details className="guru-collapsible" open={worksheets.length === 0}>
          <summary>+ Buat LKPD</summary>
          <form onSubmit={createWorksheet} style={styles.form}>
            <input required value={worksheetTitle} onChange={(event) => setWorksheetTitle(event.target.value)} placeholder="Judul LKPD" style={styles.input} />
            <textarea value={worksheetInstructions} onChange={(event) => setWorksheetInstructions(event.target.value)} placeholder="Petunjuk pengerjaan" rows={3} style={styles.textarea} />
            <button type="submit" style={styles.primaryButton}>Buat LKPD dari modul terpilih</button>
          </form>
        </details>
        {worksheets.length > 0 ? (
          <div style={styles.moduleToolbar}>
            <input
              type="search"
              value={worksheetQuery}
              onChange={(event) => setWorksheetQuery(event.target.value)}
              placeholder="Cari LKPD…"
              aria-label="Cari LKPD"
              style={{ ...styles.input, ...styles.moduleSearchInput }}
            />
            <select
              value={worksheetStatusFilter}
              onChange={(event) => setWorksheetStatusFilter(event.target.value as "semua" | "draf" | "terbit" | "arsip")}
              aria-label="Saring status LKPD"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="semua">Semua status</option>
              <option value="draf">Draf</option>
              <option value="terbit">Terbit</option>
              <option value="arsip">Arsip</option>
            </select>
            <select
              value={worksheetModuleFilter}
              onChange={(event) => setWorksheetModuleFilter(event.target.value)}
              aria-label="Saring modul LKPD"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="semua">Semua modul</option>
              {modules.map((module) => (
                <option key={module.id} value={String(module.id)}>{module.title}</option>
              ))}
            </select>
            <select
              value={worksheetSort}
              onChange={(event) => setWorksheetSort(event.target.value as "terbaru" | "judul" | "dikerjakan")}
              aria-label="Urutkan LKPD"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="terbaru">Terakhir diubah</option>
              <option value="judul">Judul A–Z</option>
              <option value="dikerjakan">Paling banyak dikerjakan</option>
            </select>
          </div>
        ) : null}
        {worksheets.length === 0 ? <p style={styles.empty}>Belum ada LKPD.</p> : visibleWorksheets.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ margin: "0 0 10px" }}>Tidak ada LKPD yang cocok dengan pencarian/saringan ini.</p>
            <button type="button" onClick={resetWorksheetFilters} style={styles.secondaryButton}>Atur ulang saringan</button>
          </div>
        ) : (
          <div className="module-list">
            {visibleWorksheets.map((worksheet) => (
              <article key={worksheet.id} className={`module-row ${selectedWorksheetId === worksheet.id ? "is-selected" : ""}`}>
                <button type="button" onClick={() => setSelectedWorksheetId(worksheet.id)} className="module-row-main">
                  <strong>{worksheet.title}</strong>
                  <span>{worksheet.status}</span>
                  <span>{worksheet.started_count > 0 ? `${worksheet.started_count} murid mengerjakan · ${worksheet.submitted_count} mengumpulkan` : "Belum ada murid yang mengerjakan"}</span>
                </button>
                <span className={`module-status module-status-${worksheet.status}`}>{worksheet.status}</span>
                <button type="button" onClick={() => void openWorksheetPreview(worksheet)} className="module-row-action">
                  Pratinjau
                </button>
                <button type="button" onClick={() => void changeWorksheetStatus(worksheet)} className="module-row-action">
                  {worksheet.status === "terbit" ? "Arsipkan" : "Terbitkan"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedWorksheetId ? (
        <section className="wizard-step-panel selected-resource-panel" data-active={guruStep === 1} style={styles.panel}>
          <div className="selected-resource-heading">
            <div>
              <p className="module-section-summary">LKPD terpilih</p>
              <h2 style={styles.sectionTitle}>Tambah soal LKPD</h2>
            </div>
          </div>
          <form onSubmit={addWorksheetItem} style={styles.form}>
            <select value={itemType} onChange={(event) => setItemType(event.target.value as typeof itemType)} style={styles.input}>
              <option value="pilihan_ganda">Pilihan ganda</option>
              <option value="isian_singkat">Isian singkat</option>
              <option value="uraian">Uraian</option>
              <option value="unggah_foto">Unggah foto</option>
              <option value="langkah_berurutan">Langkah berurutan</option>
              <option value="refleksi">Refleksi</option>
              <option value="tautan_ruas">Tautan RUAS</option>
            </select>
            <textarea required value={itemPrompt} onChange={(event) => setItemPrompt(event.target.value)} placeholder="Pertanyaan" rows={3} style={styles.textarea} />
            <small style={styles.muted}>Rumus LaTeX didukung: <code>\(...\)</code> sebaris atau <code>\[...\]</code> terpisah.</small>
            {itemType === "pilihan_ganda" ? <textarea required value={itemOptions} onChange={(event) => setItemOptions(event.target.value)} placeholder="Pilihan jawaban, satu per baris" rows={4} style={styles.textarea} /> : null}
            {itemType === "isian_singkat" ? (
              <>
                <label style={styles.label}>Toleransi angka
                  <input type="number" min={0} step="any" value={itemTolerance} onChange={(event) => setItemTolerance(event.target.value)} placeholder="0" style={styles.input} />
                </label>
                <input value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} placeholder="Satuan/unit (opsional), misalnya cm" style={styles.input} />
              </>
            ) : null}
            {itemType === "uraian" ? <input value={itemPlaceholder} onChange={(event) => setItemPlaceholder(event.target.value)} placeholder="Petunjuk jawaban (opsional)" style={styles.input} /> : null}
            {itemType === "unggah_foto" ? (
              <>
                <label style={styles.label}>Jumlah file maksimum (1–5)
                  <input type="number" min={1} max={5} value={itemMaxFiles} onChange={(event) => setItemMaxFiles(event.target.value)} style={styles.input} />
                </label>
                <input value={itemPhotoInstruction} onChange={(event) => setItemPhotoInstruction(event.target.value)} placeholder="Instruksi foto (opsional)" style={styles.input} />
              </>
            ) : null}
            {itemType === "langkah_berurutan" ? (
              <>
                <textarea required value={itemSteps} onChange={(event) => setItemSteps(event.target.value)} placeholder="Langkah (satu per baris, urutan tampil)" rows={4} style={styles.textarea} />
                <textarea required value={itemCorrectOrder} onChange={(event) => setItemCorrectOrder(event.target.value)} placeholder="Urutan benar (satu langkah per baris, sesuai teks langkahnya)" rows={4} style={styles.textarea} />
              </>
            ) : null}
            {itemType === "tautan_ruas" ? (
              <>
                <input required type="url" value={itemUrl} onChange={(event) => setItemUrl(event.target.value)} placeholder="URL kuis RUAS, diawali https://" style={styles.input} />
                <input value={itemUrlLabel} onChange={(event) => setItemUrlLabel(event.target.value)} placeholder="Label tombol" style={styles.input} />
              </>
            ) : null}
            {itemType !== "refleksi" && itemType !== "tautan_ruas" && itemType !== "langkah_berurutan" ? (
              <input
                value={itemAnswerKey}
                onChange={(event) => setItemAnswerKey(event.target.value)}
                placeholder={itemType === "uraian" || itemType === "unggah_foto" ? "Kunci jawaban / Rubrik penilaian (opsional)" : "Kunci jawaban (opsional)"}
                style={styles.input}
              />
            ) : null}
            <textarea value={itemExplanation} onChange={(event) => setItemExplanation(event.target.value)} placeholder="Pembahasan (opsional, tampil untuk murid setelah mengumpulkan)" rows={3} style={styles.textarea} />
            <input type="number" min={0} max={1000} value={itemPoints} onChange={(event) => setItemPoints(event.target.value)} placeholder={itemType === "refleksi" ? "Poin (refleksi biasanya 0)" : "Poin"} style={styles.input} />
            <button type="submit" style={styles.primaryButton}>Tambahkan soal</button>
          </form>
        </section>
      ) : null}

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 3} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Penugasan ke kelas</h2>
            <p className="module-section-summary">{assignments.length} penugasan · pilih aksi dari daftar</p>
          </div>
        </div>
        <details className="guru-collapsible">
          <summary>+ Buat penugasan</summary>
          <form onSubmit={createAssignment} style={styles.form}>
            <input required value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="Judul penugasan" style={styles.input} />
            <textarea value={assignmentInstructions} onChange={(event) => setAssignmentInstructions(event.target.value)} placeholder="Petunjuk penugasan" rows={3} style={styles.textarea} />
            <label style={styles.label}>Modul
              <select value={selectedId ?? ""} onChange={(event) => setSelectedId(Number(event.target.value))} style={styles.input}>
                <option value="">Pilih modul</option>
                {modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
              </select>
            </label>
            <label style={styles.label}>LKPD
              <select value={selectedWorksheetId ?? ""} onChange={(event) => setSelectedWorksheetId(Number(event.target.value))} style={styles.input}>
                <option value="">Pilih LKPD</option>
                {worksheets.map((worksheet) => <option key={worksheet.id} value={worksheet.id}>{worksheet.title}</option>)}
              </select>
            </label>
            <div style={styles.checkboxList}>
              <span style={styles.label}>Kelas tujuan</span>
              {classes.map((kelas) => <label key={kelas.id} style={styles.checkbox}><input type="checkbox" checked={assignmentClassIds.includes(kelas.id)} onChange={(event) => setAssignmentClassIds((current) => event.target.checked ? [...current, kelas.id] : current.filter((id) => id !== kelas.id))} />{kelas.name} · {kelas.subject}</label>)}
            </div>
            <label style={styles.label}>Dibuka pada<input type="datetime-local" value={assignmentOpensAt} onChange={(event) => setAssignmentOpensAt(event.target.value)} style={styles.input} /></label>
            <label style={styles.label}>Batas pengumpulan<input type="datetime-local" value={assignmentDueAt} onChange={(event) => setAssignmentDueAt(event.target.value)} style={styles.input} /></label>
            <input type="url" value={assignmentRuasUrl} onChange={(event) => setAssignmentRuasUrl(event.target.value)} placeholder="Tautan kuis RUAS (opsional)" style={styles.input} />
            <button type="submit" style={styles.primaryButton}>Buat draf penugasan</button>
          </form>
        </details>
        {assignments.length > 0 ? <div className="module-list">{assignments.map((assignment) => <article key={assignment.id} className="resource-row resource-row-assignment"><div className="module-row-main"><strong>{assignment.title}</strong><span>{assignment.classes.map((kelas) => kelas.name).join(", ") || "Tanpa kelas"}</span><span>{assignment.status} · batas {formatDate(assignment.due_at)}</span></div><div className="resource-row-actions"><button type="button" onClick={() => void loadSessionReport(assignment.id)} style={styles.secondaryButton}>{selectedReportAssignmentId === assignment.id ? "Segarkan rekap" : "Lihat rekap"}</button><button type="button" onClick={() => void loadAssignmentSummary(assignment.id)} style={styles.secondaryButton}>{selectedAssignmentId === assignment.id ? "Segarkan exit ticket" : "Lihat exit ticket"}</button><button type="button" onClick={() => void changeAssignmentStatus(assignment)} style={styles.secondaryButton}>{assignment.status === "terbit" ? "Tutup" : "Terbitkan"}</button></div></article>)}</div> : <p style={styles.empty}>Belum ada penugasan.</p>}
      </section>

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 4} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Indikasi integritas</h2>
            <p className="module-section-summary">Sinyal aktivitas untuk ditinjau, bukan bukti otomatis kecurangan</p>
          </div>
          <span className="module-section-count">{integrityAlerts.length} siswa</span>
        </div>
        {integrityAlerts.length === 0 ? <p style={styles.empty}>Belum ada indikasi integritas yang perlu ditinjau.</p> : (
          <div className="module-list">
            {integrityAlerts.map((alert) => (
              <article key={`${alert.assignment_id}:${alert.student_id}`} className="resource-row integrity-alert-row">
                <div className="module-row-main">
                  <strong>{alert.student_name} <span className="integrity-username">({alert.username})</span></strong>
                  <span>{alert.assignment_title} · {alert.total_events} kejadian · terakhir {formatDate(alert.last_event)}</span>
                  <span>{alert.events.map((event) => `${integrityEventLabel(event.event)} ${event.count}×`).join(" · ")}</span>
                </div>
                <span className={`integrity-risk integrity-risk-${alert.risk}`}>{integrityRiskLabel(alert.risk)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 4} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Rekap berdasarkan rentang tanggal</h2>
            <p className="module-section-summary">Ringkas aktivitas kelas dalam periode tertentu</p>
          </div>
        </div>
        <details className="guru-collapsible">
          <summary>+ Atur rentang tanggal</summary>
          <form onSubmit={(event) => { event.preventDefault(); void loadRangeReport(); }} style={styles.form}>
            <div style={styles.dateRange}>
              <label style={styles.label}>Dari<input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} style={styles.input} /></label>
              <label style={styles.label}>Sampai<input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} style={styles.input} /></label>
            </div>
            <button type="submit" style={styles.primaryButton}>Lihat rekap rentang</button>
          </form>
        </details>
        {rangeReportLoading ? <p style={styles.muted}>Memuat rekap rentang...</p> : null}
        {!rangeReportLoading && rangeReport ? (
          <>
            <p style={styles.muted}>{rangeReport.from} s.d. {rangeReport.to}</p>
            <div style={styles.actionRow}>
              <button type="button" onClick={() => void downloadRangeReport("csv")} style={styles.secondaryButton}>Unduh Excel (CSV)</button>
              <button type="button" onClick={() => void downloadRangeReport("pdf")} style={styles.secondaryButton}>Unduh PDF</button>
            </div>
            <div style={styles.reportSummary}>
              <div style={styles.reportMetric}><strong>{rangeReport.summary.assignments}</strong><span>Penugasan</span></div>
              <div style={styles.reportMetric}><strong>{rangeReport.summary.students}</strong><span>Murid</span></div>
              <div style={styles.reportMetric}><strong>{rangeReport.summary.hadir}</strong><span>Hadir</span></div>
              <div style={styles.reportMetric}><strong>{rangeReport.summary.submitted}</strong><span>Kumpul LKPD</span></div>
              <div style={styles.reportMetric}><strong>{rangeReport.summary.ruas_scored}</strong><span>Nilai RUAS</span></div>
            </div>
            {rangeReport.assignments.length === 0 ? <p style={styles.empty}>Tidak ada penugasan terbit/ditutup pada rentang ini.</p> : (
              <div style={styles.reportTableWrap}>
                <table style={styles.reportTable}>
                  <thead><tr><th style={styles.reportCell}>Penugasan</th><th style={styles.reportCell}>Dibuka</th><th style={styles.reportCell}>Murid</th><th style={styles.reportCell}>Hadir</th><th style={styles.reportCell}>Kumpul</th><th style={styles.reportCell}>Exit</th><th style={styles.reportCell}>RUAS</th></tr></thead>
                  <tbody>{rangeReport.assignments.map((report) => <tr key={report.assignment.id}>
                    <td style={styles.reportCell}><strong>{report.assignment.title}</strong></td>
                    <td style={styles.reportCell}>{formatDate(report.assignment.opens_at)}</td>
                    <td style={styles.reportCell}>{report.summary.total_students}</td>
                    <td style={styles.reportCell}>{report.summary.hadir}</td>
                    <td style={styles.reportCell}>{report.summary.submitted}</td>
                    <td style={styles.reportCell}>{report.summary.exit_ticket}</td>
                    <td style={styles.reportCell}>{report.summary.ruas_scored}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 4} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Impor nilai RUAS</h2>
            <p className="module-section-summary">Masukkan nilai dari CSV ke penugasan terpilih</p>
          </div>
        </div>
        <details className="guru-collapsible">
          <summary>+ Buka impor nilai</summary>
          <p style={styles.muted}>Format CSV sederhana: <code>NIS,nilai,nama</code>. Kolom nama bersifat opsional. Username murid juga boleh dipakai sebagai identifier.</p>
          <form onSubmit={importRuasScores} style={styles.form}>
            <label style={styles.label}>Penugasan
              <select value={ruasImportAssignmentId ?? ""} onChange={(event) => setRuasImportAssignmentId(Number(event.target.value) || null)} style={styles.input}>
                <option value="">Pilih penugasan</option>
                {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
              </select>
            </label>
            <input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setRuasImportText); }} style={styles.input} />
            <textarea required value={ruasImportText} onChange={(event) => setRuasImportText(event.target.value)} placeholder="NIS,nilai,nama\n12345,85,Siti" rows={6} style={styles.textarea} />
            <button type="submit" disabled={ruasImportLoading} style={styles.primaryButton}>{ruasImportLoading ? "Mengimpor..." : "Impor nilai RUAS"}</button>
          </form>
        </details>
        {ruasImportResult ? <p style={styles.muted}>Baris: {ruasImportResult.total} · cocok: {ruasImportResult.cocok} · tidak ditemukan: {ruasImportResult.tidak_ditemukan} · duplikat: {ruasImportResult.duplikat}</p> : null}
        {ruasImportResult?.unmatched.length ? <div style={styles.warningBox}>Baris yang perlu diperiksa: {ruasImportResult.unmatched.map((row) => `${row.identifier} (${row.match_status})`).join(", ")}</div> : null}
      </section>

      {selectedReportAssignmentId ? (
        <section className="wizard-step-panel" data-active={guruStep === 4} style={styles.panel}>
          <h2 style={styles.sectionTitle}>Rekap sesi</h2>
          {sessionReportLoading ? <p style={styles.muted}>Memuat rekap sesi...</p> : null}
          {!sessionReportLoading && sessionReport ? (
            <>
              <p style={styles.muted}>{sessionReport.assignment.title} · batas {formatDate(sessionReport.assignment.due_at)}</p>
              <div style={styles.actionRow}>
                <button type="button" onClick={() => void downloadSessionReport(sessionReport.assignment.id, "csv")} style={styles.secondaryButton}>Unduh Excel (CSV)</button>
                <button type="button" onClick={() => void downloadSessionReport(sessionReport.assignment.id, "pdf")} style={styles.secondaryButton}>Unduh PDF</button>
              </div>
              <div style={styles.reportSummary}>
                <div style={styles.reportMetric}><strong>{sessionReport.summary.total_students}</strong><span>Murid</span></div>
                <div style={styles.reportMetric}><strong>{sessionReport.summary.hadir}</strong><span>Hadir</span></div>
                <div style={styles.reportMetric}><strong>{sessionReport.summary.submitted}</strong><span>Kumpul LKPD</span></div>
                <div style={styles.reportMetric}><strong>{sessionReport.summary.exit_ticket}</strong><span>Exit ticket</span></div>
              </div>
              {sessionReport.students.length === 0 ? <p style={styles.empty}>Belum ada murid di kelas tujuan.</p> : (
                <div style={styles.reportTableWrap}>
                  <table style={styles.reportTable}>
                    <thead><tr><th style={styles.reportCell}>Murid</th><th style={styles.reportCell}>Presensi</th><th style={styles.reportCell}>LKPD</th><th style={styles.reportCell}>Nilai</th><th style={styles.reportCell}>Exit ticket</th><th style={styles.reportCell}>RUAS</th><th style={styles.reportCell}>Nilai RUAS</th></tr></thead>
                    <tbody>{sessionReport.students.map((student) => <tr key={student.student_id}>
                      <td style={styles.reportCell}><strong>{student.name}</strong><br /><span style={styles.muted}>{student.username} · {student.class_name}</span></td>
                      <td style={styles.reportCell}>{student.hadir ? "Hadir" : "Belum hadir"}</td>
                      <td style={styles.reportCell}>{student.submission_status}</td>
                      <td style={styles.reportCell}>{student.total_score === null ? "—" : student.total_score}</td>
                      <td style={styles.reportCell}>{student.exit_ticket_submitted ? "Sudah" : "Belum"}</td>
                      <td style={styles.reportCell}>{student.ruas_opened_at ? "Dibuka" : "Belum"}</td>
                      <td style={styles.reportCell}>{student.ruas_score === null ? "—" : student.ruas_score}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {selectedAssignmentId ? (
        <section className="wizard-step-panel" data-active={guruStep === 4} style={styles.panel}>
          <h2 style={styles.sectionTitle}>Ringkasan exit ticket</h2>
          {assignmentSummaryLoading ? <p style={styles.muted}>Memuat jawaban exit ticket...</p> : null}
          {!assignmentSummaryLoading && assignmentSummary?.students.every((student) => !student.exit_ticket) ? <p style={styles.empty}>Belum ada murid yang mengirim exit ticket untuk penugasan ini.</p> : null}
          {!assignmentSummaryLoading && assignmentSummary ? (
            <div style={styles.exitTicketLayout}>
              {assignmentSummary.students.map((student) => student.exit_ticket ? (
                <article key={student.id} style={styles.exitTicketCard}>
                  <div style={styles.assignmentInfo}>
                    <strong>{student.name}</strong>
                    <span style={styles.muted}>{student.username} · dikirim {formatDate(student.exit_ticket.submitted_at)}</span>
                  </div>
                  <div style={styles.exitTicketField}><strong>3 hal yang dipahami</strong><p>{student.exit_ticket.understood_3}</p></div>
                  <div style={styles.exitTicketField}><strong>2 contoh penerapan</strong><p>{student.exit_ticket.examples_2}</p></div>
                  <div style={styles.exitTicketField}><strong>1 hal yang membingungkan</strong><p>{student.exit_ticket.confusing_1}</p></div>
                </article>
              ) : null)}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedWorksheetId ? (
        <section className="wizard-step-panel teacher-grading-section" data-active={guruStep === 4} style={styles.panel}>
          <h2 style={styles.sectionTitle}>Pengumpulan LKPD</h2>
          {attemptLoading && attempts.length === 0 ? <p style={styles.muted}>Memuat pengumpulan...</p> : null}
          {!attemptLoading && attempts.length === 0 ? <p style={styles.empty}>Belum ada murid yang mengumpulkan LKPD ini.</p> : null}
          {attempts.length > 0 ? (
            <div className="teacher-attempt-layout">
              <div className="teacher-attempt-list" style={styles.list}>
                {attempts.map((attempt) => (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => setSelectedAttemptId(attempt.id)}
                    style={{ ...styles.attempt, borderColor: selectedAttemptId === attempt.id ? "#175cd3" : "#eaecf0" }}
                  >
                    <strong>{attempt.student_name}</strong>
                    <span style={styles.muted}>{attempt.username} · {attempt.status}</span>
                    <span style={styles.muted}>{attempt.total_score === null ? "Belum dinilai" : `Nilai ${attempt.total_score}`}</span>
                  </button>
                ))}
              </div>
              {attemptDetail ? (
                <div className="teacher-attempt-review" style={styles.review}>
                  <h3 style={styles.reviewTitle}>{attemptDetail.attempt.student_name}</h3>
                  <p style={styles.muted}>{attemptDetail.attempt.username} · status {attemptDetail.attempt.status}</p>
                  {attemptDetail.items.map((item, index) => (
                    <article key={item.id} className="teacher-answer-card" style={styles.answerCard}>
                      <strong>{index + 1}. <MathText text={item.prompt} /></strong>
                      <p style={styles.answerText}><MathText text={item.answer_text || "Tidak ada jawaban."} /></p>
                      {item.attachment_key ? (
                        <button
                          type="button"
                          onClick={() => { if (item.attachment_key) void openAnswerPhoto(item.attachment_key); }}
                          style={styles.secondaryButton}
                        >
                          Lihat foto jawaban
                        </button>
                      ) : null}
                      <small style={styles.muted}>Kunci: <MathText text={item.answer_key || "Tidak ada kunci otomatis."} /> · Maksimal {item.points} poin</small>
                      <input
                        type="number"
                        min={0}
                        max={item.points}
                        step="0.01"
                        value={scoreDrafts[item.id] ?? ""}
                        onChange={(event) => setScoreDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Nilai soal"
                        style={styles.input}
                      />
                      <textarea
                        value={noteDrafts[item.id] ?? ""}
                        onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Catatan untuk murid (opsional)"
                        rows={2}
                        style={styles.textarea}
                      />
                    </article>
                  ))}
                  <textarea
                    value={teacherComment}
                    onChange={(event) => setTeacherComment(event.target.value)}
                    placeholder="Komentar umum untuk murid (opsional)"
                    rows={3}
                    style={styles.textarea}
                  />
                  <button type="button" onClick={() => void saveGrades()} style={styles.primaryButton}>Simpan penilaian</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
          </div>

          <footer className="wizard-footer">
            <button type="button" className="button button-secondary" onClick={() => setGuruStep((current) => Math.max(0, current - 1))} disabled={guruStep === 0}>← Sebelumnya</button>
            <button type="button" className="button" onClick={() => setGuruStep((current) => Math.min(guruSteps.length - 1, current + 1))} disabled={guruStep === guruSteps.length - 1}>Langkah berikutnya →</button>
          </footer>
        </section>
      </div>

      {previewModule ? (
        <div style={styles.modalOverlay} onClick={closePreview}>
          <div
            style={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label={`Pratinjau ${previewModule.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div style={styles.modalHeading}>
                <p style={styles.eyebrow}>Pratinjau — tampilan seperti yang dilihat murid</p>
                <h2 style={styles.modalTitle}><MathText text={previewModule.title} /></h2>
                <p style={styles.muted}>
                  {previewModule.subject} · <span className={`module-status module-status-${previewModule.status}`}>{previewModule.status}</span>
                </p>
                {previewModule.status !== "terbit" ? (
                  <p style={styles.modalNote}>Modul ini belum terbit; murid belum dapat melihatnya.</p>
                ) : null}
                {previewModule.description ? (
                  <p style={styles.muted}><MathText text={previewModule.description} /></p>
                ) : null}
                {previewModule.viewer_count > 0 ? (
                  <p style={styles.muted}>
                    Dilihat oleh {previewModule.viewer_count} murid · {previewModule.view_count} kali dibuka
                    {previewModule.last_viewed_at ? ` · terakhir ${formatDate(previewModule.last_viewed_at)}` : ""}
                  </p>
                ) : (
                  <p style={styles.muted}>Belum ada murid yang tercatat melihat materi ini.</p>
                )}
                <p style={styles.muted}>Jumlah dihitung dari murid unik yang membuka materi ini atau penugasan yang berisi materi ini.</p>
              </div>
              <button type="button" onClick={closePreview} style={styles.modalClose} aria-label="Tutup pratinjau">×</button>
            </div>
            <div style={styles.modalBody}>
              {previewLoading ? <p style={styles.muted}>Memuat isi materi...</p> : null}
              {!previewLoading && previewError ? <p style={styles.modalError}>{previewError}</p> : null}
              {!previewLoading && !previewError && previewBlocks ? (
                previewBlocks.length === 0 ? (
                  <p style={styles.empty}>Belum ada isi pada materi ini.</p>
                ) : (
                  previewBlocks.map((block) => (
                    <PreviewBlock key={block.id} block={block} moduleId={previewModule.id} />
                  ))
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {previewWorksheet ? (
        <div style={styles.modalOverlay} onClick={closeWorksheetPreview}>
          <div
            style={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label={`Pratinjau LKPD ${previewWorksheet.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div style={styles.modalHeading}>
                <p style={styles.eyebrow}>Pratinjau LKPD — tampilan seperti yang dilihat murid</p>
                <h2 style={styles.modalTitle}><MathText text={previewWorksheet.title} /></h2>
                <p style={styles.muted}>
                  {(() => {
                    const parentModule = modules.find((module) => module.id === previewWorksheet.module_id);
                    return parentModule ? <>{parentModule.title} · </> : null;
                  })()}
                  <span className={`module-status module-status-${previewWorksheet.status}`}>{previewWorksheet.status}</span>
                </p>
                {previewWorksheet.status !== "terbit" ? (
                  <p style={styles.modalNote}>LKPD ini belum terbit; murid belum dapat melihatnya.</p>
                ) : null}
                {previewWorksheet.instructions ? (
                  <p style={styles.muted}><MathText text={previewWorksheet.instructions} /></p>
                ) : null}
                {previewWorksheet.started_count > 0 ? (
                  <p style={styles.muted}>
                    {previewWorksheet.started_count} murid mengerjakan · {previewWorksheet.submitted_count} mengumpulkan
                  </p>
                ) : (
                  <p style={styles.muted}>Belum ada murid yang mengerjakan LKPD ini.</p>
                )}
              </div>
              <button type="button" onClick={closeWorksheetPreview} style={styles.modalClose} aria-label="Tutup pratinjau LKPD">×</button>
            </div>
            <div style={styles.modalBody}>
              {previewWorksheetLoading ? <p style={styles.muted}>Memuat soal LKPD...</p> : null}
              {!previewWorksheetLoading && previewWorksheetError ? <p style={styles.modalError}>{previewWorksheetError}</p> : null}
              {!previewWorksheetLoading && !previewWorksheetError && previewItems ? (
                previewItems.length === 0 ? (
                  <p style={styles.empty}>Belum ada soal pada LKPD ini.</p>
                ) : (
                  previewItems.map((item, index) => (
                    <WorksheetPreviewItemView key={item.id} item={item} index={index} />
                  ))
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PreviewBlock({ block, moduleId }: { block: ModuleBlock; moduleId: number }) {
  if (block.type === "sub_bab") {
    return <h3 style={styles.previewSubheading}><MathText text={String(block.content.title ?? "Sub-bab")} /></h3>;
  }
  if (block.type === "teks") {
    return <MathHtml html={String(block.content.html ?? "")} className="math-rich-content" />;
  }
  if (block.type === "video") {
    return <PreviewVideoBlock block={block} />;
  }
  if (block.type === "gambar" || block.type === "berkas") {
    return <PreviewAttachmentBlock block={block} moduleId={moduleId} />;
  }
  return null;
}

const WORKSHEET_ITEM_TYPE_LABELS: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda",
  isian_singkat: "Isian singkat",
  uraian: "Uraian",
  unggah_foto: "Unggah foto",
  langkah_berurutan: "Langkah berurutan",
  refleksi: "Refleksi",
  tautan_ruas: "Tautan RUAS",
};

function worksheetItemStringOptions(options: Record<string, unknown> | null, key: string): string[] {
  const raw = options?.[key];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
}

function WorksheetPreviewItemView({ item, index }: { item: WorksheetPreviewItem; index: number }) {
  const typeLabel = WORKSHEET_ITEM_TYPE_LABELS[item.item_type] ?? item.item_type;
  return (
    <article style={styles.worksheetPreviewItem}>
      <div style={styles.worksheetPreviewPrompt}>
        <strong>{index + 1}. <MathText text={item.prompt} /></strong>
        <span style={styles.muted}>{typeLabel} · {item.points} poin</span>
      </div>
      <WorksheetPreviewAnswer item={item} />
      <div style={styles.teacherOnlyBox}>
        <p style={styles.teacherOnlyTitle}>Khusus guru</p>
        {item.answer_key || item.explanation ? (
          <>
            {item.answer_key ? (
              <p style={styles.teacherOnlyText}><strong>Kunci/Rubrik:</strong> <MathText text={item.answer_key} /></p>
            ) : null}
            {item.explanation ? (
              <p style={styles.teacherOnlyText}><strong>Pembahasan:</strong> <MathText text={item.explanation} /></p>
            ) : null}
          </>
        ) : (
          <p style={styles.teacherOnlyText}>Belum ada kunci atau pembahasan.</p>
        )}
      </div>
    </article>
  );
}

function WorksheetPreviewAnswer({ item }: { item: WorksheetPreviewItem }) {
  if (item.item_type === "pilihan_ganda") {
    const options = worksheetItemStringOptions(item.options, "options");
    return (
      <div style={styles.previewOptions}>
        {options.map((option, optionIndex) => (
          <label key={`${option}-${optionIndex}`} style={styles.previewOption}>
            <input type="radio" name={`preview-item-${item.id}`} disabled />
            <span>{String.fromCharCode(65 + optionIndex)}. <MathText text={option} />{item.answer_key === option ? <strong> (kunci)</strong> : null}</span>
          </label>
        ))}
      </div>
    );
  }
  if (item.item_type === "isian_singkat") {
    const unit = typeof item.options?.unit === "string" ? item.options.unit : null;
    return (
      <div style={styles.previewShortAnswer}>
        <input disabled placeholder="Jawaban singkat" style={styles.input} />
        {unit ? <span style={styles.muted}>{unit}</span> : null}
      </div>
    );
  }
  if (item.item_type === "uraian") {
    const placeholder = typeof item.options?.placeholder === "string" ? item.options.placeholder : "Tulis jawaban Anda";
    return <textarea disabled rows={4} placeholder={placeholder} style={styles.textarea} />;
  }
  if (item.item_type === "unggah_foto") {
    const maxFiles = typeof item.options?.maxFiles === "number" ? item.options.maxFiles : 1;
    const instruction = typeof item.options?.instruction === "string" ? item.options.instruction : null;
    return (
      <div style={styles.previewNotice}>
        <p style={{ margin: 0 }}>Murid mengunggah foto jawaban (maksimal {maxFiles} berkas).</p>
        {instruction ? <p style={{ margin: "6px 0 0" }}><MathText text={instruction} /></p> : null}
      </div>
    );
  }
  if (item.item_type === "langkah_berurutan") {
    const steps = worksheetItemStringOptions(item.options, "steps");
    return (
      <div>
        <ol style={styles.previewSteps}>
          {steps.map((step, stepIndex) => (
            <li key={`${step}-${stepIndex}`}><MathText text={step} /></li>
          ))}
        </ol>
        <p style={styles.previewCaption}>Urutan tampil ke murid (diacak dari urutan benar).</p>
      </div>
    );
  }
  if (item.item_type === "refleksi") {
    return <p style={styles.previewNotice}>Murid menulis refleksi (3-2-1) pada kolom teks.</p>;
  }
  if (item.item_type === "tautan_ruas") {
    const url = typeof item.options?.url === "string" ? item.options.url : "";
    const label = typeof item.options?.label === "string" && item.options.label ? item.options.label : "Buka Kuis di RUAS";
    return (
      <div style={styles.previewRuas}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ ...styles.primaryButton, textDecoration: "none", textAlign: "center" as const }}>{label}</a>
        ) : null}
        {url ? <span style={styles.previewCaption}>{url}</span> : null}
      </div>
    );
  }
  return <p style={styles.previewNotice}>Jenis soal ini tidak dikenal.</p>;
}

function youtubeEmbedId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1]! : null;
}

function PreviewVideoBlock({ block }: { block: ModuleBlock }) {
  const url = typeof block.content.youtubeUrl === "string" ? block.content.youtubeUrl : "";
  const caption = typeof block.content.caption === "string" ? block.content.caption : "";
  const videoId = url ? youtubeEmbedId(url) : null;
  return (
    <figure style={styles.previewFigure}>
      {videoId ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={caption || "Video pembelajaran"}
          style={styles.previewVideo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" style={styles.previewFileLink}>Buka video →</a>
      ) : null}
      {caption ? <figcaption><MathText text={caption} /></figcaption> : null}
    </figure>
  );
}

function PreviewAttachmentBlock({ block, moduleId }: { block: ModuleBlock; moduleId: number }) {
  const contentKey = typeof block.content.attachmentKey === "string" ? block.content.attachmentKey : null;
  const key = block.attachment_key ?? contentKey;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!key) {
      setError("Lampiran tidak ditemukan.");
      return;
    }
    void apiRequest<{ ok: true; data: { download_url: string } }>(
      `/uploads/download?moduleId=${moduleId}&key=${encodeURIComponent(key)}`,
    )
      .then((response) => setUrl(response.data.download_url))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Lampiran belum dapat dibuka."));
  }, [key, moduleId]);

  if (error) return <p style={styles.previewNotice}>{error}</p>;
  if (!url) return <p style={styles.previewNotice}>Memuat lampiran...</p>;
  if (block.type === "gambar") {
    const caption = typeof block.content.caption === "string" ? block.content.caption : "";
    return (
      <figure style={styles.previewFigure}>
        <img src={url} alt={caption || "Lampiran materi"} style={styles.previewImage} />
        {caption ? <figcaption><MathText text={caption} /></figcaption> : null}
      </figure>
    );
  }
  const label = typeof block.content.label === "string" ? block.content.label : "lampiran";
  return <a href={url} target="_blank" rel="noreferrer" style={styles.previewFileLink}>Buka {label} →</a>;
}

const styles = {
  container: { maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" },
  topline: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 8px" },
  title: { fontSize: 32, margin: 0 },
  muted: { color: "#667085", lineHeight: 1.5 },
  message: { background: "#eff8ff", color: "#175cd3", padding: 12, borderRadius: 8 },
  panel: { border: "1px solid #eaecf0", borderRadius: 12, padding: 18, marginTop: 24 },
  sectionTitle: { fontSize: 20, margin: "28px 0 12px" },
  form: { display: "grid", gap: 10 },
  input: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11 },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const },
  primaryButton: { border: 0, borderRadius: 8, background: "#175cd3", color: "white", padding: "11px 14px", fontWeight: 700 },
  secondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "9px 12px" },
  blockTypeRow: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 14 },
  moduleToolbar: { display: "flex", flexWrap: "wrap" as const, gap: 10, margin: "4px 0 14px" },
  moduleSearchInput: { flex: "1 1 200px" },
  moduleFilterSelect: { flex: "1 1 150px" },
  blockTypeButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "9px 14px", fontWeight: 600, cursor: "pointer" },
  blockTypeButtonActive: { border: "1px solid #175cd3", borderRadius: 8, background: "#175cd3", color: "white", padding: "9px 14px", fontWeight: 700, cursor: "pointer" },
  filePickerRow: { display: "flex", alignItems: "center", flexWrap: "wrap" as const, gap: 10 },
  filePickerButton: { display: "inline-block", border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "9px 12px", fontWeight: 600, cursor: "pointer" },
  fileName: { color: "#344054", wordBreak: "break-all" as const },
  hiddenFileInput: { position: "absolute" as const, width: 1, height: 1, opacity: 0, overflow: "hidden" as const },
  empty: { color: "#667085", background: "#f8f9fc", padding: 16, borderRadius: 8 },
  list: { display: "grid", gap: 10 },
  module: { display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, border: "1px solid", borderRadius: 10, padding: 14 },
  moduleSelect: { display: "grid", textAlign: "left" as const, gap: 4, border: 0, background: "transparent", padding: 0, font: "inherit" },
  status: { fontSize: 13, color: "#475467" },
  attempt: { display: "grid", textAlign: "left" as const, gap: 4, border: "1px solid", borderRadius: 10, background: "white", padding: 14, font: "inherit" },
  review: { display: "grid", gap: 12 },
  reviewTitle: { margin: 0, fontSize: 20 },
  answerCard: { display: "grid", gap: 8, border: "1px solid #eaecf0", borderRadius: 10, padding: 14 },
  answerText: { margin: 0, whiteSpace: "pre-wrap" as const, background: "#f8f9fc", borderRadius: 8, padding: 10 },
  label: { display: "grid", gap: 6, color: "#344054", fontSize: 14 },
  checkboxList: { display: "grid", gap: 8, border: "1px solid #eaecf0", borderRadius: 8, padding: 12 },
  checkbox: { display: "flex", gap: 8, alignItems: "center" },
  assignmentCard: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: "1px solid #eaecf0", borderRadius: 10, padding: 14 },
  assignmentInfo: { display: "grid", gap: 4 },
  actionRow: { display: "flex", flexWrap: "wrap" as const, justifyContent: "flex-end", gap: 8 },
  classCard: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: "1px solid #eaecf0", borderRadius: 10, padding: 14 },
  exitTicketLayout: { display: "grid", gap: 12 },
  exitTicketCard: { display: "grid", gap: 12, border: "1px solid #eaecf0", borderRadius: 10, padding: 14 },
  exitTicketField: { display: "grid", gap: 6, background: "#f8f9fc", borderRadius: 8, padding: 12 },
  reportSummary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 },
  reportMetric: { display: "grid", gap: 4, border: "1px solid #eaecf0", borderRadius: 10, padding: 12 },
  reportTableWrap: { overflowX: "auto" as const },
  reportTable: { width: "100%", borderCollapse: "collapse" as const, minWidth: 680 },
  reportCell: { borderBottom: "1px solid #eaecf0", padding: "10px 8px", textAlign: "left" as const, verticalAlign: "top" as const },
  dateRange: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
  warningBox: { background: "#fffaeb", color: "#b54708", borderRadius: 8, padding: 12 },
  modalOverlay: { position: "fixed" as const, inset: 0, background: "rgba(16, 24, 40, 0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", zIndex: 50, overflowY: "auto" as const },
  modalPanel: { background: "white", borderRadius: 14, width: "min(760px, 92vw)", maxHeight: "90vh", overflowY: "auto" as const, padding: "20px 22px" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, borderBottom: "1px solid #eaecf0", paddingBottom: 14, marginBottom: 16 },
  modalHeading: { display: "grid", gap: 6 },
  modalTitle: { fontSize: 24, margin: 0 },
  modalClose: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", width: 36, height: 36, fontSize: 20, lineHeight: 1, cursor: "pointer", flexShrink: 0 },
  modalNote: { background: "#fffaeb", color: "#b54708", borderRadius: 8, padding: 10, margin: 0 },
  modalError: { color: "#b42318", background: "#fef3f2", padding: 12, borderRadius: 8, margin: 0 },
  modalBody: { display: "grid", gap: 14, lineHeight: 1.7 },
  previewSubheading: { fontSize: 20, margin: "12px 0 0", borderTop: "1px solid #eaecf0", paddingTop: 16 },
  previewFigure: { margin: 0, display: "grid", gap: 8 },
  previewImage: { maxWidth: "100%", borderRadius: 10 },
  previewVideo: { width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 10 },
  previewFileLink: { color: "#175cd3", fontWeight: 700 },
  previewNotice: { color: "#667085", background: "#f8f9fc", padding: 12, borderRadius: 8, margin: 0 },
  worksheetPreviewItem: { display: "grid", gap: 10, border: "1px solid #eaecf0", borderRadius: 10, padding: 14 },
  worksheetPreviewPrompt: { display: "grid", gap: 4 },
  previewOptions: { display: "grid", gap: 8 },
  previewOption: { display: "flex", gap: 8, alignItems: "flex-start" },
  previewShortAnswer: { display: "flex", gap: 8, alignItems: "center" },
  previewSteps: { margin: "0 0 6px", paddingLeft: 22, display: "grid", gap: 4 },
  previewCaption: { color: "#667085", fontSize: 13, margin: 0, wordBreak: "break-all" as const },
  previewRuas: { display: "grid", gap: 8 },
  teacherOnlyBox: { border: "1px dashed #84adff", background: "#f5f8ff", borderRadius: 8, padding: 12, display: "grid", gap: 6 },
  teacherOnlyTitle: { margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#175cd3", textTransform: "uppercase" as const },
  teacherOnlyText: { margin: 0, whiteSpace: "pre-wrap" as const },
};

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function toDateInputLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function parseRuasCsv(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => !(index === 0 && /nis|identifier|nilai|score/i.test(line)))
    .map((line) => {
      const columns = line.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
      return { identifier: columns[0] ?? "", score: columns[1] ?? "", studentName: columns.slice(2).join(",") || undefined };
    })
    .filter((row) => row.identifier && row.score !== "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function integrityEventLabel(event: string) {
  const labels: Record<string, string> = {
    visibility_hidden: "pindah halaman",
    window_blur: "kehilangan fokus",
    copy_attempt: "copy",
    paste_attempt: "paste",
    context_menu: "menu konteks",
  };
  return labels[event] ?? event;
}

function integrityRiskLabel(risk: IntegrityAlert["risk"]) {
  return risk === "peringatan" ? "Peringatan" : risk === "perlu_ditinjau" ? "Perlu ditinjau" : "Info";
}
