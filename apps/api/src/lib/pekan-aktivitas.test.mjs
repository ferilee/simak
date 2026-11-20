// Tests for strip aktivitas pekan berjalan (Fitur Kilau Murid 3).
// Run with bun from apps/api:  bun src/lib/pekan-aktivitas.test.mjs
//
// Yang dikunci di sini:
//  - Pekan WIB selalu Senin..Minggu memuat "hari ini" WIB, termasuk
//    di batas-batasnya (Ahad malam WIB masih pekan yang sama; Senin
//    dini hari WIB membuka pekan baru walau UTC masih Ahad).
//  - Rentang instan untuk saringan timestamp: [Senin 00.00 WIB,
//    Senin berikutnya 00.00 WIB) = mulai Ahad 17.00 UTC.
//  - buildWeekActivity: penanda aktif dari himpunan tanggal, label
//    Sen..Min berurutan, isToday tepat satu, hitungan "N dari 7".
//  - Bentuk datanya BUKAN streak: field hari tepat {date, weekday,
//    active, isToday} — tidak ada hitungan beruntun/keadaan putus.
//  - Wiring /murid/today: week_activity gagal-aman dari baris
//    xp_ledger berpoin positif dalam rentang pekan.
import { readFileSync } from "node:fs";
import { buildWeekActivity, wibWeekDates, wibWeekRangeUtc } from "./pekan-aktivitas.ts";

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

// --- Aritmetika pekan WIB -----------------------------------------------------
// Rabu 18 Nov 2026 12.00 WIB (= 05.00 UTC).
const wed = new Date("2026-11-18T05:00:00.000Z");
check(
  "Rabu WIB → pekan Senin 16 .. Minggu 22 Nov 2026",
  JSON.stringify(wibWeekDates(wed)) ===
    JSON.stringify(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]),
  JSON.stringify(wibWeekDates(wed)),
);
// Minggu 22 Nov 2026 20.00 WIB (= 13.00 UTC) — masih pekan yang sama.
check(
  "Minggu malam WIB → tetap pekan Senin 16 .. Minggu 22",
  wibWeekDates(new Date("2026-11-22T13:00:00.000Z"))[0] === "2026-11-16" &&
    wibWeekDates(new Date("2026-11-22T13:00:00.000Z"))[6] === "2026-11-22",
);
// Senin 23 Nov 2026 00.30 WIB (= Ahad 17.30 UTC) — pekan baru menurut WIB.
check(
  "Senin dini hari WIB (UTC masih Ahad) → pekan baru Senin 23 .. Minggu 29",
  wibWeekDates(new Date("2026-11-22T17:30:00.000Z"))[0] === "2026-11-23" &&
    wibWeekDates(new Date("2026-11-22T17:30:00.000Z"))[6] === "2026-11-29",
);
// Senin 16 Nov 2026 00.30 WIB (= Ahad 15 Nov 17.30 UTC) — awal pekan ini.
check(
  "Senin 00.30 WIB → pekan yang mulai Senin itu juga",
  wibWeekDates(new Date("2026-11-15T17:30:00.000Z"))[0] === "2026-11-16",
);
{
  const range = wibWeekRangeUtc(wed);
  check(
    "rentang instan: mulai Ahad 15 Nov 17.00 UTC, selesai Ahad 22 Nov 17.00 UTC",
    range.start.toISOString() === "2026-11-15T17:00:00.000Z" &&
      range.end.toISOString() === "2026-11-22T17:00:00.000Z",
    `${range.start.toISOString()} .. ${range.end.toISOString()}`,
  );
}

// --- Model strip ----------------------------------------------------------------
{
  const strip = buildWeekActivity(wed, new Set(["2026-11-16", "2026-11-18"]));
  check(
    "label hari berurutan Sen..Min",
    strip.days.map((day) => day.weekday).join(",") === "Sen,Sel,Rab,Kam,Jum,Sab,Min",
  );
  check(
    "penanda aktif hanya pada tanggal di himpunan; hitungan 2 dari 7",
    strip.activeCount === 2 &&
      strip.days[0].active === true && strip.days[1].active === false && strip.days[2].active === true,
  );
  check(
    "isToday tepat pada hari ini WIB (Rabu 18) dan hanya di sana",
    strip.days.filter((day) => day.isToday).length === 1 && strip.days[2].isToday === true,
  );
  check(
    "bentuk hari BUKAN streak: field tepat {date, weekday, active, isToday}",
    strip.days.every((day) => Object.keys(day).sort().join(",") === "active,date,isToday,weekday") &&
      !JSON.stringify(strip).toLowerCase().includes("streak"),
  );
  const empty = buildWeekActivity(wed, new Set());
  check(
    "pekan tanpa aktivitas: hitungan 0, semua hari netral tidak aktif",
    empty.activeCount === 0 && empty.days.every((day) => day.active === false),
  );
}

// --- Wiring /murid/today ---------------------------------------------------------
const muridRoutes = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
check(
  "payload /today membawa week_activity dari blok gagal-aman",
  muridRoutes.includes("let weekActivity: WeekActivity | null = null;") &&
    muridRoutes.includes("week_activity: weekActivity,"),
);
check(
  "sumber penanda: baris xp_ledger murid ini, berpoin positif, dalam rentang pekan WIB",
  muridRoutes.includes("gt(xpLedger.points, 0)") &&
    muridRoutes.includes("gte(xpLedger.createdAt, range.start)") &&
    muridRoutes.includes("lt(xpLedger.createdAt, range.end)") &&
    muridRoutes.includes("buildWeekActivity(now, new Set(rows.map((row) => todayWib(row.createdAt))))"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
