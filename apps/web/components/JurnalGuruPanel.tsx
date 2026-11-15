"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  filterGuruJournalClasses,
  groupEntriesByDate,
  guruJournalClassLabel,
  journalDateLabel,
  type GuruJournalEntriesData,
  type GuruJournalOverviewData,
  type GuruJournalStudent,
} from "../lib/jurnal";

type OverviewResponse = { ok: true; data: GuruJournalOverviewData };
type EntriesResponse = { ok: true; data: GuruJournalEntriesData };

// Panel "Jurnal Belajar" (Hub Murid Tahap 3): guru MEMBACA jurnal
// murid-murid dalam jangkauan penugasannya (aturan Pantau Hasil:
// penugasan guru → kelas sasaran → murid). Alurnya daftar kelas →
// daftar murid beserta jumlah entri + entri terakhir → entri per
// murid, terbaru dulu. Panel ini MURNI BACA by design: tidak ada
// kolom nilai, komentar, atau tombol aksi penilaian apa pun — jurnal
// adalah bahan refleksi dan bimbingan, bukan tugas yang dinilai.
export function JurnalGuruPanel() {
  const [overview, setOverview] = useState<GuruJournalOverviewData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<GuruJournalStudent | null>(null);
  const [entriesData, setEntriesData] = useState<GuruJournalEntriesData | null>(null);
  const [entriesError, setEntriesError] = useState("");
  const [entriesLoading, setEntriesLoading] = useState(false);

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
    try {
      const response = await apiRequest<EntriesResponse>(`/guru/jurnal/entries?studentId=${student.id}`);
      setEntriesData(response.data);
    } catch (error) {
      setEntriesError(error instanceof Error ? error.message : "Entri jurnal murid tidak dapat dimuat.");
    } finally {
      setEntriesLoading(false);
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
          onClick={() => {
            setSelected(null);
            setEntriesData(null);
            setEntriesError("");
          }}
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
              {group.entries.map((entry) => (
                <article key={entry.id} className="jurnal-guru-entry">
                  <div className="jurnal-guru-entry-head">
                    {entry.prompt_text ? <span className="jurnal-guru-entry-prompt">{entry.prompt_text}</span> : null}
                    {entry.mood_label ? <span>{entry.mood_emoji} {entry.mood_label}</span> : null}
                  </div>
                  <p className="jurnal-guru-entry-body">{entry.body}</p>
                  {entry.linked_module_title ? (
                    <p className="jurnal-guru-entry-meta">📚 Materi: {entry.linked_module_title}</p>
                  ) : null}
                </article>
              ))}
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
