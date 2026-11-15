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
import { XP_EARN_WAYS, XP_INFO_NOTE, XP_INFO_TITLE, xpProgressLabel } from "./xp.ts";

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
  muridPage.includes('from "../../lib/xp";') &&
    muridPage.includes("xpProgressLabel") &&
    muridPage.includes("type XpSummary"),
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

// ---------------------------------------------------------------------------
console.log("Case: panel info 'Cara Mendapat XP' di kartu XP (v1.0.64)");
{
  // Angka cerminan web WAJIB sama dengan XP_POINTS server — dibaca
  // langsung dari berkas API supaya penyimpangan tertangkap di sini.
  const apiXp = readFileSync(new URL("../../api/src/lib/xp.ts", import.meta.url), "utf8");
  const pointsBlock = /export const XP_POINTS = \{([^}]*)\}/.exec(apiXp)?.[1] ?? "";
  const apiPoints = Object.fromEntries(
    [...pointsBlock.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  check(
    "XP_POINTS server terbaca (materi 10, LKPD 25, exit ticket 15)",
    apiPoints.materi_tuntas === 10 && apiPoints.lkpd_terkumpul === 25 && apiPoints.exit_ticket === 15,
    JSON.stringify(apiPoints),
  );
  check(
    "XP_EARN_WAYS memuat tepat tiga cara dengan angka yang sama dengan server",
    XP_EARN_WAYS.length === 3 &&
      XP_EARN_WAYS.every((way) => apiPoints[way.event] === way.points),
    JSON.stringify(XP_EARN_WAYS),
  );
  check(
    "label cara peroleh persis yang disepakati",
    XP_EARN_WAYS.map((way) => way.label).join("|") === "Baca materi sampai tuntas|Isi exit ticket|Kumpulkan LKPD",
  );
  check("judul panel 'Cara Mendapat XP'", XP_INFO_TITLE === "Cara Mendapat XP");
  check(
    "catatan penutup menyebut ketuntasan + level + tukar avatar",
    XP_INFO_NOTE.includes("ketuntasan") && XP_INFO_NOTE.includes("level") && XP_INFO_NOTE.includes("ditukar dengan avatar"),
  );
  check(
    "tombol info ⓘ di kepala kartu XP (berbasis klik, aria-expanded)",
    muridPage.includes('className="xp-info-button"') &&
      muridPage.includes('aria-label="Info cara mendapat XP"') &&
      muridPage.includes("aria-expanded={xpInfoOpen}") &&
      muridPage.includes("setXpInfoOpen((open) => !open)"),
  );
  check(
    "popover dirender dari konstanta bersama (judul + daftar cara + catatan)",
    muridPage.includes('className="xp-info-popover"') &&
      muridPage.includes("{XP_INFO_TITLE}") &&
      muridPage.includes("XP_EARN_WAYS.map") &&
      muridPage.includes("+{way.points} XP") &&
      muridPage.includes("{XP_INFO_NOTE}"),
  );
  check(
    "popover tertutup lewat tombol × DAN ketuk latar di luar panel",
    muridPage.includes('aria-label="Tutup info XP"') &&
      muridPage.includes('className="xp-info-backdrop"') &&
      muridPage.includes('onClick={() => setXpInfoOpen(false)}'),
  );
  const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  check(
    "gaya popover + latar penangkap ketuk ada di globals.css",
    globalsCss.includes(".xp-info-popover") && globalsCss.includes(".xp-info-backdrop") && globalsCss.includes(".xp-info-button"),
  );
}

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
