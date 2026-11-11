// Tests for pengingat tugas murid (sisi web): perencana langkah
// checklist kartu penugasan, tingkat pengingat tenggat, syarat banner
// materi LKPD, dan wiring render di beranda murid + halaman LKPD.
// Run with bun from apps/web:  bun lib/pengingat.test.mjs
//
// Yang dikunci di sini:
//  - planAssignmentSteps: langkah yang berlaku saja (tanpa modul →
//    tanpa langkah materi; tanpa LKPD → tanpa langkah LKPD), urutan
//    materi → LKPD → exit ticket, label persis, hint "+10 XP" hanya
//    pada materi yang belum tuntas, LKPD selesai hanya pada status
//    terkumpul/dinilai.
//  - worksheetStatusFromProgress: pemetaan progres kartu, termasuk
//    "terlambat" → "belum" (payload tidak membedakan terkumpul
//    terlambat vs belum mengumpulkan; pengingat memilih mengingatkan).
//  - planReminderLevel: none/segera (≤72 jam)/mendesak (≤24 jam atau
//    lewat), missingLabels bentuk pendek yang tepat, tanpa tenggat →
//    none, semua selesai → none walau tenggat lewat.
//  - materialBannerVisible: tampil hanya bila konteks materi ada,
//    belum tuntas, dan attempt masih draf.
//  - Wiring: kartu beranda menggambar checklist + pita + aksen
//    mendesak dari field payload baru; banner LKPD tertaut ke modul
//    konteks dan penutupannya lokal sesi halaman saja.
import { readFileSync } from "node:fs";
import {
  allStepsDone,
  materialBannerVisible,
  missingStepLabels,
  planAssignmentSteps,
  planReminderLevel,
  worksheetStatusFromProgress,
} from "./pengingat.ts";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-11-11T10:00:00+07:00");
const hoursFromNow = (hours) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);
const baseInput = {
  hasModule: true,
  materialCompleted: false,
  hasWorksheet: true,
  worksheetStatus: "belum",
  hasExitTicket: true,
  exitTicketSubmitted: false,
};

console.log("Kasus A: planAssignmentSteps — kombinasi langkah");
{
  const steps = planAssignmentSteps(baseInput);
  check(
    "lengkap belum selesai: 3 langkah urut materi → lkpd → exit_ticket",
    steps.map((s) => s.key).join(",") === "materi,lkpd,exit_ticket",
  );
  check(
    "label persis",
    steps[0].label === "Baca materi sampai tuntas" && steps[1].label === "Kerjakan LKPD" && steps[2].label === "Isi exit ticket",
  );
  check("semua belum done", steps.every((s) => !s.done));
  check("hint +10 XP hanya pada materi belum tuntas", steps[0].hint === "+10 XP" && steps[1].hint === undefined && steps[2].hint === undefined);
}
{
  const steps = planAssignmentSteps({ ...baseInput, materialCompleted: true });
  check("materi tuntas → done dan hint hilang", steps[0].done === true && steps[0].hint === undefined);
}
{
  const steps = planAssignmentSteps({ ...baseInput, hasModule: false });
  check("tanpa modul → langkah materi tidak berlaku", steps.map((s) => s.key).join(",") === "lkpd,exit_ticket");
}
{
  const steps = planAssignmentSteps({ ...baseInput, hasWorksheet: false, worksheetStatus: null });
  check("tanpa LKPD → langkah LKPD tidak berlaku", steps.map((s) => s.key).join(",") === "materi,exit_ticket");
}
{
  const steps = planAssignmentSteps({ ...baseInput, hasExitTicket: false });
  check("hasExitTicket false → langkah exit ticket tidak berlaku", steps.map((s) => s.key).join(",") === "materi,lkpd");
}
for (const [status, done] of [["terkumpul", true], ["dinilai", true], ["draf", false], ["belum", false], [null, false], [undefined, false]]) {
  const steps = planAssignmentSteps({ ...baseInput, worksheetStatus: status });
  check(`status LKPD ${String(status)} → done=${done}`, steps[1].done === done);
}
{
  const steps = planAssignmentSteps({ ...baseInput, exitTicketSubmitted: true });
  check("exit ticket terkirim → done", steps[2].done === true);
}

