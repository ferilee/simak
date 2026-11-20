"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { avatarImagePath } from "../lib/avatar";
import { levelProgress, type XpSummary } from "../lib/xp";
import { Modal } from "./Modal";

// Panel perayaan perolehan XP (Fitur Kilau Murid 2, adaptasi momen
// "Correct! +50" MathZen): muncul tepat pada dua momen perolehan —
// LKPD berhasil terkumpul dan materi ditandai tuntas — menggantikan
// toast "+N XP" yang lama. Rangkanya Modal bersama; isinya avatar
// murid besar, angka "+N XP" mencolok, batang progres ke level
// berikut, dan varian "Naik Level!" bila perolehan ini melintasi
// ambang. Satu tombol "Lanjut belajar"; panel tidak mengunci alur
// (Esc/latar/× dari Modal juga menutupnya) dan pemanggil yang
// menampilkannya tepat sekali per peristiwa.
//
// Angka sesudah perolehan (total + avatar) dibaca dari payload
// kanonis GET /murid/today sesudah kejadian tercatat — kegagalan
// membacanya tidak membatalkan perayaan: panel tetap tampil dengan
// angka perolehan dan judul momennya, tanpa batang progres.
type TodayXpResponse = {
  ok: true;
  data: { xp: XpSummary | null; avatar_slug: string | null };
};

export function XpCelebration({
  points,
  headline,
  onClose,
}: {
  points: number;
  headline: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<XpSummary | null>(null);
  const [avatarSlug, setAvatarSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<TodayXpResponse>("/murid/today")
      .then((response) => {
        if (cancelled) return;
        setSummary(response.data.xp);
        setAvatarSlug(response.data.avatar_slug);
      })
      .catch(() => {
        // Abaikan — perayaan tetap tampil tanpa batang progres.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const after = summary ? levelProgress(summary.total) : null;
  const before = summary ? levelProgress(Math.max(0, summary.total - points)) : null;
  const leveledUp = Boolean(after && before && after.levelIndex > before.levelIndex);

  return (
    <Modal
      open
      title={leveledUp ? "Naik Level! 🎉" : "XP Bertambah ⭐"}
      onClose={onClose}
      footer={
        <button type="button" className="button xp-celebration-button" onClick={onClose}>
          Lanjut belajar
        </button>
      }
    >
      <div className="xp-celebration">
        {avatarSlug ? (
          <img
            className="xp-celebration-avatar"
            src={avatarImagePath(avatarSlug)}
            alt="Avatar saya"
            width={84}
            height={84}
          />
        ) : (
          <span className="xp-celebration-star" aria-hidden="true">⭐</span>
        )}
        <strong className="xp-celebration-points">+{points} XP</strong>
        <p className="xp-celebration-headline">{headline}</p>
        {leveledUp && after ? (
          <p className="xp-celebration-levelup">Kamu naik ke level {after.levelName}!</p>
        ) : null}
        {after ? (
          <div className="xp-celebration-progress">
            <span className="xp-celebration-level">Level {after.levelName} · {after.total} XP</span>
            {after.isTopLevel ? (
              <span className="xp-celebration-note">🏆 {after.label}</span>
            ) : (
              <>
                <div
                  className="xp-progress-track"
                  role="progressbar"
                  aria-valuenow={Math.round(after.fraction * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Kemajuan menuju level ${after.nextLevelName}: ${Math.round(after.fraction * 100)}%`}
                >
                  <div className="xp-progress-fill" style={{ width: `${after.fraction * 100}%` }} />
                </div>
                <span className="xp-celebration-note">{after.label}</span>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
