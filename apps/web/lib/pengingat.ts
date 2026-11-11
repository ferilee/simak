// Perencana murni pengingat tugas murid: checklist langkah per
// penugasan di kartu beranda + tingkat kegentingan tenggatnya, dan
// syarat tampil banner materi di halaman LKPD. Semua keputusan di sini
// dapat diuji tanpa peramban; halaman hanya menggambar hasilnya.
//
// Tiga langkah belajar yang dikenal SIMAK, urutannya tetap:
//   materi     — membaca materi penugasan sampai tuntas (bukti:
//                catatan baca_materi_tuntas di server; bernilai +10 XP)
//   lkpd       — mengumpulkan LKPD (bukti: status attempt efektif)
//   exit_ticket— mengisi exit ticket (bukti: baris exit_tickets)
// Langkah hanya berlaku bila penugasannya memang punya unsur itu:
// tanpa modul tidak ada langkah materi, tanpa LKPD tidak ada langkah
// LKPD. Exit ticket selalu berlaku — halaman detail penugasan selalu
// menggambar langkah exit ticket untuk penugasan terbit (tidak ada
// penanda konfigurasi di penugasan), jadi pemanggil meneruskan
// hasExitTicket: true untuk semua penugasan pada daftar beranda.

export type StepKey = "materi" | "lkpd" | "exit_ticket";

export type AssignmentStep = {
  key: StepKey;
  label: string;
  done: boolean;
  /** Petunjuk tambahan yang hanya tampil selama langkah belum selesai. */
  hint?: string;
};

/** Status LKPD yang dikenal checklist: "belum" juga menampung penugasan
 *  yang belum dibuka dan progres kartu "terlambat" (lihat
 *  worksheetStatusFromProgress). */
export type WorksheetStepStatus = "belum" | "draf" | "terkumpul" | "dinilai";

export type PlanAssignmentStepsInput = {
  hasModule: boolean;
  materialCompleted: boolean;
  hasWorksheet: boolean;
  worksheetStatus?: WorksheetStepStatus | null;
  hasExitTicket: boolean;
  exitTicketSubmitted: boolean;
};

const STEP_LABELS: Record<StepKey, string> = {
  materi: "Baca materi sampai tuntas",
  lkpd: "Kerjakan LKPD",
  exit_ticket: "Isi exit ticket",
};

// Bentuk pendek untuk pita pengingat tenggat — kalimat yang menyebut
// persis apa yang belum dilakukan murid.
const MISSING_LABELS: Record<StepKey, string> = {
  materi: "materi belum dituntaskan",
  lkpd: "LKPD belum dikumpulkan",
  exit_ticket: "exit ticket belum diisi",
};

export function planAssignmentSteps(input: PlanAssignmentStepsInput): AssignmentStep[] {
  const steps: AssignmentStep[] = [];
  if (input.hasModule) {
    steps.push({
      key: "materi",
      label: STEP_LABELS.materi,
      done: input.materialCompleted,
      // Iming-iming XP hanya selama belum tuntas — sesudah tuntas
      // petunjuk hilang bersama centangnya.
      ...(input.materialCompleted ? {} : { hint: "+10 XP" }),
    });
  }
  if (input.hasWorksheet) {
    steps.push({
      key: "lkpd",
      label: STEP_LABELS.lkpd,
      done: input.worksheetStatus === "terkumpul" || input.worksheetStatus === "dinilai",
    });
  }
  if (input.hasExitTicket) {
    steps.push({
      key: "exit_ticket",
      label: STEP_LABELS.exit_ticket,
      done: input.exitTicketSubmitted,
    });
  }
  return steps;
}

/** Pemetaan progres kartu beranda → status LKPD checklist. Progres
 *  "terlambat" pada payload kartu adalah campuran dua keadaan (attempt
 *  terkumpul melewati tenggat ATAU belum mengumpulkan sama sekali) dan
 *  payload tidak membedakannya; pengingat memilih sisi mengingatkan
 *  ("belum"), sejalan dengan baris status kartu yang tetap membaca
 *  "Terlambat dikumpulkan". */
export function worksheetStatusFromProgress(progress: string | null | undefined): WorksheetStepStatus {
  switch (progress) {
    case "terkumpul":
      return "terkumpul";
    case "dinilai":
      return "dinilai";
    case "draf":
      return "draf";
    default:
      return "belum";
  }
}

/** Label pendek langkah-langkah yang berlaku dan belum selesai, urut
 *  mengikuti urutan langkah. */
export function missingStepLabels(steps: readonly AssignmentStep[]): string[] {
  return steps.filter((step) => !step.done).map((step) => MISSING_LABELS[step.key]);
}

/** Semua langkah yang berlaku sudah selesai (daftar kosong TIDAK
 *  dihitung selesai — tidak ada yang bisa dinyatakan tuntas). */
export function allStepsDone(steps: readonly AssignmentStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.done);
}

export type ReminderLevel = "none" | "segera" | "mendesak";

export type ReminderPlan = {
  level: ReminderLevel;
  /** Label pendek yang belum selesai — kosong bila semua selesai. */
  missingLabels: string[];
  /** Tenggat sudah terlewat (masih ada yang kurang). */
  overdue: boolean;
};

const HOUR_MS = 60 * 60 * 1000;

/** Tingkat pengingat tenggat dari langkah yang belum selesai:
 *  - tidak ada yang kurang, atau penugasan tanpa tenggat → "none"
 *  - tenggat terlewat atau ≤ 24 jam lagi → "mendesak"
 *  - ≤ 72 jam lagi → "segera"
 *  - selain itu → "none" (pita tidak tampil, checklist tetap tampil) */
export function planReminderLevel(input: {
  dueAt: Date | string | null;
  steps: readonly AssignmentStep[];
  now: Date;
}): ReminderPlan {
  const missingLabels = missingStepLabels(input.steps);
  if (missingLabels.length === 0 || input.dueAt === null) {
    return { level: "none", missingLabels, overdue: false };
  }
  const dueMs = (input.dueAt instanceof Date ? input.dueAt : new Date(input.dueAt)).getTime();
  if (Number.isNaN(dueMs)) return { level: "none", missingLabels, overdue: false };
  const msLeft = dueMs - input.now.getTime();
  if (msLeft <= 0) return { level: "mendesak", missingLabels, overdue: true };
  if (msLeft <= 24 * HOUR_MS) return { level: "mendesak", missingLabels, overdue: false };
  if (msLeft <= 72 * HOUR_MS) return { level: "segera", missingLabels, overdue: false };
  return { level: "none", missingLabels, overdue: false };
}

/** Syarat tampil banner materi di halaman LKPD: konteks materi ada,
 *  membaca belum tuntas, dan attempt masih draf (belum terkumpul).
 *  Banner tidak pernah menghalangi pengerjaan — ia hanya pengingat. */
export function materialBannerVisible(
  material: { module_id: number; completed: boolean } | null | undefined,
  attemptStatus: string | null | undefined,
): boolean {
  return material != null && !material.completed && attemptStatus === "draf";
}
