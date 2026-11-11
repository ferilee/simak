// Tests for daftar CP & ATP (kurikulum): integritas data referensi
// kurikulum terhadap dokumen sumbernya, perilaku pencari set, dan wiring
// route-nya di app.
// Run with bun from apps/api:  bun src/lib/kurikulum.test.mjs
//
// Latar: Tahap 1 menampilkan CP & ATP di ruang kerja guru persis seperti
// dokumen kurikulum yang disetujui — datanya tinggal di kode (bukan
// tabel) dan terbit bersama rilis. Uji integritas di sini adalah penjaga
// utamanya: total JP dan jumlah ATP tiap set dikunci ke angka dokumen
// sumber (ATP Matematika Kelas X/XI; ATP KKA Kelas X yang disetujui
// 3 Nov 2026), jadi suntingan data yang keliru ketahuan di sini, bukan
// di layar guru. Catatan jujur: dokumen KKA menyebut "44 ATP" pada
// kakinya, tetapi baris yang terenumerasi di badannya 43 (6+12+6 ganjil,
// 6+6+7 genap) — data mengikuti baris terenumerasi; total JP-nya cocok
// persis (52 + 44 = 96).
import { readFileSync } from "node:fs";
import {
  CURRICULUM_SETS,
  curriculumSetTotals,
  findCurriculumCp,
  findCurriculumSet,
  listCurriculumSummaries,
  listTopicGroups,
  topicGroupsForSubject,
} from "./kurikulum.ts";

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

// --- Bentuk keseluruhan -------------------------------------------------
check("tepat enam set (Matematika X/XI × 2 semester, KKA X × 2 semester)", CURRICULUM_SETS.length === 6);
const identities = new Set(CURRICULUM_SETS.map((s) => `${s.subject}|${s.grade}|${s.semester}`));
check("identitas set (mapel, kelas, semester) unik", identities.size === CURRICULUM_SETS.length);

// --- Total per set dikunci ke dokumen sumber ----------------------------
const EXPECTED = new Map([
  ["Matematika|Kelas X|Ganjil", { atpCount: 29, totalJp: 58 }],
  ["Matematika|Kelas X|Genap", { atpCount: 21, totalJp: 42 }],
  ["Matematika|Kelas XI|Ganjil", { atpCount: 15, totalJp: 45 }],
  ["Matematika|Kelas XI|Genap", { atpCount: 12, totalJp: 36 }],
  ["KKA|Kelas X|Ganjil", { atpCount: 24, totalJp: 52 }],
  ["KKA|Kelas X|Genap", { atpCount: 19, totalJp: 44 }],
]);
for (const set of CURRICULUM_SETS) {
  const key = `${set.subject}|${set.grade}|${set.semester}`;
  const expected = EXPECTED.get(key);
  const totals = curriculumSetTotals(set);
  check(
    `total ${key} = ${expected.atpCount} ATP / ${expected.totalJp} JP`,
    totals.atpCount === expected.atpCount && totals.totalJp === expected.totalJp,
    `aktual ${totals.atpCount} ATP / ${totals.totalJp} JP`,
  );
}

// --- Integritas isi tiap set ---------------------------------------------
for (const set of CURRICULUM_SETS) {
  const label = `${set.subject} ${set.grade} ${set.semester}`;
  const codes = set.groups.flatMap((g) => g.atps.map((a) => a.code));
  check(`${label}: nomor ATP unik di dalam set`, new Set(codes).size === codes.length);
  check(
    `${label}: semua rumusan ATP berbentuk "Peserta didik dapat …" dan JP > 0`,
    set.groups.every((g) => g.atps.every((a) => a.text.startsWith("Peserta didik dapat") && a.jp > 0)),
  );
  check(
    `${label}: setiap kelompok menunjuk CP yang ada di set`,
    set.groups.every((g) => findCurriculumCp(set, g.cpCode) !== null),
  );
  const referenced = new Set(set.groups.map((g) => g.cpCode));
  check(
    `${label}: setiap CP di set dirujuk minimal satu kelompok`,
    set.cps.every((cp) => referenced.has(cp.code)),
  );
}

