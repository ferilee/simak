"use client";

import { useEffect } from "react";

type ToastTone = "success" | "info" | "warning" | "error";

type ToastProps = {
  message: string;
  onDismiss: () => void;
  tone?: ToastTone;
};

export function Toast({ message, onDismiss, tone = getToastTone(message) }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className={`toast toast-${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      <span className="toast-icon" aria-hidden="true">{tone === "success" ? "✓" : tone === "warning" ? "!" : tone === "error" ? "×" : "i"}</span>
      <p>{message}</p>
      <button type="button" onClick={onDismiss} aria-label="Tutup notifikasi">×</button>
    </div>
  );
}

export function getToastTone(message: string): ToastTone {
  const normalized = message.toLowerCase();
  if (/berhasil|tersimpan|dibuat|ditambahkan|selesai|disimpan|terbitkan/.test(normalized)) return "success";
  if (/pilih|isi .*valid|duplikat|tidak ditemukan|harus|tidak boleh/.test(normalized)) return "warning";
  if (/gagal|belum dapat|tidak dapat|permintaan tidak|akses ditolak|error/.test(normalized)) return "error";
  return "info";
}
