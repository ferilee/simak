// Tests for deteksi baca terlalu cepat (gerbang keplausiban ketuntasan
// membaca): hitung kata konservatif per bentuk blok nyata, ambang
// waktu minimum, rencana ketuntasan, skema activeSeconds, dan wiring
// gerbang di routes/activity + payload reading GET /murid/modules/:id.
// Run with bun from apps/api:  bun src/lib/baca-wajar.test.mjs
//
// Yang dikunci di sini:
//  - Ambang: 300 kata/menit dengan lantai 30 detik (minReadingSeconds
//    pada 0/150/151/300/3000 kata), tanpa batas maksimum.
//  - countMaterialWords konservatif per jenis blok nyata module_blocks
//    (teks Markdown/HTML, sub_bab, keterangan gambar/video, berkas 0)
//    dan tidak pernah melempar pada konten rusak.
//  - planCompletion: di bawah ambang belum tuntas + sisa detik yang
//    tepat; tepat/pada/di atas ambang tuntas.
//  - activitySchema menerima activeSeconds opsional 0..21600 untuk
//    baca_materi_tuntas dan menolak di luar rentang; kejadian lain
//    tidak berubah syaratnya.
//  - Wiring: cabang tuntas routes/activity memeriksa catatan lama
//    (tuntas tanpa insert/XP ulang), di bawah ambang menjawab
//    completed:false + remaining_seconds TANPA insert, mencapai
//    ambang baru insert lalu awardXp; cabang kejadian lain utuh.
//  - GET /murid/modules/:id membawa reading { word_count, min_seconds }.
//  - Paket ini TANPA migrasi: jurnal tetap 18 entri berakhir di 0017.
import { readFileSync } from "node:fs";
import { activitySchema } from "@simak/shared";
import {
  MAX_PLAUSIBLE_WPM,
  MIN_FLOOR_SECONDS,
  countMaterialWords,
  minReadingSeconds,
  planCompletion,
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

// --- Konstanta & ambang ----------------------------------------------------
check("laju wajar tertinggi = 300 kata/menit", MAX_PLAUSIBLE_WPM === 300);
check("lantai mutlak = 30 detik", MIN_FLOOR_SECONDS === 30);
check("0 kata → lantai 30 detik", minReadingSeconds(0) === 30);
check("150 kata → 30 detik (tepat di lantai)", minReadingSeconds(150) === 30);
check("151 kata → 31 detik (naik dari lantai)", minReadingSeconds(151) === 31);
check("300 kata → 60 detik", minReadingSeconds(300) === 60);
check("3000 kata → 600 detik", minReadingSeconds(3000) === 600);
check("kata negatif → lantai 30 detik", minReadingSeconds(-50) === 30);
check("kata desimal dibulatkan ke bawah dulu (299,9 → 299 kata → 60 detik)", minReadingSeconds(299.9) === 60);

// --- planCompletion ---------------------------------------------------------
const below = planCompletion({ wordCount: 300, activeSeconds: 59 });
check("59 dari 60 detik → belum tuntas, sisa 1", below.completed === false && below.minSeconds === 60 && below.remainingSeconds === 1);
const exact = planCompletion({ wordCount: 300, activeSeconds: 60 });
check("tepat 60 detik → tuntas, sisa 0", exact.completed === true && exact.remainingSeconds === 0);
const above = planCompletion({ wordCount: 300, activeSeconds: 900 });
check("di atas ambang → tuntas, sisa 0 (tak pernah negatif)", above.completed === true && above.remainingSeconds === 0);
const floorBelow = planCompletion({ wordCount: 0, activeSeconds: 29 });
check("materi kosong pun tunduk lantai: 29 detik belum tuntas", floorBelow.completed === false && floorBelow.remainingSeconds === 1);
const floorExact = planCompletion({ wordCount: 0, activeSeconds: 30 });
check("materi kosong: 30 detik tuntas", floorExact.completed === true);
const absent = planCompletion({ wordCount: 300, activeSeconds: Number.NaN });
check("activeSeconds NaN diperlakukan 0 → belum tuntas, sisa penuh", absent.completed === false && absent.remainingSeconds === 60);
const negative = planCompletion({ wordCount: 300, activeSeconds: -10 });
check("activeSeconds negatif diperlakukan 0", negative.completed === false && negative.remainingSeconds === 60);

// --- countMaterialWords: blok teks Markdown ---------------------------------
const markdownBlock = {
  type: "teks",
  content: {
    format: "markdown",
    markdown: [
      "# Barisan Aritmetika",
      "",
      "Suku pertama **a** dan beda *b* menentukan suku.",
      "",
      "Rumus suku ke-n: $U_n = a + (n-1)b$",
      "",
      "- satu",
      "- dua",
    ].join("\n"),
    html: "<p>html ini tidak dipakai bila markdown ada</p>",
  },
};
check(
  "teks markdown: heading/penekanan dibuang, LaTeX terhitung, markdown menang atas html (18 kata)",
  countMaterialWords([markdownBlock]) === 18,
  `dapat ${countMaterialWords([markdownBlock])}`,
);
check(
  "tautan markdown → teks tampilnya (4 kata); gambar markdown dibuang (0 kata)",
  countMaterialWords([{ type: "teks", content: { markdown: "Baca [materi lengkap](https://example.com) sekarang" } }]) === 4 &&
    countMaterialWords([{ type: "teks", content: { markdown: "![diagram alur](https://x/y.png)" } }]) === 0,
);
check(
  "tabel markdown: pipa & garis pemisah bukan kata (4 kata)",
  countMaterialWords([{ type: "teks", content: { markdown: "| Nama | Nilai |\n| --- | --- |\n| Ani | 90 |" } }]) === 4,
);
check(
  "blok kode berpagar: pagar dibuang, isi kode terhitung (3 kata)",
  countMaterialWords([{ type: "teks", content: { markdown: "```js\nconst x = 1;\n```" } }]) === 3,
);
check(
  "rumus LaTeX tampil $$..$$ terhitung sebagai token kata (3 kata)",
  countMaterialWords([{ type: "teks", content: { markdown: "$$x^2 + y^2 = z^2$$" } }]) === 3,
);

// --- countMaterialWords: blok teks HTML (rich text) --------------------------
check(
  "teks html saja: tag dibuang, entitas dibuang (3 kata)",
  countMaterialWords([{ type: "teks", content: { html: "<p>Halo <strong>dunia</strong> &amp; semua</p>" } }]) === 3,
);
check(
  "teks html kosong / tanpa field → 0",
  countMaterialWords([{ type: "teks", content: { html: "" } }]) === 0 &&
    countMaterialWords([{ type: "teks", content: {} }]) === 0,
);

// --- countMaterialWords: jenis blok lain --------------------------------------
check(
  "sub_bab: judulnya saja (3 kata)",
  countMaterialWords([{ type: "sub_bab", content: { title: "Bab 1: Eksponen" } }]) === 3,
);
check(
  "gambar & video: keterangan terhitung (3 kata)",
  countMaterialWords([{ type: "gambar", content: { attachmentKey: "k", caption: "Grafik fungsi eksponen" } }]) === 3 &&
    countMaterialWords([{ type: "video", content: { youtubeUrl: "https://youtu.be/x", caption: "Grafik fungsi eksponen" } }]) === 3,
);
check(
  "gambar tanpa keterangan → 0",
  countMaterialWords([{ type: "gambar", content: { attachmentKey: "k" } }]) === 0,
);
check(
  "berkas: label bukan prosa → 0",
  countMaterialWords([{ type: "berkas", content: { attachmentKey: "k", label: "Unduh berkas PDF latihan" } }]) === 0,
);
check(
  "jenis tak dikenal, konten null, dan daftar kosong → 0 tanpa melempar",
  countMaterialWords([{ type: "kuis", content: { html: "<p>halo dunia</p>" } }]) === 0 &&
    countMaterialWords([{ type: "teks", content: null }]) === 0 &&
    countMaterialWords([]) === 0,
);
check(
  "gabungan blok dijumlahkan (sub_bab 3 + teks 3 + berkas 0 = 6)",
  countMaterialWords([
    { type: "sub_bab", content: { title: "Bab 1: Eksponen" } },
    { type: "teks", content: { html: "<p>satu dua tiga</p>" } },
    { type: "berkas", content: { attachmentKey: "k", label: "Unduh" } },
  ]) === 6,
);

// --- Skema bersama: activeSeconds ---------------------------------------------
check(
  "skema menerima baca_materi_tuntas dengan activeSeconds",
  activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7, activeSeconds: 120 }).success === true,
);
check(
  "skema tetap menerima baca_materi_tuntas tanpa activeSeconds",
  activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7 }).success === true,
);
check(
  "skema menerima activeSeconds pada batas 0 dan 21600",
  activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7, activeSeconds: 0 }).success === true &&
    activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7, activeSeconds: 21600 }).success === true,
);
check(
  "skema menolak activeSeconds -1, 21601, dan desimal",
  activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7, activeSeconds: -1 }).success === false &&
    activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7, activeSeconds: 21601 }).success === false &&
    activitySchema.safeParse({ event: "baca_materi_tuntas", moduleId: 7, activeSeconds: 1.5 }).success === false,
);
check(
  "kejadian lain tidak berubah: berbasis penugasan tetap wajib assignmentId",
  activitySchema.safeParse({ event: "kumpul", assignmentId: 3 }).success === true &&
    activitySchema.safeParse({ event: "kumpul" }).success === false &&
    activitySchema.safeParse({ event: "baca_materi_tuntas" }).success === false,
);

