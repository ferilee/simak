// Tests for progres level kasat di beranda murid (Fitur Kilau Murid 1).
// Run with bun from apps/web:  bun lib/progres-level.test.mjs
//
// Yang dikunci di sini:
//  - XP_LEVELS web adalah cerminan persis XP_LEVELS server
//    (apps/api/src/lib/xp.ts) — dibaca langsung dari berkas API
//    supaya penyimpangan tertangkap di sini, pola yang sama dengan
//    cerminan XP_EARN_WAYS di lib/xp.test.mjs.
//  - levelProgress murni pada batas-batas ambang: tepat di ambang,
//    satu di bawahnya, XP 0, dan level tertinggi (pecahan tepat 1,
//    tanpa sisa, label keadaan "Level tertinggi").
//  - Kalimat sisa persis pola "Sisa X XP ke <level berikut>".
//  - Wiring kartu Progres belajar: blok murid-home-xp memakai helper,
//    batang hanya dirender di bawah level tertinggi.
import { readFileSync } from "node:fs";
import { XP_LEVELS, levelProgress } from "./xp.ts";

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

// --- Cerminan tangga level -------------------------------------------------
{
  const apiXp = readFileSync(new URL("../../api/src/lib/xp.ts", import.meta.url), "utf8");
  const levelsBlock = /export const XP_LEVELS = \[([\s\S]*?)\] as const;/.exec(apiXp)?.[1] ?? "";
  const apiLevels = [...levelsBlock.matchAll(/\{\s*min:\s*(\d+),\s*name:\s*"([^"]+)"\s*\}/g)].map((m) => ({
    min: Number(m[1]),
    name: m[2],
  }));
  check("XP_LEVELS server terbaca (6 tingkat)", apiLevels.length === 6, JSON.stringify(apiLevels));
  check(
    "XP_LEVELS web persis sama dengan server (ambang + nama, berurutan)",
    XP_LEVELS.length === apiLevels.length &&
      XP_LEVELS.every((level, i) => level.min === apiLevels[i].min && level.name === apiLevels[i].name),
    JSON.stringify(XP_LEVELS),
  );
}

// --- Batas-batas levelProgress ---------------------------------------------
const at0 = levelProgress(0);
check(
  "XP 0 → Pembelajar Baru, pecahan 0, 'Sisa 50 XP ke Penjelajah'",
  at0.levelIndex === 0 && at0.levelName === "Pembelajar Baru" && at0.fraction === 0 &&
    at0.xpToNext === 50 && at0.label === "Sisa 50 XP ke Penjelajah" && !at0.isTopLevel,
);
const at49 = levelProgress(49);
check(
  "XP 49 (satu di bawah ambang) → masih Pembelajar Baru, sisa 1",
  at49.levelIndex === 0 && at49.xpToNext === 1 && at49.label === "Sisa 1 XP ke Penjelajah",
);
const at50 = levelProgress(50);
check(
  "XP 50 (tepat di ambang) → Penjelajah, pecahan 0, 'Sisa 70 XP ke Pencari Pola'",
  at50.levelIndex === 1 && at50.levelName === "Penjelajah" && at50.fraction === 0 &&
    at50.xpIntoLevel === 0 && at50.levelSpan === 70 && at50.label === "Sisa 70 XP ke Pencari Pola",
);
const at85 = levelProgress(85);
check(
  "XP 85 → Penjelajah di tengah rentang, pecahan tepat 0.5, sisa 35",
  at85.levelIndex === 1 && at85.fraction === 0.5 && at85.xpToNext === 35 &&
    at85.label === "Sisa 35 XP ke Pencari Pola",
);
const at119 = levelProgress(119);
check(
  "XP 119 (satu di bawah ambang) → masih Penjelajah, sisa 1",
  at119.levelIndex === 1 && at119.xpToNext === 1 && at119.label === "Sisa 1 XP ke Pencari Pola",
);
const at120 = levelProgress(120);
check(
  "XP 120 (tepat di ambang) → Pencari Pola, pecahan 0",
  at120.levelIndex === 2 && at120.levelName === "Pencari Pola" && at120.fraction === 0,
);
const at699 = levelProgress(699);
check(
  "XP 699 (satu di bawah puncak) → Ahli Materi, sisa 1 ke Master SIMAK",
  at699.levelIndex === 4 && at699.levelName === "Ahli Materi" && at699.xpToNext === 1 &&
    at699.label === "Sisa 1 XP ke Master SIMAK",
);
const at700 = levelProgress(700);
check(
  "XP 700 (tepat di ambang puncak) → Master SIMAK, level tertinggi, pecahan 1, tanpa sisa",
  at700.levelIndex === 5 && at700.levelName === "Master SIMAK" && at700.isTopLevel &&
    at700.fraction === 1 && at700.xpToNext === null && at700.nextLevelName === null &&
    at700.levelSpan === null && at700.label === "Level tertinggi",
);
const at1000 = levelProgress(1000);
check(
  "XP 1000 (jauh di atas puncak) → tetap Master SIMAK, pecahan 1",
  at1000.levelIndex === 5 && at1000.isTopLevel && at1000.fraction === 1 && at1000.label === "Level tertinggi",
);
check(
  "masukan kotor dinormalkan (negatif → 0, pecahan dibulatkan ke bawah)",
  levelProgress(-5).total === 0 && levelProgress(50.9).total === 50 && levelProgress(50.9).levelIndex === 1,
);

// --- Wiring kartu Progres belajar -------------------------------------------
const muridPage = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check(
  "beranda murid menghitung homeLevel dari total server lewat levelProgress",
  muridPage.includes("levelProgress") &&
    muridPage.includes("const homeLevel = data.xp ? levelProgress(data.xp.total) : null;"),
);
check(
  "blok progres kasat dirender di kartu Progres belajar (total + nama level server)",
  muridPage.includes('className="murid-home-xp"') &&
    muridPage.includes("{data.xp.total} XP") &&
    muridPage.includes("Level {data.xp.levelName}"),
);
check(
  "batang progres memakai pecahan helper; label sisa dari helper",
  muridPage.includes("width: `${homeLevel.fraction * 100}%`") &&
    muridPage.includes("{homeLevel.label}"),
);
check(
  "di level tertinggi batang TIDAK dirender — hanya keadaan 'Level tertinggi'",
  muridPage.includes("homeLevel.isTopLevel ? (") &&
    muridPage.includes("🏆 {homeLevel.label}"),
);
const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check(
  "gaya blok murid-home-xp ada di globals.css",
  globalsCss.includes(".murid-home-xp {") &&
    globalsCss.includes(".murid-home-xp-head") &&
    globalsCss.includes(".murid-home-xp-note"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
