"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import {
  clearStoredActiveSeconds,
  createActiveTimeTracker,
  formatReadingDuration,
  readStoredActiveSeconds,
  readingTimeStorageKey,
  storeActiveSeconds,
  type ActiveTimeTracker,
  type KeyValueStorage,
} from "../lib/baca-wajar";

// Indikator kemajuan membaca pada halaman materi: lingkaran persen yang
// mengikuti guliran dokumen, berubah menjadi centang hijau saat ketuntasan
// tercatat di server, dan mencatat ketuntasan itu ke log aktivitas
// (peristiwa "baca_materi_tuntas").
//
// Gerbang keplausiban (Deteksi Baca Terlalu Cepat): mencapai akhir saja
// tidak cukup — waktu membaca AKTIF (tab terlihat) harus masuk akal
// untuk panjang materi, diputuskan server dari activeSeconds yang
// dikirim bersama posting. Di bawah ambang server menjawab
// completed:false dan komponen menampilkan pemberitahuan lembut;
// ketuntasan lalu dicatat OTOMATIS lewat posting ulang berkala begitu
// waktu aktif mencapai ambang, selama murid sudah pernah mencapai
// akhir. Waktu aktif terakumulasi antar-kunjungan per (murid, modul)
// di localStorage perangkat — perangkat dipakai bergantian, jadi
// kuncinya wajib memuat id murid; tanpa id, sesi berjalan tanpa
// persistensi.
const RING_SIZE = 58;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const COMPLETE_THRESHOLD = 99.5;
const RECHECK_INTERVAL_MS = 5000;

type ActivityPostResponse = {
  ok: true;
  completed?: boolean;
  min_seconds?: number;
  active_seconds?: number | null;
  remaining_seconds?: number;
};

