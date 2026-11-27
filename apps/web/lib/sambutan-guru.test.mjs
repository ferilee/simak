// Tests for "Sambutan Guru" (kartu selamat datang ruang kerja guru).
// Run with bun from apps/web:  bun lib/sambutan-guru.test.mjs
//
// The view helper (lib/sambutan-guru.ts) is tested behaviorally over
// the full state matrix; the guru page wiring (card placement in the
// Langkah 1 panel, checklist signals from page state, dismiss call,
// panduan link gating) is locked statically against the page source
// and globals.css.
import { readFileSync } from "node:fs";
import { welcomeChecklist, welcomeChecklistComplete, welcomeView } from "./sambutan-guru.ts";

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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const base = { dismissedAt: null, hasClass: false, hasModule: false, hasAssignment: false };
const lengkap = { dismissedAt: null, hasClass: true, hasModule: true, hasAssignment: true };

// ---------------------------------------------------------------------------
console.log("Case 1: penanda tutup selalu menang (sembunyi)");
{
  check("ditutup + data kosong → sembunyi", welcomeView({ ...base, dismissedAt: new Date() }) === "sembunyi");
  check("ditutup + data lengkap → sembunyi", welcomeView({ ...lengkap, dismissedAt: new Date() }) === "sembunyi");
  check("ditutup (string ISO) + sebagian → sembunyi", welcomeView({ ...base, hasClass: true, dismissedAt: "2026-11-28T00:00:00.000Z" }) === "sembunyi");
}

// ---------------------------------------------------------------------------
console.log("Case 2: belum ditutup — lengkap berarti ringkas, selain itu penuh");
{
  check("ketiga butir lengkap → ringkas", welcomeView(lengkap) === "ringkas");
  check("dismissedAt undefined + lengkap → ringkas", welcomeView({ ...lengkap, dismissedAt: undefined }) === "ringkas");
  for (const [label, signals] of [
    ["semua kosong", base],
    ["hanya kelas", { ...base, hasClass: true }],
    ["hanya materi", { ...base, hasModule: true }],
    ["hanya tugas", { ...base, hasAssignment: true }],
    ["kelas + materi", { ...base, hasClass: true, hasModule: true }],
    ["kelas + tugas", { ...base, hasClass: true, hasAssignment: true }],
    ["materi + tugas", { ...base, hasModule: true, hasAssignment: true }],
  ]) {
    check(`${label} → penuh`, welcomeView(signals) === "penuh");
  }
}

// ---------------------------------------------------------------------------
console.log("Case 3: checklist — label, keadaan, dan langkah tujuan");
{
  const items = welcomeChecklist({ ...base, hasClass: true });
  check("tiga butir", items.length === 3);
  check("butir kelas: label + langkah 2 (Atur kelas)", items[0].key === "kelas" && items[0].label === "Punya kelas tujuan" && items[0].step === 2);
  check("butir materi: label + langkah 0 (Bangun materi)", items[1].key === "materi" && items[1].label === "Punya materi" && items[1].step === 0);
  check("butir tugas: label + langkah 3 (Terbitkan tugas)", items[2].key === "tugas" && items[2].label === "Menerbitkan tugas pertama" && items[2].step === 3);
  check("done mengikuti sinyal", items[0].done === true && items[1].done === false && items[2].done === false);
  check("welcomeChecklistComplete: lengkap → true", welcomeChecklistComplete(lengkap) === true);
  check("welcomeChecklistComplete: kurang satu → false", welcomeChecklistComplete({ ...lengkap, hasAssignment: false }) === false);
  check("welcomeChecklistComplete konsisten dengan welcomeView ringkas", welcomeChecklistComplete(lengkap) === (welcomeView(lengkap) === "ringkas"));
}

// ---------------------------------------------------------------------------
console.log("Case 4: pengawatan halaman guru (statis)");
{
  const page = read("../app/guru/page.tsx");
  check("halaman memakai welcomeView dari lib", page.includes('from "../../lib/sambutan-guru"') && page.includes("welcomeView("));
  check("sinyal kelas dari kelas aktif", page.includes("hasClass: activeClasses.length > 0"));
  check("sinyal materi dari modul milik guru", page.includes("hasModule: modules.length > 0"));
  check("sinyal tugas dari penugasan terbit", page.includes('hasAssignment: assignments.some((assignment) => assignment.status === "terbit")'));
  check("kartu dirender di panel Langkah 1 (module-overview)", page.indexOf("sambutan-card") > page.indexOf('className="wizard-step-panel module-overview"') && page.indexOf("sambutan-card") < page.indexOf('className="wizard-step-panel compact-resource-section"'));
  check("tombol tutup memanggil endpoint dismiss", page.includes('"/guru/welcome/dismiss"'));
  check("tautan panduan hanya bila panduanUrl ada", page.includes("panduanUrl ? (") || page.includes("panduanUrl &&"));
  check("sapaan memakai nama guru", page.includes("Selamat datang, {teacherName}"));
  check("baris ringkas berlabel Panduan awal selesai", page.includes("Panduan awal selesai"));
  const css = read("../app/globals.css");
  check("CSS berawalan sambutan- tersedia", css.includes(".sambutan-card") && css.includes(".sambutan-ringkas"));
  check("CSS sambutan bebas :has(", !css.slice(css.indexOf(".sambutan-card"), css.indexOf(".sambutan-card") + 4000).includes(":has("));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
