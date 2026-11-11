// Tests for tampilan poin XP di web (lib/xp.ts + wiring ruang murid
// dan halaman LKPD). Run with bun from apps/web:  bun lib/xp.test.mjs
//
// Yang dikunci di sini:
//  - Kalimat kemajuan kartu XP: "X XP lagi ke <level berikut>" di
//    tingkat menengah, "Level tertinggi tercapai 🏆" di Master SIMAK.
//    Angka dan nama level selalu dari server (GET /murid/today) — web
//    tidak menghitung ulang tangga level.
//  - Wiring ruang murid: data.xp dari /today menggerakkan kartu XP
//    (total, nama level, bilah kemajuan); xp null (gagal-aman server)
//    berarti kartu tidak dirender.
//  - Wiring halaman LKPD: toast sukses kumpul menyebut "+N XP" dari
//    data.xp_awarded respons submit, hanya bila N > 0.
import { readFileSync } from "node:fs";
import { xpProgressLabel } from "./xp.ts";

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

const midSummary = {
  total: 85,
  levelIndex: 1,
  levelName: "Penjelajah",
  nextLevelName: "Pencari Pola",
  nextLevelAt: 120,
  xpToNext: 35,
  progressPct: 50,
};
check(
  "tingkat menengah → '35 XP lagi ke Pencari Pola'",
  xpProgressLabel(midSummary) === "35 XP lagi ke Pencari Pola",
);
const topSummary = {
  total: 720,
  levelIndex: 5,
  levelName: "Master SIMAK",
  nextLevelName: null,
  nextLevelAt: null,
  xpToNext: null,
  progressPct: 100,
};
check(
  "tingkat tertinggi → 'Level tertinggi tercapai 🏆'",
  xpProgressLabel(topSummary) === "Level tertinggi tercapai 🏆",
);

const muridPage = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check(
  "ruang murid memakai tipe + label dari lib/xp",
  muridPage.includes('import { xpProgressLabel, type XpSummary } from "../../lib/xp";'),
);
check(
  "TodayResponse membawa xp (boleh null) dan state awalnya null",
  muridPage.includes("xp: XpSummary | null") && muridPage.includes("needs_welcome: false, xp: null"),
);
check(
  "kartu XP dirender hanya bila data.xp ada, menampilkan total + nama level",
  muridPage.includes("{data.xp ? (") &&
    muridPage.includes('className="xp-card"') &&
    muridPage.includes("{data.xp.total} XP") &&
    muridPage.includes("{data.xp.levelName}"),
);
check(
  "bilah kemajuan memakai progressPct server + label kemajuan",
  muridPage.includes("width: `${data.xp.progressPct}%`") &&
    muridPage.includes("{xpProgressLabel(data.xp)}"),
);

const worksheetPage = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
check(
  "halaman LKPD membaca xp_awarded dari respons submit",
  worksheetPage.includes("xp_awarded?: number") &&
    worksheetPage.includes("const xpAwarded = submitResult.data.xp_awarded ?? 0;"),
);
check(
  "toast sukses menyebut +N XP hanya bila xp_awarded > 0",
  worksheetPage.includes("xpAwarded > 0 ? `LKPD berhasil dikumpulkan. +${xpAwarded} XP ⭐` : \"LKPD berhasil dikumpulkan.\""),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
