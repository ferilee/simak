"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";

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
type ClassSummary = { id: number; name: string; subject: string; academic_year: string; is_archived: boolean };
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

  if (loading) return <main style={styles.container}><p>Memuat ruang guru...</p></main>;

  return (
    <main style={styles.container}>
      <div style={styles.topline}>
        <div>
          <p style={styles.eyebrow}>SIMAK · GURU</p>
          <h1 style={styles.title}>Materi pembelajaran</h1>
        </div>
        <button type="button" onClick={() => void logout()} style={styles.secondaryButton}>Keluar</button>
      </div>
      <p style={styles.muted}>Buat modul, susun blok materi, lalu terbitkan untuk murid.</p>
      {message ? <p role="alert" style={styles.message}>{message}</p> : null}

      <section style={styles.panel}>
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
        {assignments.length > 0 ? <div style={{ ...styles.list, marginTop: 16 }}>{assignments.map((assignment) => <article key={assignment.id} style={styles.assignmentCard}><div style={styles.assignmentInfo}><strong>{assignment.title}</strong><span style={styles.muted}>{assignment.classes.map((kelas) => kelas.name).join(", ") || "Tanpa kelas"}</span><span style={styles.muted}>{assignment.status} · batas {formatDate(assignment.due_at)}</span></div><button type="button" onClick={() => void changeAssignmentStatus(assignment)} style={styles.secondaryButton}>{assignment.status === "terbit" ? "Tutup" : "Terbitkan"}</button></article>)}</div> : <p style={styles.empty}>Belum ada penugasan.</p>}
      </section>

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
};

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