// --- Pencari set -----------------------------------------------------------
const xGanjil = findCurriculumSet("Matematika", "Kelas X", "Ganjil");
const xGenap = findCurriculumSet("Matematika", "Kelas X", "Genap");
check("pencari menemukan set yang diminta", xGanjil !== null && xGenap !== null);
check(
  "semester adalah identitas: ATP 1.1 X Ganjil = Eksponen, X Genap = Trigonometri",
  xGanjil.groups[0].atps[0].text.includes("pangkat pecahan") &&
    xGenap.groups[0].atps[0].text.includes("sinus, cosinus, dan tangen"),
);
check(
  "pencari toleran spasi di tepi parameter",
  findCurriculumSet(" Matematika ", " Kelas X ", " Ganjil ") === xGanjil,
);
check("set yang belum ada datanya → null (bukan set kosong)", findCurriculumSet("Matematika", "Kelas XII", "Ganjil") === null);
check("mapel yang belum ada datanya → null", findCurriculumSet("Bahasa Indonesia", "Kelas X", "Ganjil") === null);

// --- Ringkasan untuk pemilih di web ---------------------------------------
const summaries = listCurriculumSummaries();
check("ringkasan memuat enam set", summaries.length === 6);
const kkaTotalJp = summaries.filter((s) => s.subject === "KKA").reduce((sum, s) => sum + s.totalJp, 0);
check("total JP KKA lintas semester = 96 (dokumen yang disetujui)", kkaTotalJp === 96);
check(
  "ringkasan membawa hitungan kelompok/ATP/JP yang sama dengan set-nya",
  summaries.every((s) => {
    const set = findCurriculumSet(s.subject, s.grade, s.semester);
    const totals = curriculumSetTotals(set);
    return s.groupCount === set.groups.length && s.atpCount === totals.atpCount && s.totalJp === totals.totalJp;
  }),
);

// --- Wiring route -----------------------------------------------------------
const appSource = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
check("app.ts memasang route /kurikulum", appSource.includes('v1.route("/kurikulum", kurikulumRoutes)'));
const routeSource = readFileSync(new URL("../routes/kurikulum.ts", import.meta.url), "utf8");
check(
  "ketiga route kurikulum khusus guru",
  (routeSource.match(/, requireRole\("guru"\),/g) ?? []).length === 3,
);
check("route kurikulum baca-saja: tanpa akses basis data", !routeSource.includes("@simak/db"));

// --- Daftar kelompok materi untuk dropdown modul -------------------------
const topicGroups = listTopicGroups();
check(
  "daftar kelompok memuat Matematika (14 kelompok) dan KKA (6 kelompok)",
  topicGroups.find((e) => e.subject === "Matematika")?.groups.length === 14 &&
    topicGroups.find((e) => e.subject === "KKA")?.groups.length === 6,
);
check(
  "urutan kelompok Matematika mengikuti kurikulum (Eksponen pertama, Peluang Bersyarat terakhir)",
  topicGroups.find((e) => e.subject === "Matematika")?.groups[0] === "Eksponen" &&
    topicGroups.find((e) => e.subject === "Matematika")?.groups.at(-1) === "Peluang Bersyarat",
);
check(
  "mapel bebas 'Koding dan Kecerdasan Artifisial (KKA)' cocok ke kelompok KKA",
  topicGroupsForSubject("Koding dan Kecerdasan Artifisial (KKA)").includes("Berpikir Komputasional"),
);
check(
  "mapel bebas 'Matematika' cocok ke kelompok Matematika",
  topicGroupsForSubject("Matematika").includes("Matematika Keuangan"),
);
check("mapel tak dikenal → daftar kelompok kosong", topicGroupsForSubject("Bahasa Indonesia").length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
