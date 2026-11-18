"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { avatarImagePath, type AvatarsResponse } from "../../../lib/avatar";
import { decideBaruMarkers, gradeScoreTone, readNilaiSayaBaseline, summarizeGrades, writeNilaiSayaBaseline, type GradeScoreTone } from "../../../lib/nilai-saya";
import { parseAtpCode } from "../../../lib/pemilih-cepat";
import { Toast } from "../../../components/Toast";
import { MuridBottomNav } from "../../../components/MuridBottomNav";

// Halaman "Nilai Saya" (v1.0.35; rombak tampilan v1.0.64): rangkuman
// nilai LKPD murid yang sudah terbit, satu kartu per penugasan, terbaru
// lebih dulu. Kata-kata skor meniru persis detail penugasan: individu
// "Nilai LKPD: X"; kelompok "Nilai kelompok: G" plus "Nilaimu
// (disesuaikan guru): X" bila ada penyesuaian untuk murid ini. Chip
// "Baru" menandai nilai yang terbit sesudah kunjungan terakhir ke
// halaman INI — keputusannya murni di klien (lib/nilai-saya.ts):
// baseline dibaca, chip diputuskan, lalu baseline dimajukan ke
// sekarang; chip tetap tampil sepanjang kunjungan ini.
//
// Rombak v1.0.64 murni soal kulit, mengikuti bahasa visual halaman
// tunggu penugasan (kartu ungu lembut, ilustrasi besar, judul ramah):
// kepala hero berisi avatar + ringkasan, angka nilai akhir besar
// berona menurut rentang, label ATP dari judul modul (parseAtpCode),
// dan gelembung komentar guru. Aturan data TIDAK berubah: baris yang
// tampil tetap yang diputuskan server, rata-rata dihitung dari baris
// yang sudah diterima (helper murni summarizeGrades).

type GradeRow = {
  assignment_id: number;
  assignment_title: string;
  worksheet_title: string;
  subject_name: string | null;
  work_mode: "individu" | "kelompok";
  group_name: string | null;
  score: number | null;
  group_score: number | null;
  score_adjusted: boolean;
  graded_at: string;
  module_title: string | null;
  teacher_comment: string | null;
};

type NilaiResponse = { ok: true; data: { grades: GradeRow[] } };