// --- Wiring routes/activity.ts --------------------------------------------------
const activityRoute = readFileSync(new URL("../routes/activity.ts", import.meta.url), "utf8");
const tuntasStart = activityRoute.indexOf('input.event === "baca_materi_tuntas"');
const tuntasEnd = activityRoute.indexOf("const [assignment] = await db");
const tuntas = activityRoute.slice(tuntasStart, tuntasEnd);

check(
  "cabang tuntas menghitung kata dari blok modul (countMaterialWords + moduleBlocks)",
  tuntas.includes("countMaterialWords(") && tuntas.includes("moduleBlocks") && tuntas.includes("planCompletion("),
);
check(
  "catatan lama dijawab completed:true TANPA insert (idempoten lama dipertahankan)",
  tuntas.includes("if (existing)") &&
    tuntas.indexOf("if (existing)") < tuntas.indexOf("db.insert(activityLogs)") &&
    tuntas.includes("active_seconds: activeSeconds"),
);
const idxBelowReturn = tuntas.indexOf("remaining_seconds");
const idxInsert = tuntas.indexOf("db.insert(activityLogs)");
check(
  "di bawah ambang: completed:false + remaining_seconds dijawab SEBELUM satu-satunya insert",
  tuntas.includes("completed: false") && idxBelowReturn !== -1 && idxInsert !== -1 && idxBelowReturn < idxInsert,
);
check(
  "satu-satunya insert catatan tuntas tetap diikuti awardXp materi_tuntas",
  tuntas.split("db.insert(activityLogs)").length - 1 === 1 &&
    tuntas.indexOf('awardXp(user.userId, "materi_tuntas", moduleId)') > idxInsert,
);
check(
  "cabang kejadian lain utuh: insert peristiwa berbasis penugasan + return { ok: true } polos",
  activityRoute.slice(tuntasEnd).includes("event: input.event") &&
    activityRoute.slice(tuntasEnd).includes("return c.json({ ok: true });"),
);

// --- Wiring GET /murid/modules/:id ----------------------------------------------
const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
const moduleGetStart = muridRoute.indexOf('muridRoutes.get("/modules/:id"');
const moduleGetEnd = muridRoute.indexOf('muridRoutes.get("/worksheets/:id"');
const moduleGet = muridRoute.slice(moduleGetStart, moduleGetEnd);
check(
  "GET modul membawa reading { word_count, min_seconds } dari blok yang sama",
  moduleGet.includes("reading:") && moduleGet.includes("word_count: wordCount") &&
    moduleGet.includes("min_seconds: minReadingSeconds(wordCount)") && moduleGet.includes("countMaterialWords("),
);
check(
  "material_completed pada GET modul tidak berubah predikatnya",
  moduleGet.includes("material_completed: materialCompleted") && moduleGet.includes('eq(activityLogs.event, "baca_materi_tuntas")'),
);

// --- Tanpa migrasi ---------------------------------------------------------------
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
check(
  "paket tanpa migrasi: entri 0017_avatar_murid tetap di idx 17 (jurnal kini 19 entri)",
  journal.entries.length === 19 && journal.entries[17].tag === "0017_avatar_murid",
);

console.log(`\nAPI baca-wajar: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
