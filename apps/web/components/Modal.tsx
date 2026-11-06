"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Modal bersama ruang guru (Tahap 1): satu rangka lapisan untuk formulir
// edit yang terbatas — edit penugasan dan metadata materi/LKPD. Gaya
// mengikuti keluarga dialog yang sudah ada (kelas .modal-* di
// globals.css, meniru .confirm-*): latar rgba(16, 24, 40, 0.55), panel
// putih membulat, badan bisa digulir.
//
// Urutan lapisan (z-index di globals.css): halaman < modal edit (45) <
// dialog konfirmasi (50) < toast (100). Konfirmasi yang dipicu dari
// dalam modal — termasuk penjaga tutup formulir kotor — harus menumpuk
// DI ATAS modal, dan toast tidak berubah dari perilaku lamanya.
//
// Penjaga tutup (konfirmasi buang perubahan) hidup di pemakai lewat
// prop onClose: ✕, klik latar, dan Esc semuanya memanggil onClose yang
// sama, dan pemakai memutuskan apakah tutup langsung atau bertanya dulu
// (lihat closeDecision di lib/modal.ts). Modal sendiri hanya tahu cara
// tampil dan cara meminta ditutup.
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Pendengar Esc dipasang sekali selama modal terbuka; ia selalu
  // memanggil onClose terakhir dari pemakai, bukan tangkapan pertama.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open ]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup dialog">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
