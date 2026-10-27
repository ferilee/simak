"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiBase, apiRequest } from "../../lib/api";

type ModuleSummary = {
  id: number;
  title: string;
  subject: string;
  description: string | null;
  status: "draf" | "terbit" | "arsip";
  version: number;
};

type ModulesResponse = { ok: true; data: ModuleSummary[] };
type WorksheetSummary = {
  id: number;
  module_id: number | null;
  title: string;
  instructions: string | null;
  status: "draf" | "terbit" | "arsip";
};
type WorksheetsResponse = { ok: true; data: WorksheetSummary[] };
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [blockHtml, setBlockHtml] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [worksheets, setWorksheets] = useState<WorksheetSummary[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [className, setClassName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [classAcademicYear, setClassAcademicYear] = useState("2026/2027");
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [selectedWorksheetId, setSelectedWorksheetId] = useState<number | null>(null);
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [worksheetInstructions, setWorksheetInstructions] = useState("");
  const [itemType, setItemType] = useState<"pilihan_ganda" | "isian_singkat" | "uraian">("pilihan_ganda");
  const [itemPrompt, setItemPrompt] = useState("");
  const [itemOptions, setItemOptions] = useState("");
  const [itemAnswerKey, setItemAnswerKey] = useState("");
  const [itemPoints, setItemPoints] = useState("10");
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
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [teacherComment, setTeacherComment] = useState("");
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadModules() {
    try {
      const me = await apiRequest<MeResponse>("/auth/me");
      if (me.user.role !== "guru") {
        setMessage("Akun ini berperan sebagai murid. Keluar dahulu lalu masuk dengan akun guru.");
        return;
      }
      const [response, worksheetResponse, classResponse, assignmentResponse] = await Promise.all([
        apiRequest<ModulesResponse>("/modules"),
        apiRequest<WorksheetsResponse>("/worksheets"),
        apiRequest<ClassesResponse>("/classes"),
        apiRequest<AssignmentsResponse>("/assignments"),
      ]);
      setModules(response.data);
      setSelectedId((current) => current ?? response.data[0]?.id ?? null);
      setWorksheets(worksheetResponse.data);
      setSelectedWorksheetId((current) => current ?? worksheetResponse.data[0]?.id ?? null);
      setClasses(classResponse.data.filter((kelas) => !kelas.is_archived));
      setAssignments(assignmentResponse.data);
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

  async function addTextBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !blockHtml.trim()) return;
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Blok belum dapat ditambahkan.");
    }
  }

  async function addAttachmentBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !attachment) return;
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lampiran belum dapat ditambahkan.");
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
    const options = itemType === "pilihan_ganda"
      ? { itemType, options: itemOptions.split("\n").map((option) => option.trim()).filter(Boolean) }
      : itemType === "isian_singkat"
        ? { itemType, tolerance: 0 }
        : { itemType };
    try {
      await apiRequest(`/worksheets/${selectedWorksheetId}/items`, {
        method: "POST",
        body: JSON.stringify({
          itemType,
          prompt: itemPrompt,
          options,
          answerKey: itemAnswerKey || undefined,
          points: Number(itemPoints) || 10,
        }),
      });
      setItemPrompt("");
      setItemOptions("");
      setItemAnswerKey("");
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
          <h1 className="dashboard-title">Materi pembelajaran</h1>
          <p className="dashboard-subtitle">Buat modul, susun blok materi, lalu terbitkan untuk murid.</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" onClick={() => void logout()} className="button button-secondary">Keluar</button>
        </div>
      </header>
      {message ? <p className="dashboard-alert container" role="alert" aria-live="polite">{message}</p> : null}

      <div className="container guru-content">
      <section style={{ ...styles.panel, marginTop: 0 }}>
        <h2 style={styles.sectionTitle}>Buat modul</h2>
        <form onSubmit={createModule} style={styles.form}>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul modul" style={styles.input} />
          <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Mata pelajaran" style={styles.input} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Deskripsi singkat" rows={3} style={styles.textarea} />
          <button type="submit" style={styles.primaryButton}>Buat draf</button>
        </form>
      </section>

      <section>
        <h2 style={styles.sectionTitle}>Modul saya</h2>
        {modules.length === 0 ? <p style={styles.empty}>Belum ada modul.</p> : (
          <div style={styles.list}>
            {modules.map((module) => (
              <article key={module.id} style={{ ...styles.module, borderColor: selectedId === module.id ? "#175cd3" : "#eaecf0" }}>
                <button type="button" onClick={() => setSelectedId(module.id)} style={styles.moduleSelect}>
                  <strong>{module.title}</strong>
                  <span style={styles.muted}>{module.subject} · versi {module.version}</span>
                </button>
                <span style={styles.status}>{module.status}</span>
                <button type="button" onClick={() => void changeStatus(module)} style={styles.secondaryButton}>
                  {module.status === "terbit" ? "Arsipkan" : "Terbitkan"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Kelas saya</h2>
        <form onSubmit={createClass} style={styles.form}>
          <input required value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Nama kelas, misalnya XI DPIB" style={styles.input} />
          <input required value={classSubject} onChange={(event) => setClassSubject(event.target.value)} placeholder="Mata pelajaran" style={styles.input} />
          <input required value={classAcademicYear} onChange={(event) => setClassAcademicYear(event.target.value)} placeholder="Tahun ajaran, misalnya 2026/2027" style={styles.input} />
          <button type="submit" style={styles.primaryButton}>Buat kelas</button>
        </form>
        {classes.length > 0 ? <div style={{ ...styles.list, marginTop: 16 }}>{classes.map((kelas) => <article key={kelas.id} style={styles.classCard}><div style={styles.assignmentInfo}><strong>{kelas.name}</strong><span style={styles.muted}>{kelas.subject} · {kelas.academic_year}</span><span style={styles.muted}>Kode gabung: <strong>{kelas.join_code}</strong></span></div></article>)}</div> : <p style={styles.empty}>Belum ada kelas. Buat kelas untuk dapat dipilih sebagai tujuan penugasan.</p>}
      </section>

      {selectedId ? (
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Tambah blok teks</h2>
          <form onSubmit={addTextBlock} style={styles.form}>
            <textarea
              required
              value={blockHtml}
              onChange={(event) => setBlockHtml(event.target.value)}
              placeholder="Tulis isi materi. HTML dasar seperti <strong>tebal</strong> boleh digunakan."
              rows={6}
              style={styles.textarea}
            />
            <button type="submit" style={styles.primaryButton}>Tambahkan blok</button>
          </form>
          <h2 style={styles.sectionTitle}>Tambah lampiran</h2>
          <form onSubmit={addAttachmentBlock} style={styles.form}>
            <input
              required
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
              style={styles.input}
            />
            <small style={styles.muted}>JPG, PNG, WebP, atau PDF. Maksimal 10 MB.</small>
            <button type="submit" style={styles.primaryButton}>Unggah lampiran</button>
          </form>
        </section>
      ) : null}

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>LKPD</h2>
        <form onSubmit={createWorksheet} style={styles.form}>
          <input required value={worksheetTitle} onChange={(event) => setWorksheetTitle(event.target.value)} placeholder="Judul LKPD" style={styles.input} />
          <textarea value={worksheetInstructions} onChange={(event) => setWorksheetInstructions(event.target.value)} placeholder="Petunjuk pengerjaan" rows={3} style={styles.textarea} />
          <button type="submit" style={styles.primaryButton}>Buat LKPD dari modul terpilih</button>
        </form>
        {worksheets.length > 0 ? (
          <div style={{ ...styles.list, marginTop: 16 }}>
            {worksheets.map((worksheet) => (
              <article key={worksheet.id} style={{ ...styles.module, borderColor: selectedWorksheetId === worksheet.id ? "#175cd3" : "#eaecf0" }}>
                <button type="button" onClick={() => setSelectedWorksheetId(worksheet.id)} style={styles.moduleSelect}>
                  <strong>{worksheet.title}</strong>
                  <span style={styles.muted}>{worksheet.status}</span>
                </button>
                <button type="button" onClick={() => void changeWorksheetStatus(worksheet)} style={styles.secondaryButton}>
                  {worksheet.status === "terbit" ? "Arsipkan" : "Terbitkan"}
                </button>
              </article>
            ))}
          </div>
        ) : <p style={styles.empty}>Belum ada LKPD.</p>}
      </section>

      {selectedWorksheetId ? (
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Tambah soal LKPD</h2>
          <form onSubmit={addWorksheetItem} style={styles.form}>
            <select value={itemType} onChange={(event) => setItemType(event.target.value as typeof itemType)} style={styles.input}>
              <option value="pilihan_ganda">Pilihan ganda</option>
              <option value="isian_singkat">Isian singkat</option>
              <option value="uraian">Uraian</option>
            </select>
            <textarea required value={itemPrompt} onChange={(event) => setItemPrompt(event.target.value)} placeholder="Pertanyaan" rows={3} style={styles.textarea} />
            {itemType === "pilihan_ganda" ? <textarea required value={itemOptions} onChange={(event) => setItemOptions(event.target.value)} placeholder="Pilihan jawaban, satu per baris" rows={4} style={styles.textarea} /> : null}
            <input value={itemAnswerKey} onChange={(event) => setItemAnswerKey(event.target.value)} placeholder="Kunci jawaban (opsional)" style={styles.input} />
            <input type="number" min={0} max={1000} value={itemPoints} onChange={(event) => setItemPoints(event.target.value)} placeholder="Poin" style={styles.input} />
            <button type="submit" style={styles.primaryButton}>Tambahkan soal</button>
          </form>
        </section>
      ) : null}

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Penugasan ke kelas</h2>
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
        {assignments.length > 0 ? <div style={{ ...styles.list, marginTop: 16 }}>{assignments.map((assignment) => <article key={assignment.id} style={styles.assignmentCard}><div style={styles.assignmentInfo}><strong>{assignment.title}</strong><span style={styles.muted}>{assignment.classes.map((kelas) => kelas.name).join(", ") || "Tanpa kelas"}</span><span style={styles.muted}>{assignment.status} · batas {formatDate(assignment.due_at)}</span></div><div style={styles.actionRow}><button type="button" onClick={() => void loadSessionReport(assignment.id)} style={styles.secondaryButton}>{selectedReportAssignmentId === assignment.id ? "Segarkan rekap" : "Lihat rekap"}</button><button type="button" onClick={() => void loadAssignmentSummary(assignment.id)} style={styles.secondaryButton}>{selectedAssignmentId === assignment.id ? "Segarkan exit ticket" : "Lihat exit ticket"}</button><button type="button" onClick={() => void changeAssignmentStatus(assignment)} style={styles.secondaryButton}>{assignment.status === "terbit" ? "Tutup" : "Terbitkan"}</button></div></article>)}</div> : <p style={styles.empty}>Belum ada penugasan.</p>}
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Rekap berdasarkan rentang tanggal</h2>
        <form onSubmit={(event) => { event.preventDefault(); void loadRangeReport(); }} style={styles.form}>
          <div style={styles.dateRange}>
            <label style={styles.label}>Dari<input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} style={styles.input} /></label>
            <label style={styles.label}>Sampai<input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} style={styles.input} /></label>
          </div>
          <button type="submit" style={styles.primaryButton}>Lihat rekap rentang</button>
        </form>
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

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Impor nilai RUAS</h2>
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
        {ruasImportResult ? <p style={styles.muted}>Baris: {ruasImportResult.total} · cocok: {ruasImportResult.cocok} · tidak ditemukan: {ruasImportResult.tidak_ditemukan} · duplikat: {ruasImportResult.duplikat}</p> : null}
        {ruasImportResult?.unmatched.length ? <div style={styles.warningBox}>Baris yang perlu diperiksa: {ruasImportResult.unmatched.map((row) => `${row.identifier} (${row.match_status})`).join(", ")}</div> : null}
      </section>

      {selectedReportAssignmentId ? (
        <section style={styles.panel}>
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
        <section style={styles.panel}>
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
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Pengumpulan LKPD</h2>
          {attemptLoading && attempts.length === 0 ? <p style={styles.muted}>Memuat pengumpulan...</p> : null}
          {!attemptLoading && attempts.length === 0 ? <p style={styles.empty}>Belum ada murid yang mengumpulkan LKPD ini.</p> : null}
          {attempts.length > 0 ? (
            <div style={styles.attemptLayout}>
              <div style={styles.list}>
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
                <div style={styles.review}>
                  <h3 style={styles.reviewTitle}>{attemptDetail.attempt.student_name}</h3>
                  <p style={styles.muted}>{attemptDetail.attempt.username} · status {attemptDetail.attempt.status}</p>
                  {attemptDetail.items.map((item, index) => (
                    <article key={item.id} style={styles.answerCard}>
                      <strong>{index + 1}. {item.prompt}</strong>
                      <p style={styles.answerText}>{item.answer_text || "Tidak ada jawaban."}</p>
                      <small style={styles.muted}>Kunci: {item.answer_key || "Tidak ada kunci otomatis."} · Maksimal {item.points} poin</small>
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
    </main>
  );
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
  empty: { color: "#667085", background: "#f8f9fc", padding: 16, borderRadius: 8 },
  list: { display: "grid", gap: 10 },
  module: { display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, border: "1px solid", borderRadius: 10, padding: 14 },
  moduleSelect: { display: "grid", textAlign: "left" as const, gap: 4, border: 0, background: "transparent", padding: 0, font: "inherit" },
  status: { fontSize: 13, color: "#475467" },
  attemptLayout: { display: "grid", gridTemplateColumns: "minmax(180px, 0.7fr) minmax(0, 1.3fr)", gap: 16, alignItems: "start" },
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
