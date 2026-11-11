// Tests for deteksi baca terlalu cepat (sisi web): akumulator waktu
// membaca aktif murni, persistensi per (murid, modul), format durasi
// target, dan wiring komponen ReadingProgress + halaman modul.
// Run with bun from apps/web:  bun lib/baca-wajar.test.mjs
//
// Yang dikunci di sini:
//  - createActiveTimeTracker: hanya segmen terlihat yang terhitung;
//    segmen tersembunyi tidak menambah; setInitial memuat simpanan
//    tanpa pernah mengurangi yang sudah terhitung.
//  - Kunci penyimpanan memuat id murid DAN id modul (perangkat dipakai
//    bergantian); nilai rusak → 0; pagar 21600 detik; storage yang
//    melempar tidak menggagalkan apa pun.
//  - formatReadingDuration: "±X dtk" di bawah semenit, "±X menit",
//    dan jam untuk durasi panjang.
//  - Wiring: posting membawa activeSeconds; sebelum reachedBottom
//    tidak ada posting; completed:false memunculkan pemberitahuan
//    persis; posting ulang berkala sesudah ambang; halaman modul
//    meneruskan min_seconds payload + id murid dari /auth/me.
import { readFileSync } from "node:fs";
import {
  MAX_STORED_ACTIVE_SECONDS,
  clearStoredActiveSeconds,
  createActiveTimeTracker,
  formatReadingDuration,
  readStoredActiveSeconds,
  readingTimeStorageKey,
  storeActiveSeconds,
} from "./baca-wajar.ts";

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

// --- Akumulator waktu aktif ---------------------------------------------------
{
  let now = 0;
  const tracker = createActiveTimeTracker(() => now);
  check("tick pertama hanya menetapkan cap (0 detik)", tracker.tick(true) === 0);
  now = 5000;
  check("5 detik terlihat → 5", tracker.tick(true) === 5);
  now = 8000;
  check("segmen terlihat sampai tick penutup tetap terhitung (8)", tracker.tick(false) === 8);
  now = 20000;
  check("12 detik tersembunyi tidak menambah (tetap 8)", tracker.tick(false) === 8);
  check("totalSeconds konsisten dengan tick terakhir", tracker.totalSeconds() === 8);
  tracker.tick(true);
  now = 23000;
  check("terlihat lagi 3 detik → 11", tracker.tick(true) === 11);
}
{
  let now = 1000;
  const tracker = createActiveTimeTracker(() => now);
  tracker.tick(true);
  now = 2500;
  check("1,5 detik terlihat dibulatkan ke bawah (1 detik)", tracker.tick(true) === 1);
  now = 2000; // jam mundur (koreksi waktu perangkat) tidak mengurangi
  check("cap waktu mundur tidak mengurangi akumulasi", tracker.tick(true) === 1);
}
{
  const tracker = createActiveTimeTracker(() => 0);
  tracker.setInitial(120);
  check("setInitial memuat simpanan (120)", tracker.totalSeconds() === 120);
  tracker.setInitial(10);
  check("setInitial lebih kecil tidak mengurangi (tetap 120)", tracker.totalSeconds() === 120);
  const fresh = createActiveTimeTracker(() => 0);
  fresh.setInitial(-5);
  fresh.setInitial(Number.NaN);
  check("setInitial negatif/NaN diperlakukan 0", fresh.totalSeconds() === 0);
}

// --- Persistensi per (murid, modul) ----------------------------------------------
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}
{
  const key = readingTimeStorageKey(17, 42);
  check("kunci memuat id murid dan id modul", key === "simak:baca-wajar:17:42");
  check(
    "kunci berbeda untuk murid/modul berbeda",
    readingTimeStorageKey(18, 42) !== key && readingTimeStorageKey(17, 43) !== key,
  );
  const storage = fakeStorage();
  check("belum ada simpanan → 0", readStoredActiveSeconds(storage, key) === 0);
  storeActiveSeconds(storage, key, 95);
  check("simpan lalu baca kembali (95)", readStoredActiveSeconds(storage, key) === 95);
  storeActiveSeconds(storage, key, -3);
  check("simpan negatif terjepit ke 0", readStoredActiveSeconds(storage, key) === 0);
  storeActiveSeconds(storage, key, 999999);
  check("simpan di atas pagar terjepit ke 21600", readStoredActiveSeconds(storage, key) === MAX_STORED_ACTIVE_SECONDS);
  storage.setItem(key, "bukan-angka");
  check("nilai rusak → 0", readStoredActiveSeconds(storage, key) === 0);
  storage.setItem(key, "77");
  clearStoredActiveSeconds(storage, key);
  check("sesudah dibersihkan → 0", readStoredActiveSeconds(storage, key) === 0);
  const throwing = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
  let threw = false;
  try {
    readStoredActiveSeconds(throwing, key);
    storeActiveSeconds(throwing, key, 10);
    clearStoredActiveSeconds(throwing, key);
  } catch {
    threw = true;
  }
  check("storage yang melempar tidak menggagalkan (baca → 0, tulis/hapus ditelan)", !threw && readStoredActiveSeconds(throwing, key) === 0);
}

