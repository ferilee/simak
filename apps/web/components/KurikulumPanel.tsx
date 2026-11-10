"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  clampSelection,
  gradesOf,
  planSections,
  semestersOf,
  subjectsOf,
  type KurikulumSelection,
  type KurikulumSet,
  type KurikulumSummary,
} from "../lib/kurikulum";

type SummaryResponse = { ok: true; data: KurikulumSummary[] };
type SetResponse = { ok: true; data: KurikulumSet };

// Panel "CP & ATP" (Tahap 1): daftar kurikulum baca-saja di ruang kerja
// guru. Guru memilih mapel → kelas → semester, lalu membaca pohon
// CP → TP/Materi → ATP beserta alokasi JP-nya persis seperti dokumen
// kurikulum yang disetujui. Tidak ada jalur tulis di panel ini; data
// resmi tinggal di API (lib/kurikulum di sisi api) dan terbit bersama
// rilis. Penautan modul/LKPD ke ATP adalah tahap berikutnya.
export function KurikulumPanel() {
  const [summaries, setSummaries] = useState<KurikulumSummary[] | null>(null);
  const [selection, setSelection] = useState<KurikulumSelection | null>(null);
  const [set, setSet] = useState<KurikulumSet | null>(null);
  const [loadError, setLoadError] = useState("");
  const [setError, setSetError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiRequest<SummaryResponse>("/kurikulum");
        if (cancelled) return;
        setSummaries(response.data);
        setSelection((current) => clampSelection(response.data, current));
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Daftar CP & ATP tidak dapat dimuat.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setSet(null);
    setSetError("");
    void (async () => {
      try {
        const params = new URLSearchParams({
          subject: selection.subject,
          grade: selection.grade,
          semester: selection.semester,
        });
        const response = await apiRequest<SetResponse>(`/kurikulum/set?${params.toString()}`);
        if (!cancelled) setSet(response.data);
      } catch (error) {
        if (!cancelled) setSetError(error instanceof Error ? error.message : "Daftar CP & ATP tidak dapat dimuat.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  if (loadError) {
    return (
      <div className="kurikulum-panel">
        <p className="kurikulum-error" role="alert">{loadError}</p>
      </div>
    );
  }
  if (!summaries || !selection) {
    return (
      <div className="kurikulum-panel">
        <p className="kurikulum-loading">Memuat daftar CP &amp; ATP…</p>
      </div>
    );
  }

  const activeSummary = summaries.find(
    (s) => s.subject === selection.subject && s.grade === selection.grade && s.semester === selection.semester,
  );
  const pick = (patch: Partial<KurikulumSelection>) => {
    setSelection((current) => clampSelection(summaries, { ...(current ?? selection), ...patch }));
  };

  return (
    <div className="kurikulum-panel">
      <div className="kurikulum-filters" role="group" aria-label="Pilih mata pelajaran, kelas, dan semester">
        <div className="kurikulum-filter-row">
          <span className="kurikulum-filter-label">Mapel</span>
          <div className="kurikulum-chips">
            {subjectsOf(summaries).map((subject) => (
              <button
                key={subject}
                type="button"
                className={`kurikulum-chip${selection.subject === subject ? " is-active" : ""}`}
                onClick={() => pick({ subject })}
                aria-pressed={selection.subject === subject}
              >
                {subject}
              </button>
            ))}
          </div>
        </div>
        <div className="kurikulum-filter-row">
          <span className="kurikulum-filter-label">Kelas</span>
          <div className="kurikulum-chips">
            {gradesOf(summaries, selection.subject).map((grade) => (
              <button
                key={grade}
                type="button"
                className={`kurikulum-chip${selection.grade === grade ? " is-active" : ""}`}
                onClick={() => pick({ grade })}
                aria-pressed={selection.grade === grade}
              >
                {grade}
              </button>
            ))}
          </div>
        </div>
        <div className="kurikulum-filter-row">
          <span className="kurikulum-filter-label">Semester</span>
          <div className="kurikulum-chips">
            {semestersOf(summaries, selection.subject, selection.grade).map((semester) => (
              <button
                key={semester}
                type="button"
                className={`kurikulum-chip${selection.semester === semester ? " is-active" : ""}`}
                onClick={() => pick({ semester })}
                aria-pressed={selection.semester === semester}
              >
                {semester}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeSummary ? (
        <p className="kurikulum-summary">
          {selection.subject} · {selection.grade} · Semester {selection.semester} · {activeSummary.phase} —{" "}
          <strong>{activeSummary.atpCount} ATP</strong> dalam {activeSummary.groupCount} kelompok · total{" "}
          <strong>{activeSummary.totalJp} JP</strong>
        </p>
      ) : null}

      {setError ? (
        <p className="kurikulum-error" role="alert">{setError}</p>
      ) : !set ? (
        <p className="kurikulum-loading">Memuat rincian…</p>
      ) : (
        <>
          <div className="kurikulum-tree">
            {planSections(set).map((section) => (
              <div key={section.group.code} className="kurikulum-group-wrap">
                {section.showCp && section.cp ? (
                  <div className="kurikulum-cp">
                    <p className="kurikulum-cp-head">
                      <span className="kurikulum-cp-code">CP {section.cp.code}</span>
                      <span className="kurikulum-cp-element">{section.cp.element}</span>
                    </p>
                    <p className="kurikulum-cp-text">{section.cp.text}</p>
                  </div>
                ) : null}
                <section className="kurikulum-group" aria-label={`${section.group.code} ${section.group.title}`}>
                  <header className="kurikulum-group-head">
                    <h3>
                      {section.group.code} — {section.group.title}
                    </h3>
                    <span className="kurikulum-group-meta">
                      {section.atpCount} ATP · {section.totalJp} JP
                    </span>
                  </header>
                  {section.group.material !== section.group.title ? (
                    <p className="kurikulum-group-material">Materi: {section.group.material}</p>
                  ) : null}
                  <ol className="kurikulum-atp-list">
                    {section.group.atps.map((atp) => (
                      <li key={atp.code} className="kurikulum-atp">
                        <span className="kurikulum-atp-code">ATP {atp.code}</span>
                        <span className="kurikulum-atp-text">{atp.text}</span>
                        {atp.capstone ? <span className="kurikulum-capstone">CP tercapai</span> : null}
                        <span className="kurikulum-atp-jp">{atp.jp} JP</span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            ))}
          </div>
          <p className="kurikulum-source">Sumber: {set.source}. Daftar ini bersifat referensi; penautan materi &amp; LKPD ke ATP menyusul pada tahap berikutnya.</p>
        </>
      )}
    </div>
  );
}
