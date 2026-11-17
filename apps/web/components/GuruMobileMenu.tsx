"use client";

import { useEffect, useState } from "react";
import { journalFabBadgeLabel } from "../lib/jurnal";

// Menu mobile guru (calon v1.0.73): pada viewport ≤760px bilah
// bawah cangkang guru hanya berisi lima langkah alur kerja, jadi
// tiga area sekunder — Perpustakaan Bersama, CP & ATP, Jurnal
// Belajar — pindah ke tombol mengambang (FAB) berikon grid yang
// membuka bottom sheet. Ikonnya grid, BUKAN "+", karena "+" berarti
// buat baru. FAB dan sheet hanya tampil di mobile (gerbangnya di
// globals.css); di desktop keduanya display:none dan bilah samping
// tetap rumah ketiga area itu.
//
// Lencana pada FAB menampilkan jumlah entri jurnal belum ditinjau
// (unreviewed_total ringkasan jurnal guru, diambil halaman guru)
// agar Jurnal Belajar tidak terlupakan walau pintunya berpindah;
// tanpa hitungan (belum termuat/gagal/nol) lencana tidak tampil
// dan tidak pernah menghalangi navigasi.
//
// Sheet mengikuti pola Modal bersama: klik latar menutup, Esc
// menutup, ada tombol tutup, dan gulir badan dikunci selama
// terbuka. Memilih satu tujuan menutup sheet lalu memanggil
// pembuka tampilan yang sama persis dengan tombol bilah samping.
export function GuruMobileMenu({
  activeView,
  unreviewedTotal,
  onOpenLibrary,
  onOpenCurriculum,
  onOpenJournal,
}: {
  activeView: "langkah" | "perpustakaan" | "kurikulum" | "jurnal";
  unreviewedTotal: number | null;
  onOpenLibrary: () => void;
  onOpenCurriculum: () => void;
  onOpenJournal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const badgeLabel = journalFabBadgeLabel(unreviewedTotal);
  const fabLabel = badgeLabel === null
    ? "Menu lainnya"
    : `Menu lainnya, ${badgeLabel === "99+" ? "lebih dari 99" : badgeLabel} entri jurnal belum ditinjau`;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open ]);

  function choose(opener: () => void) {
    setOpen(false);
    opener();
  }

  return (
    <>
      <button
        type="button"
        className="guru-mobile-fab"
        aria-label={fabLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>
        {badgeLabel ? <span className="guru-mobile-fab-badge" aria-hidden="true">{badgeLabel}</span> : null}
      </button>
      {open ? (
        <div className="guru-mobile-sheet-overlay" onClick={() => setOpen(false)}>
          <div
            className="guru-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu lainnya"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="guru-mobile-sheet-header">
              <h2 className="guru-mobile-sheet-title">Menu lainnya</h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Tutup menu">
                ×
              </button>
            </div>
            <button
              type="button"
              className={`wizard-library-link${activeView === "perpustakaan" ? " is-active" : ""}`}
              onClick={() => choose(onOpenLibrary)}
              aria-current={activeView === "perpustakaan" ? "page" : undefined}
            >
              <span className="wizard-library-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
              </span>
              <span>
                <strong>Perpustakaan Bersama</strong>
                <small>Materi &amp; LKPD dari guru lain</small>
              </span>
            </button>
            <button
              type="button"
              className={`wizard-library-link${activeView === "kurikulum" ? " is-active" : ""}`}
              onClick={() => choose(onOpenCurriculum)}
              aria-current={activeView === "kurikulum" ? "page" : undefined}
            >
              <span className="wizard-library-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3.5 6h.01" /><path d="M3.5 12h.01" /><path d="M3.5 18h.01" /></svg>
              </span>
              <span>
                <strong>CP &amp; ATP</strong>
                <small>Capaian &amp; alur tujuan pembelajaran</small>
              </span>
            </button>
            <button
              type="button"
              className={`wizard-library-link${activeView === "jurnal" ? " is-active" : ""}`}
              onClick={() => choose(onOpenJournal)}
              aria-current={activeView === "jurnal" ? "page" : undefined}
            >
              <span className="wizard-library-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
              </span>
              <span>
                <strong>Jurnal Belajar</strong>
                <small>Refleksi harian murid (baca saja)</small>
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
