// Tests for panel "CP & ATP" (daftar kurikulum baca-saja, Tahap 1):
// helper pemilih dan perencana tampil di lib/kurikulum.ts, plus wiring
// panelnya di cangkang guru (app/guru/page.tsx) dan komponennya.
// Run with bun from apps/web:  bun lib/kurikulum.test.mjs
//
// Yang dikunci di sini:
//  - Pemilih bertingkat mapel → kelas → semester hanya menawarkan
//    kombinasi yang benar-benar ada di ringkasan API, dan clampSelection
//    selalu memperbaiki pilihan yang menggantung sesudah mapel diganti.
//  - planSections memasang panji CP hanya saat CP berganti antar
//    kelompok berurutan (CP yang sama tidak diulang di tiap kelompok),
//    dan subtotal JP per kelompok adalah jumlah JP ATP-nya.
//  - Wiring: panel dipasang malas di cangkang guru seperti Perpustakaan
//    Bersama, tampil lewat guruView "kurikulum", dan komponennya hanya
//    membaca (GET) dari route /kurikulum.
import { readFileSync } from "node:fs";
import { clampSelection, gradesOf, planSections, semestersOf, subjectsOf } from "./kurikulum.ts";

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

const SUMMARIES = [
  { subject: "Matematika", grade: "Kelas X", phase: "Fase E", semester: "Ganjil", groupCount: 4, atpCount: 29, totalJp: 58 },
  { subject: "Matematika", grade: "Kelas X", phase: "Fase E", semester: "Genap", groupCount: 3, atpCount: 21, totalJp: 42 },
  { subject: "Matematika", grade: "Kelas XI", phase: "Fase F", semester: "Ganjil", groupCount: 4, atpCount: 15, totalJp: 45 },
  { subject: "KKA", grade: "Kelas X", phase: "Fase E", semester: "Ganjil", groupCount: 3, atpCount: 24, totalJp: 52 },
  { subject: "KKA", grade: "Kelas X", phase: "Fase E", semester: "Genap", groupCount: 3, atpCount: 19, totalJp: 44 },
];

// --- Pemilih bertingkat ---------------------------------------------------
check("mapel unik berurutan tampil pertama", JSON.stringify(subjectsOf(SUMMARIES)) === JSON.stringify(["Matematika", "KKA"]));
check("kelas mengikuti mapel terpilih", JSON.stringify(gradesOf(SUMMARIES, "KKA")) === JSON.stringify(["Kelas X"]));
check(
  "semester mengikuti mapel + kelas",
  JSON.stringify(semestersOf(SUMMARIES, "Matematika", "Kelas XI")) === JSON.stringify(["Ganjil"]),
);
check(
  "pilihan awal (null) jatuh ke set pertama",
  JSON.stringify(clampSelection(SUMMARIES, null)) ===
    JSON.stringify({ subject: "Matematika", grade: "Kelas X", semester: "Ganjil" }),
);
check(
  "pilihan sah dipertahankan apa adanya",
  JSON.stringify(clampSelection(SUMMARIES, { subject: "KKA", grade: "Kelas X", semester: "Genap" })) ===
    JSON.stringify({ subject: "KKA", grade: "Kelas X", semester: "Genap" }),
);
check(
  "ganti mapel menjatuhkan kelas yang tidak ada di mapel baru",
  JSON.stringify(clampSelection(SUMMARIES, { subject: "KKA", grade: "Kelas XI", semester: "Ganjil" })) ===
    JSON.stringify({ subject: "KKA", grade: "Kelas X", semester: "Ganjil" }),
);
check("ringkasan kosong → tidak ada pilihan", clampSelection([], null) === null);

// --- Perencana tampil -------------------------------------------------------
const SET = {
  subject: "Matematika",
  grade: "Kelas X",
  phase: "Fase E",
  semester: "Ganjil",
  source: "sumber uji",
  cps: [
    { code: "5.1", element: "Bilangan", text: "CP satu." },
    { code: "5.2", element: "Aljabar dan Fungsi", text: "CP dua." },
  ],
  groups: [
    { code: "Materi 1", title: "Eksponen", material: "Eksponen", cpCode: "5.1", atps: [{ code: "1.1", text: "Peserta didik dapat a.", jp: 2 }, { code: "1.2", text: "Peserta didik dapat b.", jp: 2 }] },
    { code: "Materi 2", title: "SPtLDV", material: "SPtLDV", cpCode: "5.2", atps: [{ code: "2.1", text: "Peserta didik dapat c.", jp: 2 }] },
    { code: "Materi 3", title: "Fungsi Kuadrat", material: "Fungsi Kuadrat", cpCode: "5.2", atps: [{ code: "3.1", text: "Peserta didik dapat d.", jp: 2 }] },
  ],
};
const sections = planSections(SET);
check("satu bagian per kelompok, urutan terjaga", sections.length === 3 && sections[0].group.title === "Eksponen");
check(
  "panji CP tampil hanya saat CP berganti (5.1, lalu 5.2, lalu tidak diulang)",
  sections.map((s) => s.showCp).join(",") === "true,true,false",
);
check("bagian membawa CP yang benar", sections[1].cp?.code === "5.2" && sections[2].cp?.code === "5.2");
check("subtotal kelompok = jumlah ATP & JP ATP-nya", sections[0].atpCount === 2 && sections[0].totalJp === 4);

// --- Wiring cangkang & komponen ----------------------------------------------
const pageSource = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");
check("cangkang guru mengenal tampilan kurikulum", pageSource.includes('"kurikulum"'));
check("panel kurikulum dipasang malas seperti perpustakaan", pageSource.includes("kurikulumMounted") && pageSource.includes("<KurikulumPanel"));
check("bilah sisi punya pengalih CP & ATP", pageSource.includes("openCurriculumView") && pageSource.includes("CP &amp; ATP"));
const panelSource = readFileSync(new URL("../components/KurikulumPanel.tsx", import.meta.url), "utf8");
check("panel membaca ringkasan dari route kurikulum", panelSource.includes('apiRequest<SummaryResponse>("/kurikulum")'));
check("panel membaca set terpilih dari route kurikulum/set", panelSource.includes("/kurikulum/set?"));
check(
  "panel baca-saja: tidak mengirim tulis apa pun",
  !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(panelSource),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
