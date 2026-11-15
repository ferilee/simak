// Hub Murid Tahap 2 di sisi web: tipe payload GET /murid/asesmen +
// label tampil bagian Asesmen & Progres beranda murid. Semua angka dan
// status dihitung server (API lib/ruas-hub.ts); lib ini hanya memberi
// nama pada keadaan agar komponen halaman tidak menebak sendiri.

export type AssessmentStatus = "not_started" | "in_progress" | "finished";

export type AssessmentCardData = {
  topic_id: number;
  subject_id: number | null;
  title: string;
  status: AssessmentStatus;
  score: number | null;
  finished_at: string | null;
  assignment_id: number;
  assignment_title: string;
};

export type ChainProgressData = {
  chain_key: string;
  subject: string;
  topic_group: string;
  assignment_count: number;
  materials_total: number;
  materials_completed: number;
  materials_pct: number;
  lkpd_total: number;
  lkpd_submitted: number;
  lkpd_graded: number;
  assessment: {
    topic_id: number;
    subject_id: number | null;
    title: string | null;
    status: AssessmentStatus | null;
    score: number | null;
  } | null;
};

export type HubData = {
  available: boolean;
  assessments: AssessmentCardData[];
  progress: ChainProgressData[];
};

/** Label status asesmen untuk kartu hub — satu-satunya pemetaan tampil. */
export function assessmentStatusLabel(status: AssessmentStatus): string {
  if (status === "finished") return "Selesai";
  if (status === "in_progress") return "Sedang dikerjakan";
  return "Belum dikerjakan";
}

/** Kelas lencana status kartu asesmen (bahasa visual ungu lembut beranda). */
export function assessmentStatusTone(status: AssessmentStatus): "done" | "doing" | "todo" {
  if (status === "finished") return "done";
  if (status === "in_progress") return "doing";
  return "todo";
}