function computeScrollProgress(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
}

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function ReadingProgress({
  moduleId,
  alreadyCompleted,
  minSeconds = null,
  studentId = null,
}: {
  moduleId: number;
  alreadyCompleted: boolean;
  minSeconds?: number | null;
  studentId?: number | null;
}) {
  const [progress, setProgress] = useState(0);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [serverCompleted, setServerCompleted] = useState(alreadyCompleted);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [tooFastMinSeconds, setTooFastMinSeconds] = useState<number | null>(null);
  const trackerRef = useRef<ActiveTimeTracker | null>(null);
  const storageKeyRef = useRef<string | null>(null);
  const initialLoadedRef = useRef(false);
  const postingRef = useRef(false);
  const serverMinSecondsRef = useRef<number | null>(null);

  if (trackerRef.current === null) {
    trackerRef.current = createActiveTimeTracker(() => Date.now());
  }

  // Guliran: persen indikator + penanda pernah mencapai akhir (lengket).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const current = computeScrollProgress();
      setProgress(current);
      if (current >= COMPLETE_THRESHOLD) setReachedBottom(true);
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

  // Waktu aktif: tick tiap detik, hanya bertambah saat tab terlihat;
  // perubahan visibilitas di-tick segera agar segmennya akurat.
  useEffect(() => {
    const tracker = trackerRef.current!;
    const sync = () => {
      const total = tracker.tick(document.visibilityState === "visible");
      setActiveSeconds(total);
      const storage = browserStorage();
      if (storage && storageKeyRef.current && !serverCompleted) {
        storeActiveSeconds(storage, storageKeyRef.current, total);
      }
    };
    sync();
    const timer = window.setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [serverCompleted]);

  // Muat akumulasi tersimpan begitu id murid diketahui (sekali saja).
  useEffect(() => {
    if (alreadyCompleted || initialLoadedRef.current) return;
    if (studentId === null || studentId <= 0) return;
    initialLoadedRef.current = true;
    const key = readingTimeStorageKey(studentId, moduleId);
    storageKeyRef.current = key;
    const storage = browserStorage();
    if (!storage) return;
    const stored = readStoredActiveSeconds(storage, key);
    if (stored > 0) {
      trackerRef.current!.setInitial(stored);
      setActiveSeconds(trackerRef.current!.totalSeconds());
    }
  }, [studentId, moduleId, alreadyCompleted]);

  // Satu percobaan pencatatan. Kegagalan ditelan diam-diam: membaca
  // tidak boleh terganggu oleh pencatatan; pemeriksaan berkala akan
  // mencoba lagi sesudah ambang waktu tercapai.
  const attemptPostRef = useRef<() => Promise<void>>(async () => {});
  attemptPostRef.current = async () => {
    if (postingRef.current || serverCompleted || alreadyCompleted) return;
    postingRef.current = true;
    try {
      const tracker = trackerRef.current!;
      const currentActive = tracker.tick(document.visibilityState === "visible");
      setActiveSeconds(currentActive);
      const response = await apiRequest<ActivityPostResponse>("/activity", {
        method: "POST",
        body: JSON.stringify({ event: "baca_materi_tuntas", moduleId, activeSeconds: currentActive }),
      });
      // Respons lama tanpa field completed (API sebelum gerbang ini)
      // diperlakukan sebagai tuntas — perilaku pencatatan sebelumnya.
      if (response.completed !== false) {
        setServerCompleted(true);
        setTooFastMinSeconds(null);
        const storage = browserStorage();
        if (storage && storageKeyRef.current) {
          clearStoredActiveSeconds(storage, storageKeyRef.current);
        }
      } else {
        if (typeof response.min_seconds === "number") {
          serverMinSecondsRef.current = response.min_seconds;
          setTooFastMinSeconds(response.min_seconds);
        }
      }
    } catch {
      // Abaikan — dicoba lagi oleh pemeriksaan berkala.
    } finally {
      postingRef.current = false;
    }
  };

  // Posting pertama: tepat saat akhir materi pertama kali tercapai.
  const firstPostDoneRef = useRef(false);
  useEffect(() => {
    if (!reachedBottom || serverCompleted || alreadyCompleted || firstPostDoneRef.current) return;
    firstPostDoneRef.current = true;
    void attemptPostRef.current();
  }, [reachedBottom, serverCompleted, alreadyCompleted]);

  // Pemeriksaan berkala: sesudah pernah mencapai akhir, posting ulang
  // begitu waktu aktif mencapai ambang (dari payload modul atau dari
  // respons server terakhir — respons yang menang).
  useEffect(() => {
    if (!reachedBottom || serverCompleted || alreadyCompleted) return;
    const timer = window.setInterval(() => {
      const target = serverMinSecondsRef.current ?? minSeconds;
      if (target === null || target === undefined) return;
      if (trackerRef.current!.totalSeconds() >= target) {
        void attemptPostRef.current();
      }
    }, RECHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reachedBottom, serverCompleted, alreadyCompleted, minSeconds]);

  const completed = serverCompleted;
  const displayPercent = completed || reachedBottom ? 100 : Math.min(99, Math.round(progress));
  const ringPercent = completed || reachedBottom ? 100 : progress;
  const effectiveMinSeconds = tooFastMinSeconds ?? serverMinSecondsRef.current ?? minSeconds;
  const remainingSeconds = effectiveMinSeconds !== null && effectiveMinSeconds !== undefined
    ? Math.max(0, effectiveMinSeconds - activeSeconds)
    : 0;
  const showTooFastNotice = !completed && tooFastMinSeconds !== null;
  const showTarget = !completed && !showTooFastNotice && minSeconds !== null && minSeconds !== undefined;

  return (
    <>
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
      {showTooFastNotice ? (
        <p className="reading-progress-notice" role="status">
          📖 Kamu sampai di akhir terlalu cepat untuk benar-benar terbaca. Lanjutkan membaca pelan-pelan — ketuntasan tercatat otomatis dalam {formatReadingDuration(remainingSeconds)}.
        </p>
      ) : showTarget ? (
        <p className="reading-progress-target">Target membaca materi ini {formatReadingDuration(minSeconds)}</p>
      ) : null}
    </>
  );
}
