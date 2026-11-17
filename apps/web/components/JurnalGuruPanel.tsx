"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  filterGuruJournalClasses,
  groupEntriesByDate,
  guruJournalClassLabel,
  journalDateLabel,
  journalDateTimeLabel,
  type GuruJournalEntriesData,
  type GuruJournalOverviewData,
  type GuruJournalStudent,
  type JournalEntry,
} from "../lib/jurnal";

type OverviewResponse = { ok: true; data: GuruJournalOverviewData };
type EntriesResponse = { ok: true; data: GuruJournalEntriesData };
type EntryResponse = { ok: true; data: JournalEntry };

// Panel "Jurnal Belajar" (Hub Murid Tahap 3 + Tanggapan Guru): guru
// MEMBACA jurnal murid-murid dalam jangkauan penugasannya (aturan
// Pantau Hasil: penugasan guru → kelas sasaran → murid). Alurnya
// daftar kelas → daftar murid beserta jumlah entri + entri terakhir →
// entri per murid, terbaru dulu. Membuka detail seorang murid
// menandai entri yang tampil sebagai sudah ditinjau di server;
// lencana "perlu ditinjau" menghitung entri yang belum ditinjau.
// Satu-satunya tulisan guru di sini adalah SATU tanggapan singkat
// per entri — bimbingan satu arah, bukan diskusi (murid tidak dapat
// membalas) dan bukan penilaian: tidak ada kolom nilai atau skor.
export function JurnalGuruPanel() {
  const [overview, setOverview] = useState<GuruJournalOverviewData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<GuruJournalStudent | null>(null);
  const [entriesData, setEntriesData] = useState<GuruJournalEntriesData | null>(null);
  const [entriesError, setEntriesError] = useState("");
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState<Record<number, string>>({});
  const [editingResponseId, setEditingResponseId] = useState<number | null>(null);
  const [savingResponseId, setSavingResponseId] = useState<number | null>(null);
  const [responseErrors, setResponseErrors] = useState<Record<number, string>>({});

  async function loadOverview() {
    try {
      const response = await apiRequest<OverviewResponse>("/guru/jurnal");
      setOverview(response.data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Jurnal murid tidak dapat dimuat.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiRequest<OverviewResponse>("/guru/jurnal");
        if (!cancelled) setOverview(response.data);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Jurnal murid tidak dapat dimuat.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openStudent(student: GuruJournalStudent) {
    setSelected(student);
    setEntriesData(null);
    setEntriesError("");
    setEntriesLoading(true);
    setEditingResponseId(null);
    setResponseErrors({});
    try {
      const response = await apiRequest<EntriesResponse>(`/guru/jurnal/entries?studentId=${student.id}`);
      setEntriesData(response.data);
    } catch (error) {
      setEntriesError(error instanceof Error ? error.message : "Entri jurnal murid tidak dapat dimuat.");
    } finally {
      setEntriesLoading(false);
    }
  }

  function backToList() {
    setSelected(null);
    setEntriesData(null);
    setEntriesError("");
    setEditingResponseId(null);
    // Ringkasan dimuat ulang: membuka detail tadi menandai entri
    // sebagai ditinjau dan tanggapan mungkin berubah, jadi hitungan
    // "perlu ditinjau" harus dihitung ulang dari server.
    void loadOverview();
  }

  function startResponseEdit(entry: JournalEntry) {
    setResponseDrafts((current) => ({ ...current, [entry.id]: entry.teacher_response ?? "" }));
    setResponseErrors((current) => ({ ...current, [entry.id]: "" }));
    setEditingResponseId(entry.id);
  }

  async function saveResponse(entry: JournalEntry, responseText: string) {
    setSavingResponseId(entry.id);
    setResponseErrors((current) => ({ ...current, [entry.id]: "" }));
    try {
      const response = await apiRequest<EntryResponse>(`/guru/jurnal/entries/${entry.id}/tanggapan`, {
        method: "PUT",
        body: JSON.stringify({ response: responseText }),
      });
      setEntriesData((current) =>
        current
          ? { ...current, entries: current.entries.map((item) => (item.id === entry.id ? response.data : item)) }
          : current,
      );
      setEditingResponseId(null);
    } catch (error) {
      setResponseErrors((current) => ({
        ...current,
        [entry.id]: error instanceof Error ? error.message : "Tanggapan gagal disimpan.",
      }));
    } finally {
      setSavingResponseId(null);
    }
  }

  if (loadError) {
    return (
      <div className="jurnal-guru-panel">
        <p className="jurnal-guru-error" role="alert">{loadError}</p>
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="jurnal-guru-panel">
        <p className="jurnal-guru-loading">Memuat jurnal murid...</p>
      </div>
    );
  }

  if (selected) {
    const groups = entriesData ? groupEntriesByDate(entriesData.entries) : [];
    return (
      <div className="jurnal-guru-panel">
        <button
          type="button"
          className="button button-secondary jurnal-guru-back"
          onClick={backToList}
        >
          ← Kembali ke daftar murid
        </button>
        <h3 className="jurnal-guru-class-title">
          Jurnal {selected.name} <span className="jurnal-guru-student-meta">({selected.username})</span>
        </h3>
        {entriesError ? (
          <p className="jurnal-guru-error" role="alert">{entriesError}</p>
        ) : entriesLoading || !entriesData ? (
          <p className="jurnal-guru-loading">Memuat entri jurnal...</p>
        ) : entriesData.entries.length === 0 ? (
          <p className="jurnal-guru-note">Murid ini belum menulis entri jurnal.</p>
        ) : (
          groups.map((group) => (
            <div key={group.date} className="jurnal-guru-entries">
              <h4 className="jurnal-guru-class-title">{group.label}</h4>
              {group.entries.map((entry) => {
                const draft = responseDrafts[entry.id] ?? "";
                const responseError = responseErrors[entry.id] ?? "";
                const saving = savingResponseId === entry.id;
                return (
                  <article key={entry.id} className="jurnal-guru-entry">
                    <div className="jurnal-guru-entry-head">
                      {entry.prompt_text ? <span className="jurnal-guru-entry-prompt">{entry.prompt_text}</span> : null}
                      {entry.mood_label ? <span>{entry.mood_emoji} {entry.mood_label}</span> : null}
                      {entry.reviewed_at === null ? <span className="jurnal-guru-unreviewed">Belum ditinjau</span> : null}
                    </div>
                    <p className="jurnal-guru-entry-body">{entry.body}</p>
                    {entry.linked_module_title ? (
                      <p className="jurnal-guru-entry-meta">📚 Materi: {entry.linked_module_title}</p>
                    ) : null}
                    {editingResponseId === entry.id ? (
                      <div className="jurnal-guru-response-form">
                        <label className="jurnal-guru-response-label" htmlFor={`tanggapan-${entry.id}`}>
                          Tanggapan guru (maks 500 karakter)
                        </label>
                        <textarea
                          id={`tanggapan-${entry.id}`}
                          className="jurnal-guru-response-textarea"
                          value={draft}
                          maxLength={500}
                          rows={3}
                          onChange={(event) =>
                            setResponseDrafts((current) => ({ ...current, [entry.id]: event.target.value }))
                          }
                          placeholder="Tulis tanggapan singkat untuk murid ini..."
                        />
                        {responseError ? (
                          <p className="jurnal-guru-error" role="alert">{responseError}</p>
                        ) : null}
                        <div className="jurnal-guru-response-actions">
                          <span className="jurnal-guru-entry-meta">{draft.length}/500</span>
                          <button
                            type="button"
                            className="button"
                            disabled={saving || draft.trim() === ""}
                            onClick={() => void saveResponse(entry, draft)}
                          >
                            {saving ? "Menyimpan..." : "Simpan tanggapan"}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={saving}
                            onClick={() => setEditingResponseId(null)}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : entry.teacher_response ? (
                      <div className="jurnal-guru-response">
                        <p className="jurnal-guru-response-head">
                          💬 Tanggapan guru
                          {entry.teacher_responded_by_name ? ` · ${entry.teacher_responded_by_name}` : ""}
                          {entry.teacher_response_at ? ` · ${journalDateTimeLabel(entry.teacher_response_at)}` : ""}
                        </p>
                        <p className="jurnal-guru-response-body">{entry.teacher_response}</p>
                        <div className="jurnal-guru-response-actions">
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={saving}
                            onClick={() => startResponseEdit(entry)}
                          >
                            Sunting tanggapan
                          </button>
                          <button
                            type="button"
                            className="button button-secondary jurnal-guru-response-delete"
                            disabled={saving}
                            onClick={() => void saveResponse(entry, "")}
                          >
                            {saving ? "Menghapus..." : "Hapus tanggapan"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="jurnal-guru-response-actions">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => startResponseEdit(entry)}
                        >
                          Tulis tanggapan
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ))
        )}
      </div>
    );
  }

  const visibleClasses = filterGuruJournalClasses(overview.classes, classFilter);
  const totalStudents = overview.classes.reduce((sum, kelas) => sum + kelas.students.length, 0);

  return (
    <div className="jurnal-guru-panel">
      <p className="jurnal-guru-note">
        Jurnal belajar adalah refleksi harian murid — bahan membaca dan bimbingan, bukan tugas yang dinilai.
        Yang tampil di sini adalah murid dari kelas sasaran penugasan Anda.
      </p>
      {overview.unreviewed_total > 0 ? (
        <p className="jurnal-guru-review-row">
          <span className="jurnal-guru-review-badge">{overview.unreviewed_total} perlu ditinjau</span>
        </p>
      ) : null}
      {overview.classes.length > 1 ? (
        <div className="kurikulum-chips" role="group" aria-label="Saringan kelas">
          <button
            type="button"
            className={`kurikulum-chip${classFilter === null ? " is-active" : ""}`}
            onClick={() => setClassFilter(null)}
          >
            Semua kelas
          </button>
          {overview.classes.map((kelas) => (
            <button
              key={kelas.id}
              type="button"
              className={`kurikulum-chip${classFilter === kelas.id ? " is-active" : ""}`}
              onClick={() => setClassFilter(kelas.id)}
            >
              {guruJournalClassLabel(kelas)}
            </button>
          ))}
        </div>
      ) : null}
      {totalStudents === 0 ? (
        <p className="jurnal-guru-note">Belum ada murid dalam jangkauan penugasan Anda.</p>
      ) : (
        visibleClasses.map((kelas) => (
          <section key={kelas.id} className="jurnal-guru-class">
            <h3 className="jurnal-guru-class-title">{guruJournalClassLabel(kelas)}</h3>
            {kelas.students.length === 0 ? (
              <p className="jurnal-guru-note">Tidak ada murid pada kelas ini.</p>
            ) : (
              <div className="jurnal-guru-students">
                {kelas.students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className="jurnal-guru-student"
                    onClick={() => void openStudent(student)}
                  >
                    <span className="jurnal-guru-student-name">{student.name}</span>
                    <span className="jurnal-guru-student-meta">
                      {student.entry_count > 0
                        ? `${student.entry_count} entri · terakhir ${student.last_entry_date ? journalDateLabel(student.last_entry_date) : "-"}`
                        : "Belum pernah menulis"}
                      {student.unreviewed_count > 0 ? ` · ${student.unreviewed_count} belum ditinjau` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
