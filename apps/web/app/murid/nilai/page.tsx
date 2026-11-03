"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { decideBaruMarkers, readNilaiSayaBaseline, writeNilaiSayaBaseline } from "../../../lib/nilai-saya";
import { Toast } from "../../../components/Toast";

// Halaman "Nilai Saya" (v1.0.35): rangkuman nilai LKPD murid yang sudah
// terbit, satu kartu per penugasan, terbaru lebih dulu. Kata-kata skor
// meniru persis detail penugasan: individu "Nilai LKPD: X"; kelompok
// "Nilai kelompok: G" plus "Nilaimu (disesuaikan guru): X" bila ada
// penyesuaian untuk murid ini. Chip "Baru" menandai nilai yang terbit
// sesudah kunjungan terakhir ke halaman INI — keputusannya murni di klien
// (lib/nilai-saya.ts): baseline dibaca, chip diputuskan, lalu baseline
// dimajukan ke sekarang; chip tetap tampil sepanjang kunjungan ini.

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
};

type NilaiResponse = { ok: true; data: { grades: GradeRow[] } };

export default function NilaiSayaPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [baruIds, setBaruIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");

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
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!rows && !message) return <main style={styles.container}><p>Memuat nilai...</p></main>;

  return (
    <main style={styles.container}>
      <Link href="/murid" style={styles.back}>← Ruang murid</Link>
      <p style={styles.eyebrow}>SIMAK · NILAI SAYA</p>
      <h1 style={styles.title}>Nilai Saya</h1>
      <p style={styles.muted}>Semua nilai LKPD-mu yang sudah dinilai guru, yang terbaru lebih dulu.</p>
      {message ? <Toast message={message} onDismiss={() => setMessage("")} /> : null}

      {rows && rows.length === 0 ? (
        <div style={styles.panel}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>Belum ada nilai yang terbit. Nilai LKPD-mu akan muncul di sini sesudah dinilai guru.</p>
        </div>
      ) : null}

      <div style={styles.list}>
        {(rows ?? []).map((row) => (
          <article key={row.assignment_id} style={styles.panel}>
            <div style={styles.cardHeader}>
              <Link href={`/murid/assignments/${row.assignment_id}`} style={styles.cardTitle}>{row.assignment_title}</Link>
              {baruIds.has(row.assignment_id) ? <span style={styles.baruChip}>Baru</span> : null}
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
          </article>
        ))}
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const styles = {
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" },
  back: { color: "#175cd3", textDecoration: "none" },
  eyebrow: { color: "#475467", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", margin: "32px 0 8px" },
  title: { fontSize: 34, margin: 0 },
  muted: { color: "#667085", lineHeight: 1.5, margin: 0 },
  list: { display: "grid", gap: 12, marginTop: 20 },
  panel: { border: "1px solid #eaecf0", borderRadius: 12, padding: 18, display: "grid", gap: 8 },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  cardTitle: { color: "#175cd3", fontWeight: 700, textDecoration: "none", fontSize: 17 },
  baruChip: { background: "#fef0c7", color: "#93370d", border: "1px solid #fedf89", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 700 },
  meta: { color: "#475467", fontSize: 14, margin: 0 },
  score: { margin: 0, fontWeight: 700 },
};
