"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ConfirmOptions = {
  confirmLabel: string;
  cancelLabel?: string;
};

type ConfirmRequest = ConfirmOptions & {
  message: string;
  cancelLabel: string;
  resolve: (value: boolean) => void;
};

type ConfirmFunction = (message: string, options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

// Dialog konfirmasi bersama pengganti dialog bawaan peramban: tampilannya mengikuti
// modal yang sudah ada di aplikasi (lapisan rgba(16, 24, 40, 0.55), panel
// putih membulat, tombol global .button/.button-secondary) lewat class
// .confirm-* di globals.css. Satu dialog tampil pada satu waktu; permintaan
// yang datang saat dialog terbuka masuk antrean FIFO dan dibuka berurutan
// sesudah dialog sebelumnya selesai.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ConfirmRequest | null>(null);
  const currentRef = useRef<ConfirmRequest | null>(null);
  const queueRef = useRef<ConfirmRequest[]>([]);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const openNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const confirm = useCallback<ConfirmFunction>((message, options) => {
    return new Promise<boolean>((resolve) => {
      const request: ConfirmRequest = {
        message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel ?? "Batal",
        resolve,
      };
      if (currentRef.current) {
        queueRef.current.push(request);
      } else {
        currentRef.current = request;
        setCurrent(request);
      }
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      const request = currentRef.current;
      if (!request) return;
      request.resolve(value);
      openNext();
    },
    [openNext],
  );

  // Selama dialog terbuka: Esc berarti batal, gulir badan dikunci, fokus
  // awal pada tombol konfirmasi dan dikembalikan ke elemen pemicu sesudah
  // dialog tertutup (cleanup berjalan untuk tiap pergantian dialog).
  useEffect(() => {
    if (!current) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [current, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current ? (
        <div className="confirm-overlay" onClick={() => settle(false)}>
          <div
            className="confirm-panel"
            role="alertdialog"
            aria-modal="true"
            aria-label="Konfirmasi"
            aria-describedby="confirm-dialog-message"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="confirm-message" id="confirm-dialog-message">{current.message}</p>
            <div className="confirm-actions">
              <button type="button" className="button button-secondary" onClick={() => settle(false)}>
                {current.cancelLabel}
              </button>
              <button type="button" className="button" ref={confirmButtonRef} onClick={() => settle(true)}>
                {current.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFunction {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm harus dipakai di dalam ConfirmProvider.");
  return confirm;
}
