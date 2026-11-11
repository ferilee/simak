// Tests for sapaan murid di web (lib/sapaan.ts + wiring ruang murid).
// Run with bun from apps/web:  bun lib/sapaan.test.mjs
//
// Yang dikunci di sini:
//  - Salam mengikuti jam setempat pada batas-batas yang wajar.
//  - Kutipan harian deterministik: sama sepanjang hari, berganti
//    keesokan harinya, dan selalu kalimat dari daftar kurasi (tanpa
//    atribusi tokoh).
//  - Wiring: ruang murid membuka modal hanya bila server berkata
//    needs_welcome, dan setiap jalan menutup modal mencatat penanda
//    lewat POST /murid/welcome/seen.
import { readFileSync } from "node:fs";
import { MOTIVATIONAL_QUOTES, quoteIndexForDate, quoteOfTheDay, salamForHour } from "./sapaan.ts";

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

check("jam 04.00–10.59 → Selamat pagi", salamForHour(4) === "Selamat pagi" && salamForHour(10) === "Selamat pagi");
check("jam 11.00–14.59 → Selamat siang", salamForHour(11) === "Selamat siang" && salamForHour(14) === "Selamat siang");
check("jam 15.00–18.59 → Selamat sore", salamForHour(15) === "Selamat sore" && salamForHour(18) === "Selamat sore");
check("jam 19.00–03.59 → Selamat malam", salamForHour(19) === "Selamat malam" && salamForHour(23) === "Selamat malam" && salamForHour(0) === "Selamat malam" && salamForHour(3) === "Selamat malam");

const morning = new Date(2026, 10, 11, 7, 30);
const night = new Date(2026, 10, 11, 21, 5);
const tomorrow = new Date(2026, 10, 12, 7, 30);
check("kutipan sama sepanjang hari yang sama", quoteOfTheDay(morning) === quoteOfTheDay(night));
check("kutipan berganti keesokan harinya", quoteOfTheDay(morning) !== quoteOfTheDay(tomorrow));
check("kutipan selalu dari daftar kurasi", MOTIVATIONAL_QUOTES.includes(quoteOfTheDay(morning)));
check("daftar kurasi berisi ≥ 10 kalimat tidak kosong", MOTIVATIONAL_QUOTES.length >= 10 && MOTIVATIONAL_QUOTES.every((q) => q.trim().length > 10));
check("indeks kutipan selalu dalam rentang", [0, 1, 13, 364].every((offset) => {
  const d = new Date(2026, 0, 1 + offset);
  const idx = quoteIndexForDate(d, MOTIVATIONAL_QUOTES.length);
  return idx >= 0 && idx < MOTIVATIONAL_QUOTES.length;
}));

const page = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check("modal dibuka hanya dari keputusan server", page.includes("if (today.data.needs_welcome) setWelcomeOpen(true)"));
check("menutup modal mencatat penanda ke server", page.includes('apiRequest("/murid/welcome/seen", { method: "POST" })'));
check("semua jalan menutup memakai satu penangan (onClose Modal)", page.includes("onClose={dismissWelcome}"));
check("judul modal memakai salam dinamis + nama tampilan", page.includes("salamForHour(new Date().getHours())") && page.includes("${displayName}"));
check("isi modal memuat kutipan harian", page.includes("quoteOfTheDay(new Date())"));
check("orientasi menuntun LKPD lewat Penugasan", page.includes("Kerjakan LKPD lewat menu Penugasan"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
