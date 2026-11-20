// Tests for strip aktivitas minggu ini di beranda murid (Fitur
// Kilau Murid 3, sisi web). Run with bun from apps/web:
//   bun lib/strip-aktivitas.test.mjs
//
// Yang dikunci di sini:
//  - TodayResponse membawa week_activity (boleh null) dan strip
//    dirender dari payload server itu — web tidak menghitung pekan
//    sendiri.
//  - Kepala strip persis "Aktivitas minggu ini" + ringkasan
//    "N dari 7 hari"; sel hari memakai label server + kelas aktif /
//    hari ini.
//  - Batasan non-punitif: tidak ada kosakata streak/rangkaian
//    beruntun/putus di permukaan strip (halaman + gaya), dan hari
//    kosong tidak diberi tanda silang/gagal.
import { readFileSync } from "node:fs";

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

const muridPage = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check(
  "TodayResponse membawa week_activity (boleh null), state awalnya null",
  muridPage.includes("week_activity: WeekActivity | null") &&
    muridPage.includes("week_activity: null, avatar_slug: null"),
);
check(
  "strip dirender hanya bila payload ada, dari hari-hari server",
  muridPage.includes("{data.week_activity ? (") &&
    muridPage.includes('className="murid-week-strip"') &&
    muridPage.includes("data.week_activity.days.map((day) => ("),
);
check(
  "kepala strip: 'Aktivitas minggu ini' + ringkasan 'N dari 7 hari'",
  muridPage.includes("Aktivitas minggu ini") &&
    muridPage.includes("{data.week_activity.activeCount} dari 7 hari"),
);
check(
  "sel hari: titik centang hanya untuk hari aktif; kelas penanda aktif + hari ini",
  muridPage.includes('className="murid-week-day-dot"') &&
    muridPage.includes('{day.active ? "✓" : ""}') &&
    muridPage.includes('day.active ? " is-active" : ""') &&
    muridPage.includes('day.isToday ? " is-today" : ""') &&
    muridPage.includes("{day.weekday}"),
);

const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check(
  "gaya strip ada di globals.css (kepala, kisi 7 hari, titik, aktif, hari ini)",
  globalsCss.includes(".murid-week-strip {") &&
    globalsCss.includes(".murid-week-strip-days") &&
    globalsCss.includes("grid-template-columns: repeat(7, 1fr);") &&
    globalsCss.includes(".murid-week-day-dot") &&
    globalsCss.includes(".murid-week-day.is-active .murid-week-day-dot") &&
    globalsCss.includes(".murid-week-day.is-today .murid-week-day-dot"),
);

// Batasan desain keras: tampilan strip (blok JSX yang dirender +
// seksi gayanya) bebas kosakata rangkaian beruntun. Pemeriksaannya
// dilingkupkan ke blok render strip saja — komentar penjelas di
// luar blok memang menyebut batasan ini dengan kata "BUKAN streak".
const stripJsxStart = muridPage.indexOf("{data.week_activity ? (");
const stripJsx = stripJsxStart >= 0 ? muridPage.slice(stripJsxStart, stripJsxStart + 1600) : "";
const stripCssStart = globalsCss.indexOf(".murid-week-strip {");
const stripCss = stripCssStart >= 0 ? globalsCss.slice(stripCssStart, stripCssStart + 1800) : "";
check(
  "tidak ada kosakata streak/beruntun di tampilan strip (JSX + gaya)",
  stripJsx.length > 0 && stripCss.length > 0 &&
    !/streak|beruntun/i.test(stripJsx) && !/streak|beruntun/i.test(stripCss),
);
check(
  "hari kosong tanpa tanda silang/gagal (titik hanya berisi centang atau kosong)",
  !muridPage.includes('day.active ? "✓" : "✗"') && !muridPage.includes("is-failed"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
