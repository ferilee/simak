"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api";

// Indikator kemajuan membaca pada halaman materi: lingkaran persen yang
// mengikuti guliran dokumen, berubah menjadi centang hijau saat murid
// mencapai akhir materi, dan mencatat ketuntasan itu satu kali ke log
// aktivitas (peristiwa "baca_materi_tuntas").
const RING_SIZE = 58;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const COMPLETE_THRESHOLD = 99.5;

function computeScrollProgress(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
}

export function ReadingProgress({ moduleId, alreadyCompleted }: { moduleId: number; alreadyCompleted: boolean }) {
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const postedRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setProgress(computeScrollProgress());
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
    };
  }, []);

  // Tuntas bersifat lengket: sekali tercapai, menggulir naik tidak
  // mengembalikan indikator ke persen.
  useEffect(() => {
    if (progress >= COMPLETE_THRESHOLD) setCompleted(true);
  }, [progress]);

  // Catat ketuntasan tepat satu kali per tampilan, hanya bila API belum
  // menyatakan tuntas. Kegagalan ditelan diam-diam: membaca tidak boleh
  // terganggu oleh pencatatan.
  useEffect(() => {
    if (!completed || alreadyCompleted || postedRef.current) return;
    postedRef.current = true;
    void apiRequest("/activity", {
      method: "POST",
      body: JSON.stringify({ event: "baca_materi_tuntas", moduleId }),
    }).catch(() => {});
  }, [completed, alreadyCompleted, moduleId]);

  const displayPercent = completed ? 100 : Math.min(99, Math.round(progress));
  const ringPercent = completed ? 100 : progress;

  return (
    <div
      className={`reading-progress${completed ? " is-complete" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={displayPercent}
      aria-label={completed ? "Materi selesai dibaca" : "Kemajuan membaca materi"}
    >
      <svg className="reading-progress-ring" width={RING_SIZE} height={RING_SIZE} aria-hidden="true">
        <circle
          className="reading-progress-track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
        />
        <circle
          className="reading-progress-arc"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringPercent / 100)}
        />
      </svg>
      <span className="reading-progress-disc" aria-hidden="true">
        {completed ? (
          <svg className="reading-progress-check" viewBox="0 0 24 24" width="22" height="22">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={20} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          `${displayPercent}%`
        )}
      </span>
    </div>
  );
}