console.log("Kasus B: worksheetStatusFromProgress");
check("terkumpul → terkumpul", worksheetStatusFromProgress("terkumpul") === "terkumpul");
check("dinilai → dinilai", worksheetStatusFromProgress("dinilai") === "dinilai");
check("draf → draf", worksheetStatusFromProgress("draf") === "draf");
check("belum → belum", worksheetStatusFromProgress("belum") === "belum");
check("belum_dibuka → belum", worksheetStatusFromProgress("belum_dibuka") === "belum");
check("terlambat → belum (pengingat memilih mengingatkan)", worksheetStatusFromProgress("terlambat") === "belum");
check("null/tidak dikenal → belum", worksheetStatusFromProgress(null) === "belum" && worksheetStatusFromProgress("aneh") === "belum");

console.log("Kasus C: allStepsDone + missingStepLabels");
{
  const none = planAssignmentSteps(baseInput);
  check("semua belum → allStepsDone false", allStepsDone(none) === false);
  check(
    "missingLabels bentuk pendek, urut langkah",
    missingStepLabels(none).join("|") === "materi belum dituntaskan|LKPD belum dikumpulkan|exit ticket belum diisi",
  );
  const done = planAssignmentSteps({ hasModule: true, materialCompleted: true, hasWorksheet: true, worksheetStatus: "dinilai", hasExitTicket: true, exitTicketSubmitted: true });
  check("semua selesai → allStepsDone true, missing kosong", allStepsDone(done) === true && missingStepLabels(done).length === 0);
  check("daftar kosong → allStepsDone false", allStepsDone([]) === false);
  const partial = planAssignmentSteps({ ...baseInput, materialCompleted: true, worksheetStatus: "terkumpul" });
  check("sebagian → missing hanya exit ticket", missingStepLabels(partial).join("|") === "exit ticket belum diisi");
}

console.log("Kasus D: planReminderLevel");
{
  const missing = planAssignmentSteps(baseInput);
  const doneAll = planAssignmentSteps({ ...baseInput, materialCompleted: true, worksheetStatus: "terkumpul", exitTicketSubmitted: true });
  check("semua selesai walau tenggat lewat → none", planReminderLevel({ dueAt: hoursFromNow(-5), steps: doneAll, now: NOW }).level === "none");
  check("ada yang kurang, tanpa tenggat → none", planReminderLevel({ dueAt: null, steps: missing, now: NOW }).level === "none");
  check("ada yang kurang, tenggat 100 jam lagi → none", planReminderLevel({ dueAt: hoursFromNow(100), steps: missing, now: NOW }).level === "none");
  const segera = planReminderLevel({ dueAt: hoursFromNow(48), steps: missing, now: NOW });
  check("tenggat 48 jam → segera, tidak overdue", segera.level === "segera" && segera.overdue === false);
  check("tenggat tepat 72 jam → segera", planReminderLevel({ dueAt: hoursFromNow(72), steps: missing, now: NOW }).level === "segera");
  check("tenggat 73 jam → none", planReminderLevel({ dueAt: hoursFromNow(73), steps: missing, now: NOW }).level === "none");
  const dekat = planReminderLevel({ dueAt: hoursFromNow(12), steps: missing, now: NOW });
  check("tenggat 12 jam → mendesak, tidak overdue", dekat.level === "mendesak" && dekat.overdue === false);
  check("tenggat tepat 24 jam → mendesak", planReminderLevel({ dueAt: hoursFromNow(24), steps: missing, now: NOW }).level === "mendesak");
  check("tenggat 25 jam → segera", planReminderLevel({ dueAt: hoursFromNow(25), steps: missing, now: NOW }).level === "segera");
  const lewat = planReminderLevel({ dueAt: hoursFromNow(-1), steps: missing, now: NOW });
  check("tenggat terlewat → mendesak + overdue", lewat.level === "mendesak" && lewat.overdue === true);
  check(
    "missingLabels ikut pada hasil",
    lewat.missingLabels.join("|") === "materi belum dituntaskan|LKPD belum dikumpulkan|exit ticket belum diisi",
  );
  check(
    "dueAt sebagai string ISO diterima",
    planReminderLevel({ dueAt: hoursFromNow(12).toISOString(), steps: missing, now: NOW }).level === "mendesak",
  );
}

console.log("Kasus E: materialBannerVisible");
check("materi ada, belum tuntas, draf → tampil", materialBannerVisible({ module_id: 7, completed: false }, "draf") === true);
check("materi null → tidak tampil", materialBannerVisible(null, "draf") === false);
check("materi undefined → tidak tampil", materialBannerVisible(undefined, "draf") === false);
check("sudah tuntas → tidak tampil", materialBannerVisible({ module_id: 7, completed: true }, "draf") === false);
check("attempt terkumpul → tidak tampil", materialBannerVisible({ module_id: 7, completed: false }, "terkumpul") === false);
check("attempt dinilai → tidak tampil", materialBannerVisible({ module_id: 7, completed: false }, "dinilai") === false);
check("status null → tidak tampil", materialBannerVisible({ module_id: 7, completed: false }, null) === false);

