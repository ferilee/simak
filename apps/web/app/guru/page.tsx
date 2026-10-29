"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiBase, apiRequest } from "../../lib/api";
import { submissionStatusLabel } from "../lib/labels";
import { Toast } from "../../components/Toast";
import { useConfirm } from "../../components/ConfirmDialog";
import { MarkdownHtml, MathHtml, MathText } from "../../components/MathContent";
import { markdownToHtml } from "../../components/markdown";

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
type GradingAttemptSummary = WorksheetAttemptSummary & {
  worksheet_id: number;
  worksheet_title: string;
};
type GradingAttemptsResponse = { ok: true; data: GradingAttemptSummary[] };
type GradingStatusFilter = "semua" | "draf" | "terkumpul" | "belum_dinilai" | "sudah_dinilai";
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
  const confirmDialog = useConfirm();
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [moduleQuery, setModuleQuery] = useState("");
  const [moduleStatusFilter, setModuleStatusFilter] = useState<"semua" | "draf" | "terbit" | "arsip">("semua");
  const [moduleSubjectFilter, setModuleSubjectFilter] = useState("semua");
  const [moduleSort, setModuleSort] = useState<"terbaru" | "judul" | "penonton">("terbaru");
  const [worksheetQuery, setWorksheetQuery] = useState("");
  const [worksheetStatusFilter, setWorksheetStatusFilter] = useState<"semua" | "draf" | "terbit" | "arsip">("semua");
  const [worksheetModuleFilter, setWorksheetModuleFilter] = useState("semua");
  const [worksheetSort, setWorksheetSort] = useState<"terbaru" | "judul" | "dikerjakan">("terbaru");
  // Grup arsip yang bisa dilipat pada daftar modul/LKPD (saringan "semua"):
  // keadaan buka manual per daftar, plus teks pencarian saat grup ditutup
  // manual supaya pencarian baru bisa membukanya lagi secara otomatis.
  const [moduleArchiveOpen, setModuleArchiveOpen] = useState(false);
  const [moduleArchiveClosedAtQuery, setModuleArchiveClosedAtQuery] = useState<string | null>(null);
  const [worksheetArchiveOpen, setWorksheetArchiveOpen] = useState(false);
  const [worksheetArchiveClosedAtQuery, setWorksheetArchiveClosedAtQuery] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [blockHtml, setBlockHtml] = useState("");
  const [blockType, setBlockType] = useState<"teks" | "sub_bab" | "video" | "lampiran">("teks");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [moduleBlocks, setModuleBlocks] = useState<ModuleBlock[]>([]);
  const [worksheetItems, setWorksheetItems] = useState<WorksheetPreviewItem[]>([]);
  const [editingModuleMeta, setEditingModuleMeta] = useState(false);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [editModuleSubject, setEditModuleSubject] = useState("");
  const [editModuleDescription, setEditModuleDescription] = useState("");
  const [editingWorksheetMeta, setEditingWorksheetMeta] = useState(false);
  const [editWorksheetTitle, setEditWorksheetTitle] = useState("");
  const [editWorksheetInstructions, setEditWorksheetInstructions] = useState("");
  const [editingBlock, setEditingBlock] = useState<ModuleBlock | null>(null);
  const [editingTextAsHtml, setEditingTextAsHtml] = useState(false);
  const [editingItem, setEditingItem] = useState<WorksheetPreviewItem | null>(null);
  const blockFirstFieldRef = useRef<HTMLElement | null>(null);
  const [worksheets, setWorksheets] = useState<WorksheetSummary[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [className, setClassName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [classAcademicYear, setClassAcademicYear] = useState("2026/2027");
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<"semua" | "draf" | "terbit" | "ditutup">("semua");
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
  const [editingAssignment, setEditingAssignment] = useState<AssignmentSummary | null>(null);
  // Jepretan keadaan formulir penugasan + pilihan editor (Langkah 1–2) sebelum
  // masuk mode edit penugasan; dipulihkan saat keluar agar mode edit tidak
  // merusak pilihan materi/LKPD yang sedang aktif (temuan audit K4).
  const assignmentEditSnapshot = useRef<{
    selectedId: number | null;
    selectedWorksheetId: number | null;
    title: string;
    instructions: string;
    opensAt: string;
    dueAt: string;
    ruasUrl: string;
    classIds: number[];
  } | null>(null);
  const assignmentFormRef = useRef<HTMLDetailsElement | null>(null);
  const sessionReportPanelRef = useRef<HTMLElement | null>(null);
  const exitTicketPanelRef = useRef<HTMLElement | null>(null);
  const [attempts, setAttempts] = useState<WorksheetAttemptSummary[]>([]);
  const [allAttempts, setAllAttempts] = useState<GradingAttemptSummary[]>([]);
  const [gradingSource, setGradingSource] = useState<number | "semua">("semua");
  const [gradingStatusFilter, setGradingStatusFilter] = useState<GradingStatusFilter>("semua");
  // Penanda bahwa perubahan selectedWorksheetId berasal dari klik baris pada
  // mode gabungan panel Pengumpulan: pemilih sumber tidak boleh ikut beralih
  // ke mode satu LKPD hanya karena rincian attempt dibuka dari daftar gabungan.
  const gradingPickRef = useRef(false);
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

  // Tanda selesai langkah hanya dari syarat nyata, bukan posisi wizard:
  // Materi = ada modul, LKPD = ada lembar kerja, Kelas = ada kelas,
  // Penugasan = ada penugasan. Langkah Hasil tidak punya sinyal global
  // yang andal, jadi tidak pernah diberi tanda selesai otomatis.
  const guruStepComplete = [
    modules.length > 0,
    worksheets.length > 0,
    classes.length > 0,
    assignments.length > 0,
    false,
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
    setModuleArchiveOpen(false);
    setModuleArchiveClosedAtQuery(null);
  }

  // Partisi daftar modul: aktif (draf/terbit) dan arsip. Partisi hanya
  // dipakai saat saringan status "semua"; saringan "arsip" eksplisit
  // menampilkan baris arsip langsung tanpa grup.
  const activeModules = visibleModules.filter((module) => module.status !== "arsip");
  const archivedModules = visibleModules.filter((module) => module.status === "arsip");
  // Grup terbuka otomatis bila ada teks pencarian yang cocok dengan arsip,
  // kecuali pengguna menutupnya manual pada teks pencarian yang sama.
  const moduleArchiveAutoOpen = moduleStatusFilter === "semua"
    && normalizedModuleQuery !== ""
    && archivedModules.length > 0
    && moduleArchiveClosedAtQuery !== moduleQuery;
  const moduleArchiveGroupOpen = moduleArchiveOpen || moduleArchiveAutoOpen;

  function toggleModuleArchiveGroup() {
    if (moduleArchiveGroupOpen) {
      setModuleArchiveOpen(false);
      setModuleArchiveClosedAtQuery(moduleQuery);
    } else {
      setModuleArchiveOpen(true);
      setModuleArchiveClosedAtQuery(null);
    }
  }

  function renderModuleRow(module: ModuleSummary, dimmed = false) {
    return (
      <article key={module.id} className={`module-row ${dimmed ? "module-row-archived" : ""} ${selectedId === module.id ? "is-selected" : ""}`}>
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
    );
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
    setWorksheetArchiveOpen(false);
    setWorksheetArchiveClosedAtQuery(null);
  }

  // Saringan status daftar penugasan (Langkah 4): hitungan per status dari
  // data yang sudah termuat; daftar tampil diturunkan murni di sisi klien.
  const assignmentStatusCounts: Record<"semua" | "draf" | "terbit" | "ditutup", number> = {
    semua: assignments.length,
    terbit: assignments.filter((assignment) => assignment.status === "terbit").length,
    draf: assignments.filter((assignment) => assignment.status === "draf").length,
    ditutup: assignments.filter((assignment) => assignment.status === "ditutup").length,
  };
  const visibleAssignments = assignmentStatusFilter === "semua"
    ? assignments
    : assignments.filter((assignment) => assignment.status === assignmentStatusFilter);
  const activeAssignmentFilterLabel = ASSIGNMENT_STATUS_FILTER_OPTIONS.find((option) => option.value === assignmentStatusFilter)?.label ?? "";

  // Partisi daftar LKPD: sama seperti modul — aktif dan arsip, hanya
  // dipakai saat saringan status "semua".
  const activeWorksheets = visibleWorksheets.filter((worksheet) => worksheet.status !== "arsip");
  const archivedWorksheets = visibleWorksheets.filter((worksheet) => worksheet.status === "arsip");
  const worksheetArchiveAutoOpen = worksheetStatusFilter === "semua"
    && normalizedWorksheetQuery !== ""
    && archivedWorksheets.length > 0
    && worksheetArchiveClosedAtQuery !== worksheetQuery;
  const worksheetArchiveGroupOpen = worksheetArchiveOpen || worksheetArchiveAutoOpen;

  function toggleWorksheetArchiveGroup() {
    if (worksheetArchiveGroupOpen) {
      setWorksheetArchiveOpen(false);
      setWorksheetArchiveClosedAtQuery(worksheetQuery);
    } else {
      setWorksheetArchiveOpen(true);
      setWorksheetArchiveClosedAtQuery(null);
    }
  }

  function renderWorksheetRow(worksheet: WorksheetSummary, dimmed = false) {
    return (
      <article key={worksheet.id} className={`module-row ${dimmed ? "module-row-archived" : ""} ${selectedWorksheetId === worksheet.id ? "is-selected" : ""}`}>
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
    );
  }

  const selectedModule = modules.find((module) => module.id === selectedId) ?? null;
  const selectedWorksheet = worksheets.find((worksheet) => worksheet.id === selectedWorksheetId) ?? null;

  // Daftar yang ditampilkan panel Pengumpulan LKPD: gabungan semua LKPD
  // (mode "Semua LKPD") atau daftar per-LKPD yang sedang aktif. Saringan
  // status diterapkan di klien untuk kedua mode: "belum dinilai" berarti
  // sudah terkumpul tetapi belum punya nilai, "sudah dinilai" berarti
  // total nilai sudah terisi.
  const gradingCombined = gradingSource === "semua";
  const gradingAttempts: (WorksheetAttemptSummary & { worksheet_id?: number; worksheet_title?: string })[] = gradingCombined ? allAttempts : attempts;
  const visibleGradingAttempts = gradingAttempts.filter((attempt) => {
    if (gradingStatusFilter === "draf") return attempt.status === "draf";
    if (gradingStatusFilter === "terkumpul") return attempt.status === "terkumpul";
    if (gradingStatusFilter === "belum_dinilai") return attempt.status === "terkumpul" && attempt.total_score === null;
    if (gradingStatusFilter === "sudah_dinilai") return attempt.total_score !== null;
    return true;
  });

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

  async function loadAllAttempts() {
    setAttemptLoading(true);
    try {
      const response = await apiRequest<GradingAttemptsResponse>("/grading/attempts");
      setAllAttempts(response.data);
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

  // Pemilih sumber panel Pengumpulan LKPD mengikuti LKPD yang dipilih di
  // Langkah 2 (termasuk pilihan bawaan saat halaman dimuat). Klik baris pada
  // mode gabungan dikecualikan lewat gradingPickRef: di sana
  // selectedWorksheetId hanya diatur agar rincian dan penyimpanan nilai
  // memakai endpoint per-LKPD yang benar, bukan untuk mengganti sumber.
  useEffect(() => {
    if (gradingPickRef.current) {
      gradingPickRef.current = false;
      return;
    }
    setGradingSource(selectedWorksheetId ?? "semua");
  }, [selectedWorksheetId]);

  useEffect(() => {
    if (loading || gradingSource !== "semua") return;
    void loadAllAttempts();
  }, [gradingSource, loading]);

  useEffect(() => {
    if (selectedWorksheetId && selectedAttemptId) void loadAttemptDetail(selectedWorksheetId, selectedAttemptId);
  }, [selectedWorksheetId, selectedAttemptId]);

  async function loadModuleBlocks(moduleId: number) {
    try {
      const response = await apiRequest<ModuleBlocksResponse>(`/modules/${moduleId}/blocks`);
      setModuleBlocks(response.data);
    } catch (error) {
      setModuleBlocks([]);
      setMessage(error instanceof Error ? error.message : "Isi materi belum dapat dimuat.");
    }
  }

  async function loadWorksheetItems(worksheetId: number) {
    try {
      const response = await apiRequest<WorksheetItemsResponse>(`/worksheets/${worksheetId}/items`);
      setWorksheetItems(response.data);
    } catch (error) {
      setWorksheetItems([]);
      setMessage(error instanceof Error ? error.message : "Soal LKPD belum dapat dimuat.");
    }
  }

  // Ganti modul/LKPD terpilih selalu membatalkan mode edit yang sedang berjalan
  // agar formulir tidak mengubah data milik pilihan sebelumnya.
  useEffect(() => {
    setEditingBlock(null);
    setEditingTextAsHtml(false);
    setEditingModuleMeta(false);
    if (!selectedId) {
      setModuleBlocks([]);
      return;
    }
    void loadModuleBlocks(selectedId);
  }, [selectedId]);

  useEffect(() => {
    setEditingItem(null);
    setEditingWorksheetMeta(false);
    if (!selectedWorksheetId) {
      setWorksheetItems([]);
      return;
    }
    void loadWorksheetItems(selectedWorksheetId);
  }, [selectedWorksheetId]);

  // Umpan balik klik pemicu panel Langkah 5: sesudah data termuat dan panel
  // ter-render, gulirkan panel masuk layar — panel bisa berada jauh di bawah
  // daftar sehingga klik terasa tidak bereaksi bila tidak digulirkan.
  useEffect(() => {
    if (selectedReportAssignmentId && sessionReport && !sessionReportLoading) {
      scrollPanelIntoView(sessionReportPanelRef.current);
    }
  }, [selectedReportAssignmentId, sessionReport, sessionReportLoading]);

  useEffect(() => {
    if (selectedAssignmentId && assignmentSummary && !assignmentSummaryLoading) {
      scrollPanelIntoView(exitTicketPanelRef.current);
    }
  }, [selectedAssignmentId, assignmentSummary, assignmentSummaryLoading]);

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
      setMessage("Draf modul dibuat. Sekarang tambahkan isinya di panel di bawah.");
      setTimeout(() => {
        document.getElementById("panel-isi-materi")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modul belum dapat dibuat.");
    }
  }

  function startEditModuleMeta() {
    if (!selectedModule) return;
    setEditModuleTitle(selectedModule.title);
    setEditModuleSubject(selectedModule.subject);
    setEditModuleDescription(selectedModule.description ?? "");
    setEditingModuleMeta(true);
  }

  async function saveModuleMeta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      // Hanya metadata yang dikirim; status modul tidak ikut berubah.
      await apiRequest(`/modules/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editModuleTitle, subject: editModuleSubject, description: editModuleDescription }),
      });
      setEditingModuleMeta(false);
      setMessage("Data modul disimpan.");
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data modul belum dapat disimpan.");
    }
  }

  function startEditWorksheetMeta() {
    if (!selectedWorksheet) return;
    setEditWorksheetTitle(selectedWorksheet.title);
    setEditWorksheetInstructions(selectedWorksheet.instructions ?? "");
    setEditingWorksheetMeta(true);
  }

  async function saveWorksheetMeta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorksheetId) return;
    try {
      // Hanya judul + petunjuk; status LKPD tidak ikut berubah.
      await apiRequest(`/worksheets/${selectedWorksheetId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editWorksheetTitle, instructions: editWorksheetInstructions }),
      });
      setEditingWorksheetMeta(false);
      setMessage("Data LKPD disimpan.");
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data LKPD belum dapat disimpan.");
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
    if (status === "arsip") {
      if (!(await confirmDialog("Arsipkan modul ini? Murid tidak lagi dapat membukanya dari daftar materi.", { confirmLabel: "Arsipkan" }))) return;
    } else {
      // Penjaga isi kosong: jangan blokir penerbitan bila pemeriksaannya gagal.
      try {
        const blocks = await apiRequest<ModuleBlocksResponse>(`/modules/${module.id}/blocks`);
        if (blocks.data.length === 0 && !(await confirmDialog("Materi ini belum punya isi sama sekali. Terbitkan tetap?", { confirmLabel: "Terbitkan tetap" }))) return;
      } catch {
        // Pemeriksaan gagal — lanjutkan penerbitan tanpa penjaga.
      }
    }
    try {
      await apiRequest(`/modules/${module.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(status === "terbit" ? "Modul diterbitkan — sekarang terlihat oleh murid." : "Modul diarsipkan.");
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
    const saved = editingBlock
      ? await updateBlock()
      : blockType === "teks"
        ? await addTextBlock(event)
        : blockType === "sub_bab"
          ? await addSubBabBlock(event)
          : blockType === "video"
            ? await addVideoBlock(event)
            : await addAttachmentBlock(event);
    if (saved) {
      if (selectedId) await loadModuleBlocks(selectedId);
      blockFirstFieldRef.current?.focus();
    }
  }

  async function updateBlock() {
    return blockType === "teks"
      ? await updateTextBlock()
      : blockType === "sub_bab"
        ? await updateSubBabBlock()
        : blockType === "video"
          ? await updateVideoBlock()
          : await updateAttachmentBlock();
  }

  async function updateTextBlock() {
    if (!selectedId || !editingBlock || !blockHtml.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks/${editingBlock.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          // Jalur simpan bercabang mengikuti bentuk tersimpan blok: blok HTML
          // disimpan kembali apa adanya sebagai HTML (tanpa konverter Markdown
          // yang akan merusaknya), blok Markdown melewati konverter yang sama
          // seperti saat dibuat.
          content: { type: "teks", html: editingTextAsHtml ? blockHtml : markdownToHtml(blockHtml) },
        }),
      });
      setBlockHtml("");
      setEditingBlock(null);
      setEditingTextAsHtml(false);
      setMessage("Blok materi diperbarui.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat diperbarui.");
      return false;
    }
  }

  async function updateSubBabBlock() {
    if (!selectedId || !editingBlock || !subBabTitle.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks/${editingBlock.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          content: { type: "sub_bab", title: subBabTitle.trim() },
        }),
      });
      setSubBabTitle("");
      setEditingBlock(null);
      setMessage("Blok materi diperbarui.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat diperbarui.");
      return false;
    }
  }

  async function updateVideoBlock() {
    if (!selectedId || !editingBlock || !videoUrl.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks/${editingBlock.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          content: {
            type: "video",
            youtubeUrl: videoUrl.trim(),
            ...(videoCaption.trim() ? { caption: videoCaption.trim() } : {}),
          },
        }),
      });
      setVideoUrl("");
      setVideoCaption("");
      setEditingBlock(null);
      setMessage("Blok materi diperbarui.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat diperbarui.");
      return false;
    }
  }

  async function updateAttachmentBlock() {
    if (!selectedId || !editingBlock) return false;
    if (!attachment) {
      // Tanpa berkas baru dipilih, lampiran lama dipertahankan apa adanya.
      setEditingBlock(null);
      setMessage("Lampiran tidak diubah.");
      return true;
    }
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

      // Jenis blok tidak berubah: gambar tetap gambar, berkas tetap berkas;
      // keterangan/label lama dipertahankan bila ada.
      const stored = editingBlock.content;
      const content = editingBlock.type === "gambar"
        ? {
            type: "gambar",
            attachmentKey: presign.data.attachment_key,
            caption: typeof stored.caption === "string" && stored.caption ? stored.caption : attachment.name,
          }
        : {
            type: "berkas",
            attachmentKey: presign.data.attachment_key,
            label: typeof stored.label === "string" && stored.label ? stored.label : attachment.name,
          };
      await apiRequest(`/modules/${selectedId}/blocks/${editingBlock.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content, attachmentKey: presign.data.attachment_key }),
      });
      setAttachment(null);
      setEditingBlock(null);
      setMessage("Lampiran diperbarui.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lampiran belum dapat diperbarui.");
      return false;
    }
  }

  function startEditBlock(block: ModuleBlock) {
    setEditingBlock(block);
    setAttachment(null);
    if (block.type === "teks") {
      setBlockType("teks");
      if (typeof block.content.markdown === "string") {
        setEditingTextAsHtml(false);
        setBlockHtml(block.content.markdown);
      } else {
        setEditingTextAsHtml(true);
        setBlockHtml(typeof block.content.html === "string" ? block.content.html : "");
      }
    } else if (block.type === "sub_bab") {
      setBlockType("sub_bab");
      setSubBabTitle(typeof block.content.title === "string" ? block.content.title : "");
    } else if (block.type === "video") {
      setBlockType("video");
      setVideoUrl(typeof block.content.youtubeUrl === "string" ? block.content.youtubeUrl : "");
      setVideoCaption(typeof block.content.caption === "string" ? block.content.caption : "");
    } else {
      setBlockType("lampiran");
    }
    document.getElementById("panel-isi-materi")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditBlock() {
    setEditingBlock(null);
    setEditingTextAsHtml(false);
    setBlockHtml("");
    setSubBabTitle("");
    setVideoUrl("");
    setVideoCaption("");
    setAttachment(null);
  }

  async function moveBlock(blockId: number, direction: -1 | 1) {
    if (!selectedId) return;
    const index = moduleBlocks.findIndex((block) => block.id === blockId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= moduleBlocks.length) return;
    const blockIds = moduleBlocks.map((block) => block.id);
    [blockIds[index], blockIds[targetIndex]] = [blockIds[targetIndex], blockIds[index]];
    try {
      const response = await apiRequest<ModuleBlocksResponse>(`/modules/${selectedId}/blocks/order`, {
        method: "PATCH",
        body: JSON.stringify({ blockIds }),
      });
      setModuleBlocks(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Urutan blok belum dapat diubah.");
    }
  }

  async function deleteBlock(block: ModuleBlock) {
    if (!selectedId) return;
    if (!(await confirmDialog(`Hapus blok ${BLOCK_TYPE_LABELS[block.type].toLowerCase()} ini dari materi? Tindakan ini tidak dapat dibatalkan.`, { confirmLabel: "Hapus" }))) return;
    try {
      await apiRequest(`/modules/${selectedId}/blocks/${block.id}`, { method: "DELETE" });
      if (editingBlock?.id === block.id) cancelEditBlock();
      setMessage("Blok dihapus.");
      await loadModuleBlocks(selectedId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat dihapus.");
    }
  }

  async function addTextBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !blockHtml.trim()) return false;
    try {
      await apiRequest(`/modules/${selectedId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          // Skema API blok teks berbentuk tetap {type, html} dan field lain dibuang
          // validator, jadi Markdown dikonversi ke HTML di sini sebelum disimpan.
          content: { type: "teks", html: markdownToHtml(blockHtml) },
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
    if (status === "arsip") {
      if (!(await confirmDialog("Arsipkan LKPD ini? Murid tidak lagi dapat membukanya.", { confirmLabel: "Arsipkan" }))) return;
    } else {
      // Penjaga isi kosong: jangan blokir penerbitan bila pemeriksaannya gagal.
      try {
        const items = await apiRequest<WorksheetItemsResponse>(`/worksheets/${worksheet.id}/items`);
        if (items.data.length === 0 && !(await confirmDialog("LKPD ini belum punya soal sama sekali. Terbitkan tetap?", { confirmLabel: "Terbitkan tetap" }))) return;
      } catch {
        // Pemeriksaan gagal — lanjutkan penerbitan tanpa penjaga.
      }
    }
    try {
      await apiRequest(`/worksheets/${worksheet.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage(status === "terbit" ? "LKPD diterbitkan — sekarang terlihat oleh murid." : "LKPD diarsipkan.");
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status LKPD belum dapat diubah.");
    }
  }

  // Payload butir dipakai bersama oleh buat-baru dan edit agar perilaku
  // per-jenis selalu sama; mengembalikan null bila masukan belum lengkap.
  function buildItemPayload() {
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
        return null;
      }
      options = { itemType, url, label: itemUrlLabel.trim() || "Buka Kuis di RUAS" };
      answerKey = undefined;
    }
    return {
      itemType,
      prompt: itemPrompt,
      options,
      answerKey,
      explanation: itemExplanation.trim() || undefined,
      points: Number(itemPoints) || 10,
    };
  }

  function resetItemForm() {
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
  }

  async function addWorksheetItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorksheetId) return;
    const payload = buildItemPayload();
    if (!payload) return;
    try {
      await apiRequest(`/worksheets/${selectedWorksheetId}/items`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      resetItemForm();
      setMessage("Soal LKPD ditambahkan.");
      await loadWorksheetItems(selectedWorksheetId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Soal belum dapat ditambahkan.");
    }
  }

  async function updateWorksheetItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorksheetId || !editingItem) return;
    const payload = buildItemPayload();
    if (!payload) return;
    try {
      await apiRequest(`/worksheets/${selectedWorksheetId}/items/${editingItem.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      resetItemForm();
      setEditingItem(null);
      setMessage("Soal LKPD diperbarui.");
      await loadWorksheetItems(selectedWorksheetId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Soal belum dapat diperbarui.");
    }
  }

  function startEditItem(item: WorksheetPreviewItem) {
    resetItemForm();
    setEditingItem(item);
    setItemType(item.item_type as typeof itemType);
    setItemPrompt(item.prompt);
    setItemAnswerKey(item.answer_key ?? "");
    setItemExplanation(item.explanation ?? "");
    setItemPoints(String(item.points));
    const options = item.options ?? {};
    if (item.item_type === "pilihan_ganda") {
      setItemOptions(worksheetItemStringOptions(item.options, "options").join("\n"));
    } else if (item.item_type === "isian_singkat") {
      setItemTolerance(String(typeof options.tolerance === "number" ? options.tolerance : 0));
      setItemUnit(typeof options.unit === "string" ? options.unit : "");
    } else if (item.item_type === "uraian") {
      setItemPlaceholder(typeof options.placeholder === "string" ? options.placeholder : "");
    } else if (item.item_type === "unggah_foto") {
      setItemMaxFiles(String(typeof options.maxFiles === "number" ? options.maxFiles : 1));
      setItemPhotoInstruction(typeof options.instruction === "string" ? options.instruction : "");
    } else if (item.item_type === "langkah_berurutan") {
      setItemSteps(worksheetItemStringOptions(item.options, "steps").join("\n"));
      setItemCorrectOrder(item.answer_key ?? "");
    } else if (item.item_type === "tautan_ruas") {
      setItemUrl(typeof options.url === "string" ? options.url : "");
      setItemUrlLabel(typeof options.label === "string" && options.label ? options.label : "Buka Kuis di RUAS");
    }
    document.getElementById("panel-soal-lkpd")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditItem() {
    setEditingItem(null);
    resetItemForm();
  }

  async function moveItem(itemId: number, direction: -1 | 1) {
    if (!selectedWorksheetId) return;
    const index = worksheetItems.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= worksheetItems.length) return;
    const itemIds = worksheetItems.map((item) => item.id);
    [itemIds[index], itemIds[targetIndex]] = [itemIds[targetIndex], itemIds[index]];
    try {
      const response = await apiRequest<WorksheetItemsResponse>(`/worksheets/${selectedWorksheetId}/items/order`, {
        method: "PATCH",
        body: JSON.stringify({ itemIds }),
      });
      setWorksheetItems(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Urutan soal belum dapat diubah.");
    }
  }

  async function deleteItem(item: WorksheetPreviewItem) {
    if (!selectedWorksheetId) return;
    if (!(await confirmDialog("Hapus butir soal ini dari LKPD? Tindakan ini tidak dapat dibatalkan.", { confirmLabel: "Hapus" }))) return;
    try {
      await apiRequest(`/worksheets/${selectedWorksheetId}/items/${item.id}`, { method: "DELETE" });
      if (editingItem?.id === item.id) cancelEditItem();
      setMessage("Butir soal dihapus.");
      await loadWorksheetItems(selectedWorksheetId);
    } catch (error) {
      // Penolakan server (mis. 409 karena butir sudah dijawab murid)
      // ditampilkan apa adanya lewat pesan error dari API.
      setMessage(error instanceof Error ? error.message : "Butir belum dapat dihapus.");
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
      if (gradingSource === "semua") await loadAllAttempts();
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

  function startEditAssignment(assignment: AssignmentSummary) {
    assignmentEditSnapshot.current = {
      selectedId,
      selectedWorksheetId,
      title: assignmentTitle,
      instructions: assignmentInstructions,
      opensAt: assignmentOpensAt,
      dueAt: assignmentDueAt,
      ruasUrl: assignmentRuasUrl,
      classIds: assignmentClassIds,
    };
    setEditingAssignment(assignment);
    setAssignmentTitle(assignment.title);
    setAssignmentInstructions(assignment.instructions ?? "");
    setSelectedId(assignment.module_id);
    setSelectedWorksheetId(assignment.worksheet_id);
    setAssignmentClassIds(assignment.classes.map((kelas) => kelas.id));
    setAssignmentOpensAt(toDateTimeLocal(new Date(assignment.opens_at)));
    setAssignmentDueAt(toDateTimeLocal(new Date(assignment.due_at)));
    setAssignmentRuasUrl(assignment.ruas_quiz_url ?? "");
    if (assignmentFormRef.current) {
      assignmentFormRef.current.open = true;
      assignmentFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function exitAssignmentEdit() {
    const snapshot = assignmentEditSnapshot.current;
    if (snapshot) {
      setSelectedId(snapshot.selectedId);
      setSelectedWorksheetId(snapshot.selectedWorksheetId);
      setAssignmentTitle(snapshot.title);
      setAssignmentInstructions(snapshot.instructions);
      setAssignmentOpensAt(snapshot.opensAt);
      setAssignmentDueAt(snapshot.dueAt);
      setAssignmentRuasUrl(snapshot.ruasUrl);
      setAssignmentClassIds(snapshot.classIds);
    }
    assignmentEditSnapshot.current = null;
    setEditingAssignment(null);
  }

  async function saveAssignmentEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAssignment) return;
    if (!selectedId || !selectedWorksheetId || assignmentClassIds.length === 0) {
      setMessage("Pilih modul, LKPD, dan minimal satu kelas tujuan.");
      return;
    }
    try {
      await apiRequest(`/assignments/${editingAssignment.id}`, {
        method: "PATCH",
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
      setMessage("Perubahan penugasan disimpan.");
      exitAssignmentEdit();
      await loadModules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Perubahan penugasan belum dapat disimpan.");
    }
  }

  async function changeAssignmentStatus(assignment: AssignmentSummary) {
    const status = assignment.status === "terbit" ? "ditutup" : "terbit";
    if (status === "ditutup" && !(await confirmDialog("Tutup penugasan ini? Murid tidak dapat lagi membukanya atau mengumpulkan.", { confirmLabel: "Tutup penugasan" }))) return;
    try {
      await apiRequest(`/assignments/${assignment.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage(status === "terbit" ? "Penugasan dibuka." : "Penugasan ditutup.");
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
                className={`wizard-step ${guruStep === index ? "is-active" : ""} ${guruStepComplete[index] ? "is-complete" : ""}`}
                onClick={() => setGuruStep(index)}
                aria-current={guruStep === index ? "step" : undefined}
              >
                <span className="wizard-step-number">{guruStepComplete[index] ? "✓" : index + 1}</span>
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
        ) : moduleStatusFilter === "arsip" ? (
          <div className="module-list">
            {visibleModules.map((module) => renderModuleRow(module))}
          </div>
        ) : (
          <>
            {activeModules.length > 0 ? (
              <div className="module-list">
                {activeModules.map((module) => renderModuleRow(module))}
              </div>
            ) : null}
            {archivedModules.length > 0 ? (
              <div className="archive-group">
                <button type="button" className="archive-group-toggle" aria-expanded={moduleArchiveGroupOpen} onClick={toggleModuleArchiveGroup}>
                  <span>Arsip ({archivedModules.length})</span>
                  <span aria-hidden="true">{moduleArchiveGroupOpen ? "▾" : "▸"}</span>
                </button>
                {moduleArchiveGroupOpen ? (
                  <div className="module-list">
                    {archivedModules.map((module) => renderModuleRow(module, true))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
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
        <section id="panel-isi-materi" className="wizard-step-panel" data-active={guruStep === 0} style={styles.panel}>
          {selectedModule ? (
            <div className="selected-resource-heading">
              <div>
                <p className="module-section-summary">Modul terpilih</p>
                <strong>{selectedModule.title}</strong>
              </div>
              {!editingModuleMeta ? (
                <button type="button" className="module-row-action" onClick={startEditModuleMeta}>Edit modul</button>
              ) : null}
            </div>
          ) : null}
          {editingModuleMeta ? (
            <form onSubmit={saveModuleMeta} style={styles.form}>
              <input required value={editModuleTitle} onChange={(event) => setEditModuleTitle(event.target.value)} placeholder="Judul modul" style={styles.input} />
              <input required value={editModuleSubject} onChange={(event) => setEditModuleSubject(event.target.value)} placeholder="Mata pelajaran" style={styles.input} />
              <textarea value={editModuleDescription} onChange={(event) => setEditModuleDescription(event.target.value)} placeholder="Deskripsi singkat" rows={3} style={styles.textarea} />
              <button type="submit" style={styles.primaryButton}>Simpan data modul</button>
              <button type="button" onClick={() => setEditingModuleMeta(false)} style={styles.secondaryButton}>Batal</button>
            </form>
          ) : null}
          <h2 style={styles.sectionTitle}>{editingBlock ? "Edit isi materi" : "Tambah isi materi"}</h2>
          {editingBlock ? (
            <p style={styles.message}>Mode edit: mengubah blok {BLOCK_TYPE_LABELS[editingBlock.type].toLowerCase()}. Jenis blok terkunci — untuk mengganti jenis, hapus blok ini lalu buat blok baru.</p>
          ) : null}
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
                disabled={editingBlock !== null}
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
                  placeholder="Tulis isi materi… (Markdown)"
                  rows={6}
                  style={styles.textarea}
                />
                {editingBlock && editingTextAsHtml ? (
                  <small style={styles.muted}>Blok ini tersimpan sebagai HTML, jadi disunting dan disimpan kembali sebagai HTML langsung (tanpa konversi Markdown).</small>
                ) : (
                  <small style={styles.muted}>Markdown: ## Judul sub-bab · **tebal** · $$ rumus $$ di baris sendiri = rumus besar di tengah · awali baris dengan &gt; untuk kotak rumus (baris pertama jadi labelnya).</small>
                )}
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
                  <span style={styles.fileName}>{attachment ? attachment.name : editingBlock ? attachmentDisplayName(editingBlock) : "Belum ada berkas dipilih"}</span>
                  <input
                    id="module-attachment-file"
                    required={!editingBlock}
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
              {editingBlock ? "Simpan perubahan" : blockType === "teks" ? "Tambahkan blok" : blockType === "sub_bab" ? "Tambahkan sub-bab" : blockType === "video" ? "Tambahkan video" : "Unggah lampiran"}
            </button>
            {editingBlock ? (
              <button type="button" onClick={cancelEditBlock} style={styles.secondaryButton}>Batal</button>
            ) : null}
          </form>
          <h3 style={styles.contentListTitle}>Isi materi saat ini</h3>
          {moduleBlocks.length === 0 ? (
            <p style={styles.empty}>Belum ada isi pada modul ini. Tambahkan blok pertama lewat panel di atas.</p>
          ) : (
            <div className="module-list">
              {moduleBlocks.map((block, index) => (
                <article key={block.id} className={`module-row content-row ${editingBlock?.id === block.id ? "is-selected" : ""}`}>
                  <div className="content-row-main">
                    <strong>{BLOCK_TYPE_LABELS[block.type]}</strong>
                    <span>{blockSnippet(block)}</span>
                  </div>
                  <div className="content-row-actions">
                    <button type="button" className="module-row-action" disabled={index === 0} onClick={() => void moveBlock(block.id, -1)}>Naik</button>
                    <button type="button" className="module-row-action" disabled={index === moduleBlocks.length - 1} onClick={() => void moveBlock(block.id, 1)}>Turun</button>
                    <button type="button" className="module-row-action" onClick={() => startEditBlock(block)}>Edit</button>
                    <button type="button" className="module-row-action" onClick={() => void deleteBlock(block)}>Hapus</button>
                  </div>
                </article>
              ))}
            </div>
          )}
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
        ) : worksheetStatusFilter === "arsip" ? (
          <div className="module-list">
            {visibleWorksheets.map((worksheet) => renderWorksheetRow(worksheet))}
          </div>
        ) : (
          <>
            {activeWorksheets.length > 0 ? (
              <div className="module-list">
                {activeWorksheets.map((worksheet) => renderWorksheetRow(worksheet))}
              </div>
            ) : null}
            {archivedWorksheets.length > 0 ? (
              <div className="archive-group">
                <button type="button" className="archive-group-toggle" aria-expanded={worksheetArchiveGroupOpen} onClick={toggleWorksheetArchiveGroup}>
                  <span>Arsip ({archivedWorksheets.length})</span>
                  <span aria-hidden="true">{worksheetArchiveGroupOpen ? "▾" : "▸"}</span>
                </button>
                {worksheetArchiveGroupOpen ? (
                  <div className="module-list">
                    {archivedWorksheets.map((worksheet) => renderWorksheetRow(worksheet, true))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      {selectedWorksheetId ? (
        <section id="panel-soal-lkpd" className="wizard-step-panel selected-resource-panel" data-active={guruStep === 1} style={styles.panel}>
          <div className="selected-resource-heading">
            <div>
              <p className="module-section-summary">LKPD terpilih</p>
              <h2 style={styles.sectionTitle}>{editingItem ? "Edit soal LKPD" : "Tambah soal LKPD"}</h2>
            </div>
            {!editingWorksheetMeta ? (
              <button type="button" className="module-row-action" onClick={startEditWorksheetMeta}>Edit LKPD</button>
            ) : null}
          </div>
          {editingWorksheetMeta ? (
            <form onSubmit={saveWorksheetMeta} style={styles.form}>
              <input required value={editWorksheetTitle} onChange={(event) => setEditWorksheetTitle(event.target.value)} placeholder="Judul LKPD" style={styles.input} />
              <textarea value={editWorksheetInstructions} onChange={(event) => setEditWorksheetInstructions(event.target.value)} placeholder="Petunjuk pengerjaan" rows={3} style={styles.textarea} />
              <button type="submit" style={styles.primaryButton}>Simpan data LKPD</button>
              <button type="button" onClick={() => setEditingWorksheetMeta(false)} style={styles.secondaryButton}>Batal</button>
            </form>
          ) : null}
          {editingItem ? (
            <p style={styles.message}>Mode edit: mengubah butir {WORKSHEET_ITEM_TYPE_LABELS[editingItem.item_type] ?? editingItem.item_type}. Jenis butir terkunci — untuk mengganti jenis, hapus butir ini lalu buat butir baru.</p>
          ) : null}
          <form onSubmit={editingItem ? updateWorksheetItem : addWorksheetItem} style={styles.form}>
            <select value={itemType} disabled={editingItem !== null} onChange={(event) => setItemType(event.target.value as typeof itemType)} style={styles.input}>
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
            <button type="submit" style={styles.primaryButton}>{editingItem ? "Simpan perubahan" : "Tambahkan soal"}</button>
            {editingItem ? (
              <button type="button" onClick={cancelEditItem} style={styles.secondaryButton}>Batal</button>
            ) : null}
          </form>
          <h3 style={styles.contentListTitle}>Soal saat ini</h3>
          {worksheetItems.length === 0 ? (
            <p style={styles.empty}>Belum ada soal pada LKPD ini. Tambahkan soal pertama lewat panel di atas.</p>
          ) : (
            <div className="module-list">
              {worksheetItems.map((item, index) => (
                <article key={item.id} className={`module-row content-row ${editingItem?.id === item.id ? "is-selected" : ""}`}>
                  <div className="content-row-main">
                    <strong>{index + 1}. {truncateText(item.prompt, 70) || "Soal"}</strong>
                    <span>{WORKSHEET_ITEM_TYPE_LABELS[item.item_type] ?? item.item_type} · {item.points} poin</span>
                  </div>
                  <div className="content-row-actions">
                    <button type="button" className="module-row-action" disabled={index === 0} onClick={() => void moveItem(item.id, -1)}>Naik</button>
                    <button type="button" className="module-row-action" disabled={index === worksheetItems.length - 1} onClick={() => void moveItem(item.id, 1)}>Turun</button>
                    <button type="button" className="module-row-action" onClick={() => startEditItem(item)}>Edit</button>
                    <button type="button" className="module-row-action" onClick={() => void deleteItem(item)}>Hapus</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 3} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Penugasan ke kelas</h2>
            <p className="module-section-summary">{assignmentStatusFilter === "semua" ? `${assignments.length} penugasan · pilih aksi dari daftar` : `Menampilkan ${visibleAssignments.length} dari ${assignments.length} penugasan`}</p>
          </div>
        </div>
        <details className="guru-collapsible" ref={assignmentFormRef}>
          <summary>{editingAssignment ? "Edit penugasan" : "+ Buat penugasan"}</summary>
          <form onSubmit={editingAssignment ? saveAssignmentEdit : createAssignment} style={styles.form}>
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
            {editingAssignment?.status === "terbit" ? <p style={styles.message}>Modul, LKPD, dan kelas tujuan terkunci bila sudah ada murid yang mengerjakan.</p> : null}
            <button type="submit" style={styles.primaryButton}>{editingAssignment ? "Simpan perubahan" : "Buat draf penugasan"}</button>
            {editingAssignment ? <button type="button" onClick={exitAssignmentEdit} style={styles.secondaryButton}>Batal</button> : null}
          </form>
        </details>
        {assignments.length > 0 ? (
          <div className="assignment-status-filter" role="group" aria-label="Saring status penugasan">
            {ASSIGNMENT_STATUS_FILTER_OPTIONS.map((option) => (
              <button key={option.value} type="button" className={`filter-chip${assignmentStatusFilter === option.value ? " is-active" : ""}`} aria-pressed={assignmentStatusFilter === option.value} onClick={() => setAssignmentStatusFilter(option.value)}>
                {option.label} ({assignmentStatusCounts[option.value]})
              </button>
            ))}
          </div>
        ) : null}
        {assignments.length === 0 ? <p style={styles.empty}>Belum ada penugasan.</p> : visibleAssignments.length === 0 ? (
          <p style={styles.empty}>Tidak ada penugasan berstatus {activeAssignmentFilterLabel}.</p>
        ) : <div className="module-list">{visibleAssignments.map((assignment) => <article key={assignment.id} className="resource-row resource-row-assignment"><div className="module-row-main"><strong>{assignment.title}</strong><span>{assignment.classes.map((kelas) => kelas.name).join(", ") || "Tanpa kelas"}</span><span>{assignment.status} · batas {formatDate(assignment.due_at)}</span></div><div className="resource-row-actions">{assignment.status !== "ditutup" ? <button type="button" onClick={() => startEditAssignment(assignment)} className="row-action-button is-outline"><svg className="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>Edit</button> : null}<button type="button" onClick={() => void changeAssignmentStatus(assignment)} className={assignment.status === "terbit" ? "row-action-button is-outline" : "row-action-button is-primary"}>{assignment.status === "terbit" ? <><svg className="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>Tutup</> : "Terbitkan"}</button>{assignment.status === "terbit" ? <a href={`https://wa.me/?text=${encodeURIComponent(buildWhatsAppShareMessage(assignment, typeof window !== "undefined" ? window.location.origin : ""))}`} target="_blank" rel="noreferrer" className="row-action-button is-whatsapp"><svg className="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" /></svg>Bagikan WA</a> : null}</div></article>)}</div>}
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

      <section className="wizard-step-panel compact-resource-section" data-active={guruStep === 4} style={styles.panel}>
        <div className="module-section-heading">
          <div>
            <h2 style={styles.sectionTitle}>Rekap penugasan</h2>
            <p className="module-section-summary">{assignments.length} penugasan · pilih penugasan untuk melihat rekap dan exit ticket</p>
          </div>
        </div>
        {assignments.length > 0 ? <div className="module-list">{assignments.map((assignment) => <article key={assignment.id} className="resource-row resource-row-assignment"><div className="module-row-main"><strong>{assignment.title}</strong><span>{assignment.classes.map((kelas) => kelas.name).join(", ") || "Tanpa kelas"}</span><span>{assignment.status} · batas {formatDate(assignment.due_at)}</span></div><div className="resource-row-actions"><button type="button" onClick={() => void loadSessionReport(assignment.id)} className={`row-action-button is-outline${selectedReportAssignmentId === assignment.id ? " is-active" : ""}`} aria-pressed={selectedReportAssignmentId === assignment.id} disabled={sessionReportLoading && selectedReportAssignmentId === assignment.id}><svg className="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M10 10v10" /></svg>{sessionReportLoading && selectedReportAssignmentId === assignment.id ? "Memuat…" : selectedReportAssignmentId === assignment.id ? "Segarkan rekap" : "Lihat rekap"}</button><button type="button" onClick={() => void loadAssignmentSummary(assignment.id)} className={`row-action-button is-outline${selectedAssignmentId === assignment.id ? " is-active" : ""}`} aria-pressed={selectedAssignmentId === assignment.id} disabled={assignmentSummaryLoading && selectedAssignmentId === assignment.id}><svg className="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6" /><path d="M9 12h6" /></svg>{assignmentSummaryLoading && selectedAssignmentId === assignment.id ? "Memuat…" : selectedAssignmentId === assignment.id ? "Segarkan exit ticket" : "Lihat exit ticket"}</button></div></article>)}</div> : <p style={styles.empty}>Belum ada penugasan.</p>}
      </section>

      {selectedReportAssignmentId ? (
        <section ref={sessionReportPanelRef} className="wizard-step-panel" data-active={guruStep === 4} style={styles.panel}>
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
                      <td style={styles.reportCell}>{submissionStatusLabel(student.submission_status)}</td>
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
        <section ref={exitTicketPanelRef} className="wizard-step-panel" data-active={guruStep === 4} style={styles.panel}>
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

        <section className="wizard-step-panel teacher-grading-section" data-active={guruStep === 4} style={styles.panel}>
          <h2 style={styles.sectionTitle}>Pengumpulan LKPD</h2>
          <div style={styles.moduleToolbar}>
            <select
              value={gradingCombined ? "semua" : String(gradingSource)}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "semua") {
                  setGradingSource("semua");
                } else {
                  setSelectedWorksheetId(Number(value));
                }
              }}
              aria-label="Sumber pengumpulan LKPD"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="semua">Semua LKPD</option>
              {worksheets.map((worksheet) => (
                <option key={worksheet.id} value={String(worksheet.id)}>{worksheet.title}</option>
              ))}
            </select>
            <select
              value={gradingStatusFilter}
              onChange={(event) => setGradingStatusFilter(event.target.value as GradingStatusFilter)}
              aria-label="Saring status pengumpulan"
              style={{ ...styles.input, ...styles.moduleFilterSelect }}
            >
              <option value="semua">Semua status</option>
              <option value="draf">Draf</option>
              <option value="terkumpul">Terkumpul</option>
              <option value="belum_dinilai">Belum dinilai</option>
              <option value="sudah_dinilai">Sudah dinilai</option>
            </select>
          </div>
          {attemptLoading && gradingAttempts.length === 0 ? <p style={styles.muted}>Memuat pengumpulan...</p> : null}
          {!attemptLoading && gradingAttempts.length === 0 ? (
            <p style={styles.empty}>{gradingCombined ? "Belum ada pengumpulan dari LKPD mana pun." : "Belum ada murid yang mengumpulkan LKPD ini."}</p>
          ) : null}
          {gradingAttempts.length > 0 ? (
            <div className="teacher-attempt-layout">
              <div className="teacher-attempt-list" style={styles.list}>
                {visibleGradingAttempts.map((attempt) => (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => {
                      if (gradingCombined && attempt.worksheet_id && attempt.worksheet_id !== selectedWorksheetId) {
                        gradingPickRef.current = true;
                        setSelectedWorksheetId(attempt.worksheet_id);
                      }
                      setSelectedAttemptId(attempt.id);
                    }}
                    style={{ ...styles.attempt, borderColor: selectedAttemptId === attempt.id ? "#175cd3" : "#eaecf0" }}
                  >
                    <strong>{attempt.student_name}</strong>
                    {gradingCombined && attempt.worksheet_title ? <span style={styles.muted}>{attempt.worksheet_title}</span> : null}
                    <span style={styles.muted}>{attempt.username} · {attempt.status}</span>
                    <span style={styles.muted}>{attempt.total_score === null ? "Belum dinilai" : `Nilai ${attempt.total_score}`}</span>
                  </button>
                ))}
                {visibleGradingAttempts.length === 0 ? <p style={styles.muted}>Tidak ada pengumpulan yang cocok dengan saringan status ini.</p> : null}
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
    if (block.content.format === "markdown" || typeof block.content.markdown === "string") {
      return <MarkdownHtml markdown={String(block.content.markdown ?? "")} className="math-rich-content" />;
    }
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

const BLOCK_TYPE_LABELS: Record<ModuleBlock["type"], string> = {
  teks: "Teks",
  sub_bab: "Sub-bab",
  video: "Video",
  gambar: "Gambar",
  berkas: "Berkas",
};

function stripHtmlToText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, max = 90) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function blockStringField(block: ModuleBlock, field: string) {
  const value = block.content[field];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function blockSnippet(block: ModuleBlock): string {
  if (block.type === "teks") {
    const raw = typeof block.content.markdown === "string" ? block.content.markdown : stripHtmlToText(String(block.content.html ?? ""));
    return truncateText(raw) || "Blok teks kosong";
  }
  if (block.type === "sub_bab") return blockStringField(block, "title") || "Sub-bab";
  if (block.type === "video") return blockStringField(block, "caption") || blockStringField(block, "youtubeUrl") || "Video";
  if (block.type === "gambar") return blockStringField(block, "caption") || "Gambar terlampir";
  return blockStringField(block, "label") || "Berkas terlampir";
}

function attachmentDisplayName(block: ModuleBlock) {
  return blockStringField(block, "caption") || blockStringField(block, "label") || block.attachment_key || "Lampiran saat ini";
}

const ASSIGNMENT_STATUS_FILTER_OPTIONS = [
  { value: "semua", label: "Semua" },
  { value: "terbit", label: "Terbit" },
  { value: "draf", label: "Draf" },
  { value: "ditutup", label: "Ditutup" },
] as const;

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
  contentListTitle: { fontSize: 16, margin: "22px 0 10px" },
  form: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 },
  input: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const },
  textarea: { border: "1px solid #d0d5dd", borderRadius: 8, padding: 11, fontFamily: "inherit", resize: "vertical" as const, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const },
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
  label: { display: "grid", gap: 6, color: "#344054", fontSize: 14, minWidth: 0 },
  checkboxList: { display: "grid", gap: 8, border: "1px solid #eaecf0", borderRadius: 8, padding: 12, minWidth: 0 },
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

// Gulirkan panel hasil (rekap sesi / exit ticket) masuk layar sesudah
// ter-render. Gerak halus dimatikan bila pengguna meminta pengurangan gerak.
function scrollPanelIntoView(element: HTMLElement | null) {
  if (!element) return;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function buildWhatsAppShareMessage(assignment: AssignmentSummary, origin: string) {
  const due = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(assignment.due_at));
  const lines = [`📚 *${assignment.title}*`];
  if (assignment.classes.length > 0) lines.push(`Kelas: ${assignment.classes.map((kelas) => kelas.name).join(", ")}`);
  lines.push(
    "",
    "Kegiatan belajar hari ini:",
    "1. Baca dan pahami materi di SIMAK",
    "2. Kerjakan LKPD-nya",
    "3. Kerjakan kuis di RUAS",
    "4. Isi exit ticket 3-2-1",
    "",
    `⏰ Batas pengumpulan: ${due} WIB — pengumpulan tercatat sebagai kehadiran.`,
    `🔗 SIMAK: ${origin}`,
  );
  if (assignment.ruas_quiz_url) lines.push(`🔗 RUAS: ${assignment.ruas_quiz_url}`);
  return lines.join("\n");
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