export default function NilaiSayaPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [baruIds, setBaruIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [avatarSlug, setAvatarSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Baseline dibaca SEBELUM data dimuat; baseline baru ditulis hanya
      // sesudah keputusan chip untuk kunjungan ini diambil.
      const baseline = readNilaiSayaBaseline();
      try {
        const response = await apiRequest<NilaiResponse>("/murid/nilai");
        if (cancelled) return;
        const decision = decideBaruMarkers(response.data.grades, baseline, new Date());
        setRows(response.data.grades);
        setBaruIds(decision.baruIds);
        writeNilaiSayaBaseline(decision.nextBaseline);
      } catch (error) {
        if (error instanceof Error && error.message === "Belum masuk.") {
          router.replace("/login");
          return;
        }
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Nilai belum dapat dimuat.");
      }
    })();
    // Avatar terpasang untuk kepala hero: gagal-aman — kegagalan atau
    // belum memasang avatar tidak menghalangi daftar nilai tampil.
    void (async () => {
      try {
        const response = await apiRequest<AvatarsResponse>("/murid/avatars");
        if (!cancelled) setAvatarSlug(response.data.equipped_slug);
      } catch {
        // Abaikan — hero tampil tanpa gambar avatar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!rows && !message) return <main style={styles.container}><p>Memuat nilai...</p></main>;

  const summary = rows ? summarizeGrades(rows) : { count: 0, average: null };

  return (
    <main className="murid-page-container" style={styles.container}>
      <Link href="/murid" style={styles.back}>← Ruang murid</Link>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      {rows && rows.length > 0 ? (
        <section style={styles.hero}>
          {avatarSlug ? (
            <img style={styles.heroAvatar} src={avatarImagePath(avatarSlug)} alt="Avatar saya" width={72} height={72} />
          ) : (
            <span style={styles.heroAvatarFallback} aria-hidden="true">🎓</span>
          )}
          <p style={styles.heroEyebrow}>SIMAK · NILAI SAYA</p>
          <h1 style={styles.heroTitle}>Nilai Saya</h1>
          <p style={styles.heroCopy}>Semua nilai LKPD-mu yang sudah dinilai guru, yang terbaru lebih dulu.</p>
          <p style={styles.heroSummary}>
            <strong>{summary.count} nilai</strong> sudah terbit
            {summary.average !== null ? <> · Rata-rata nilai akhir <strong>{summary.average}</strong></> : null}
          </p>
        </section>
      ) : null}

      {rows && rows.length === 0 ? (
        <section style={styles.emptyCard}>
          <NilaiIllustration />
          <p style={styles.heroEyebrow}>SIMAK · NILAI SAYA</p>
          <h1 style={styles.heroTitle}>Nilai Saya</h1>
          <p style={styles.emptyStatement}>Nilaimu akan tampil di sini</p>
          <p style={styles.emptyCopy}>Belum ada nilai yang terbit. Nilai LKPD-mu akan muncul di sini sesudah dinilai guru.</p>
          <Link href="/murid" style={styles.emptyPrimaryLink}>Kembali ke beranda</Link>
        </section>
      ) : null}

      <div style={styles.list}>
        {(rows ?? []).map((row) => {
          const atpCode = row.module_title ? parseAtpCode(row.module_title) : null;
          const tone = row.score !== null ? gradeScoreTone(row.score) : null;
          return (
            <article key={row.assignment_id} style={styles.card}>
              <div style={styles.cardMain}>
                <div style={styles.cardHeader}>
                  <Link href={`/murid/assignments/${row.assignment_id}`} style={styles.cardTitle}>{row.assignment_title}</Link>
                  {baruIds.has(row.assignment_id) ? <span style={styles.baruChip}>Baru</span> : null}
                  {atpCode ? <span style={styles.atpChip}>ATP {atpCode}</span> : null}
                </div>
                <p style={styles.muted}>
                  {row.worksheet_title}{row.subject_name ? ` · ${row.subject_name}` : ""}
                  {row.work_mode === "kelompok" && row.group_name ? ` · 👥 ${row.group_name}` : ""}
                </p>
                <p style={styles.meta}>Dinilai {formatDate(row.graded_at)}</p>
                {row.work_mode === "kelompok" && row.group_score !== null ? (
                  <>
                    <p style={styles.score}>Nilai kelompok: {row.group_score}</p>
                    {row.score_adjusted ? <p style={styles.score}>Nilaimu (disesuaikan guru): {row.score}</p> : null}
                  </>
                ) : (
                  <p style={styles.score}>Nilai LKPD: {row.score}</p>
                )}
                {row.teacher_comment ? (
                  <div style={styles.commentBubble}>
                    <p style={styles.commentLabel}>💬 Komentar guru</p>
                    <p style={styles.commentText}>{row.teacher_comment}</p>
                  </div>
                ) : null}
              </div>
              {tone !== null ? (
                <div style={{ ...styles.scoreBadge, ...scoreToneStyles[tone] }}>
                  <span style={styles.scoreBadgeValue}>{row.score}</span>
                  <span style={styles.scoreBadgeCaption}>Nilai akhir</span>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <MuridBottomNav active="nilai" />
    </main>
  );
}

function NilaiIllustration() {
  return (
    <svg viewBox="0 0 220 170" style={styles.emptyIllustration} role="img" aria-label="Ilustrasi lembar nilai dan medali">
      <rect x="42" y="22" width="104" height="126" rx="14" fill="#ffffff" stroke="#8b5cf6" strokeWidth="3" />
      <path d="M64 52 h60 M64 76 h60 M64 100 h38" stroke="#ddd6fe" strokeWidth="7" strokeLinecap="round" />
      <path d="M64 122 l10 10 l20 -22" fill="none" stroke="#0e9384" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="164" cy="112" r="34" fill="#f5f3ff" stroke="#8b5cf6" strokeWidth="3" />
      <path d="M164 92 l6.2 12.6 13.9 2 -10 9.8 2.4 13.7 -12.5 -6.6 -12.5 6.6 2.4 -13.7 -10 -9.8 13.9 -2 Z" fill="#f5a623" stroke="#b54708" strokeWidth="2" strokeLinejoin="round" />
      <path d="M150 84 l-8 -18 M178 84 l8 -18" stroke="#0e9384" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

// Perona angka nilai akhir besar: keluarga warna yang sama dengan chip
// "Baru" (kuning) dan keadaan sukses/kesalahan lembut di SIMAK.
const scoreToneStyles: Record<GradeScoreTone, { background: string; border: string; color: string }> = {
  hijau: { background: "#ecfdf3", border: "#abefc6", color: "#067647" },
  kuning: { background: "#fffaeb", border: "#fedf89", color: "#b54708" },
  merah: { background: "#fef3f2", border: "#fecdca", color: "#b42318" },
};

const styles = {
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none" },
  muted: { color: "#667085", lineHeight: 1.5, margin: 0 },
  list: { display: "grid", gap: 12, marginTop: 20 },
  // Kepala hero + keadaan kosong: bahasa visual halaman tunggu
  // penugasan (kartu ungu lembut #f5f3ff, tepi #ddd6fe, membulat 16,
  // isi terpusat).
  hero: { background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 16, padding: "24px 20px 26px", marginTop: 24, display: "grid", gap: 8, justifyItems: "center" as const, textAlign: "center" as const },
  heroAvatar: { width: 72, height: 72, borderRadius: "50%", border: "3px solid #ddd6fe", background: "#ffffff" },
  heroAvatarFallback: { width: 72, height: 72, borderRadius: "50%", border: "3px solid #ddd6fe", background: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 34 },
  heroEyebrow: { color: "#6941c6", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "6px 0 0" },
  heroTitle: { fontSize: 30, margin: 0, lineHeight: 1.25 },
  heroCopy: { color: "#667085", lineHeight: 1.6, margin: 0, maxWidth: 460 },
  heroSummary: { margin: "6px 0 0", fontSize: 16, color: "#344054" },
  emptyCard: { background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 16, padding: "28px 20px 30px", marginTop: 24, display: "grid", gap: 8, justifyItems: "center" as const, textAlign: "center" as const },
  emptyIllustration: { width: 200, maxWidth: "62vw", height: "auto" },
  emptyStatement: { fontSize: 18, fontWeight: 700, margin: "8px 0 0" },
  emptyCopy: { color: "#667085", lineHeight: 1.6, margin: 0, maxWidth: 460 },
  emptyPrimaryLink: { borderRadius: 8, background: "#175cd3", color: "white", padding: "12px 16px", minHeight: 44, fontWeight: 700, textDecoration: "none", marginTop: 12, display: "inline-flex", alignItems: "center" },
  card: { background: "#ffffff", border: "1px solid #eaecf0", borderRadius: 16, padding: 18, display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const },
  cardMain: { display: "grid", gap: 8, flex: "1 1 240px", minWidth: 0 },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  cardTitle: { color: "#175cd3", fontWeight: 700, textDecoration: "none", fontSize: 17 },
  baruChip: { background: "#fef0c7", color: "#93370d", border: "1px solid #fedf89", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 700 },
  atpChip: { background: "#f5f3ff", color: "#6941c6", border: "1px solid #ddd6fe", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 700 },
  meta: { color: "#475467", fontSize: 14, margin: 0 },
  score: { margin: 0, fontWeight: 700 },
  commentBubble: { background: "#f9fafb", border: "1px solid #eaecf0", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 4 },
  commentLabel: { margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#475467" },
  commentText: { margin: 0, lineHeight: 1.6, color: "#344054" },
  scoreBadge: { border: "1px solid", borderRadius: 14, padding: "10px 14px", display: "grid", justifyItems: "center" as const, gap: 2, minWidth: 92 },
  scoreBadgeValue: { fontSize: 30, fontWeight: 800, lineHeight: 1.1 },
  scoreBadgeCaption: { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" },
};