console.log("Kasus F: wiring beranda murid");
const homePage = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check("beranda mengimpor perencana pengingat", homePage.includes('from "../../lib/pengingat"'));
check(
  "tipe kartu membawa dua field bukti baru",
  homePage.includes("material_completed: boolean;") && homePage.includes("exit_ticket_submitted: boolean;"),
);
check(
  "kartu menyusun langkah dari payload (exit ticket selalu berlaku)",
  homePage.includes("planAssignmentSteps({") && homePage.includes("hasExitTicket: true,") &&
    homePage.includes("materialCompleted: assignment.material_completed") && homePage.includes("exitTicketSubmitted: assignment.exit_ticket_submitted"),
);
check(
  "tingkat pengingat dihitung dari due_at kartu",
  homePage.includes("planReminderLevel({ dueAt: assignment.due_at, steps, now: new Date() })"),
);
check(
  "pita dirender dengan kelas level + label yang hilang",
  homePage.includes("assign-reminder--${reminder.level}") && homePage.includes("reminder.missingLabels.join("),
);
check(
  "redaksi pita: Segera tenggat / Tenggat dekat / Sudah lewat tenggat",
  homePage.includes('"Segera tenggat"') && homePage.includes('"Tenggat dekat"') && homePage.includes('"Sudah lewat tenggat"'),
);
check(
  "kartu mendesak beraksen khusus",
  homePage.includes('assignment-card--mendesak'),
);
check(
  "checklist dirender: baris selesai ringkas + daftar langkah",
  homePage.includes("Semua langkah selesai ✓") && homePage.includes('className="assign-steps"'),
);
check(
  "langkah pertama belum selesai berpenekanan Berikutnya",
  homePage.includes("assign-step-next") && homePage.includes("Berikutnya") && homePage.includes("index === nextStepIndex"),
);
check(
  "penugasan dinilai tidak digambar checklist-nya",
  homePage.includes('const showSteps = assignment.progress !== "dinilai";'),
);

console.log("Kasus G: wiring banner LKPD");
const worksheetPage = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
check("halaman LKPD mengimpor syarat banner", worksheetPage.includes("materialBannerVisible") && worksheetPage.includes('from "../../../../lib/pengingat"'));
check(
  "tipe respons attempt membawa material",
  worksheetPage.includes("material?: { module_id: number; completed: boolean } | null;"),
);
check(
  "material diterapkan dari respons attempt",
  worksheetPage.includes("setMaterialInfo(attemptData.material ?? null);"),
);
check(
  "banner memakai syarat lib + penutup lokal",
  worksheetPage.includes("const showMaterialBanner = materialBannerVisible(materialInfo, status) && !materialBannerClosed;"),
);
check(
  "teks banner pengingat + iming-iming XP",
  worksheetPage.includes("Kamu belum menuntaskan membaca materi ini") && worksheetPage.includes("sekalian dapat +10 XP"),
);
check(
  "tautan Baca Materi menuju modul konteks",
  worksheetPage.includes("href={`/murid/modules/${materialInfo.module_id}`}") && worksheetPage.includes("Baca Materi"),
);
check(
  "tombol tutup hanya mengubah state lokal",
  worksheetPage.includes("onClick={() => setMaterialBannerClosed(true)}") && worksheetPage.includes('aria-label="Tutup pengingat materi"'),
);
check(
  "penutupan banner tidak disimpan ke localStorage/server",
  !worksheetPage.includes("localStorage") && !/apiRequest<[^>]*>\(\s*`[^`]*banner/.test(worksheetPage),
);

console.log("Kasus H: CSS pengingat");
const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check(
  "globals.css: kelas checklist + pita + aksen kartu",
  globalsCss.includes(".assign-steps") && globalsCss.includes(".assign-step.is-done") &&
    globalsCss.includes(".assign-step.is-next") && globalsCss.includes(".assign-reminder--segera") &&
    globalsCss.includes(".assign-reminder--mendesak") && globalsCss.includes(".assignment-card--mendesak") &&
    globalsCss.includes(".assign-steps-done"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