// --- Format durasi -----------------------------------------------------------------
check("0 detik → ±0 dtk", formatReadingDuration(0) === "±0 dtk");
check("45 detik → ±45 dtk", formatReadingDuration(45) === "±45 dtk");
check("59 detik → ±59 dtk", formatReadingDuration(59) === "±59 dtk");
check("60 detik → ±1 menit", formatReadingDuration(60) === "±1 menit");
check("90 detik → ±2 menit (dibulatkan)", formatReadingDuration(90) === "±2 menit");
check("180 detik → ±3 menit", formatReadingDuration(180) === "±3 menit");
check("3600 detik → ±1 jam", formatReadingDuration(3600) === "±1 jam");
check("3900 detik → ±1 jam 5 menit", formatReadingDuration(3900) === "±1 jam 5 menit");
check("negatif/NaN → ±0 dtk", formatReadingDuration(-10) === "±0 dtk" && formatReadingDuration(Number.NaN) === "±0 dtk");

// --- Wiring komponen ReadingProgress -------------------------------------------------
const component = readFileSync(new URL("../components/ReadingProgress.tsx", import.meta.url), "utf8");
check(
  "ambang gulir tidak berubah (99,5%)",
  component.includes("const COMPLETE_THRESHOLD = 99.5"),
);
check(
  "posting ketuntasan membawa activeSeconds dari pelacak",
  component.includes('event: "baca_materi_tuntas"') && component.includes("activeSeconds: currentActive"),
);
check(
  "waktu hanya bertambah saat tab terlihat (visibilityState)",
  component.includes('document.visibilityState === "visible"') && component.includes('addEventListener("visibilitychange"'),
);
check(
  "tidak ada posting sebelum akhir tercapai (kedua jalur posting menjaga reachedBottom)",
  component.includes("if (!reachedBottom || serverCompleted || alreadyCompleted || firstPostDoneRef.current)") &&
    component.includes("if (!reachedBottom || serverCompleted || alreadyCompleted) return;"),
);
check(
  "pemberitahuan terlalu cepat memakai teks membimbing yang persis",
  component.includes("Kamu sampai di akhir terlalu cepat untuk benar-benar terbaca. Lanjutkan membaca pelan-pelan — ketuntasan tercatat otomatis dalam"),
);
check(
  "pemeriksaan berkala ±5 detik untuk posting ulang sesudah ambang",
  component.includes("const RECHECK_INTERVAL_MS = 5000") && component.includes("trackerRef.current!.totalSeconds() >= target"),
);
check(
  "persistensi memakai kunci per (murid, modul) dan dibersihkan saat tuntas",
  component.includes("readingTimeStorageKey(studentId, moduleId)") &&
    component.includes("readStoredActiveSeconds(") &&
    component.includes("clearStoredActiveSeconds("),
);
check(
  "target waktu tampil dari minSeconds payload",
  component.includes("Target membaca materi ini") && component.includes("formatReadingDuration(minSeconds)"),
);
check(
  "respons lama tanpa field completed diperlakukan tuntas (kompatibilitas)",
  component.includes("response.completed !== false"),
);

// --- Wiring halaman modul ----------------------------------------------------------------
const page = readFileSync(new URL("../app/murid/modules/[id]/page.tsx", import.meta.url), "utf8");
check(
  "halaman meneruskan min_seconds payload reading ke ReadingProgress",
  page.includes("minSeconds={data.reading?.min_seconds ?? null}") && page.includes("reading: { word_count: number; min_seconds: number }"),
);
check(
  "halaman mengambil id murid dari /auth/me untuk kunci persistensi",
  page.includes('apiRequest<MeResponse>("/auth/me")') && page.includes("studentId={studentId}"),
);

console.log(`\nWeb baca-wajar: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
