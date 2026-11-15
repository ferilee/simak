// Tests for urutan ATP + kunci berurutan penugasan murid
// (lib/rantai-penugasan.ts): perencana murni rantai/urutan/kunci,
// pemuatannya di /murid/today, dan penegakan servernya.
// Run with bun from apps/api:  bun src/lib/rantai-penugasan.test.mjs
//
// Yang dikunci di sini:
//  - Nomor ATP diturunkan dari judul modul dengan pola yang sama
//    dengan pemilih cepat guru (parseAtpCode sisi web): "ATP x.y",
//    dibandingkan numerik per komponen (2.10 > 2.9).
//  - Rantai = (mapel modul, topic_group modul); syarat masuk: modul
//    tertaut + topic_group terisi dan bukan "Lainnya" + nomor ATP ada.
//    Nomor ATP sama di mapel berbeda TIDAK satu rantai.
//  - SELESAI = materi tuntas DAN attempt LKPD terkumpul (syarat yang
//    tidak berlaku — tanpa modul / tanpa LKPD — tidak menghalangi;
//    exit ticket tidak ikut dihitung sama sekali).
//  - Kunci: pertama rantai tak pernah terkunci; yang belum-selesai
//    mengunci berikutnya; penghambat yang dilaporkan adalah yang
//    terawal belum selesai; selesai membuka berikutnya; penugasan
//    selesai tidak pernah terkunci; penugasan bebas tidak pernah
//    terkunci dan tidak mengunci siapa pun.
//  - Urutan global: rantai menurut tenggat belum-selesai terawalnya,
//    rantai tuntas sesudahnya, penugasan bebas terakhir menurut
//    tenggat; posisi 1-based berurutan.
//  - Kunci modul (akses tanpa konteks penugasan): terkunci hanya bila
//    SEMUA penugasan bermodul itu terkunci.
//  - Wiring: /today membangun rencana dari data termuat + mengirim
//    field rencana; GET /murid/modules/:id, resolusi attempt LKPD,
//    dan pencatatan baca_materi_tuntas memanggil pemeriksaan kunci.
//  - Paket ini TANPA migrasi: jurnal kini 21 entri berakhir di 0020.
import { readFileSync } from "node:fs";
import {
  assignmentLockedMessage,
  atpLabelOf,
  chainKeyOf,
  moduleLockedMessage,
  parseAtpParts,
  planAssignmentChains,
  planForAssignment,
  planModuleLock,
  planModuleRepresentative,
} from "./rantai-penugasan.ts";

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

// Pembangun masukan ringkas: bawaan = penugasan bermodul Eksponen
// Matematika ATP 1.1 yang belum selesai sama sekali.
let nextId = 1;
function input(overrides = {}) {
  return {
    id: nextId++,
    title: `Tugas ${nextId}`,
    moduleId: 100,
    worksheetId: 200,
    moduleTitle: "Sifat Eksponen (ATP 1.1)",
    moduleSubject: "Matematika",
    topicGroup: "Eksponen",
    dueAtMs: 1_000_000,
    opensAtMs: 0,
    materialCompleted: false,
    attemptSubmitted: false,
    ...overrides,
  };
}
const done = { materialCompleted: true, attemptSubmitted: true };

function byId(plan, id) {
  return plan.find((item) => item.id === id);
}

console.log("Kasus A: penurunan nomor ATP dari judul modul");
{
  const parts = parseAtpParts("Sifat Eksponen dengan Pangkat Rasional — Eksponen (ATP 1.2)");
  check("pola (ATP 1.2) pada judul modul terbaca", parts?.major === 1 && parts?.minor === 2 && parts?.code === "1.2", JSON.stringify(parts));
  check("pola ATP pada judul LKPD terbaca", parseAtpParts("LKPD ATP 2.4 — Anuitas")?.code === "2.4");
  check("huruf kecil ikut terbaca", parseAtpParts("materi atp 3.1")?.code === "3.1");
  check("tanpa pola ATP → null", parseAtpParts("Materi bebas tanpa kode") === null);
  check("judul null → null", parseAtpParts(null) === null);
  check("label ATP", atpLabelOf("(ATP 1.2)") === "ATP 1.2" && atpLabelOf("tanpa kode") === null);
}

console.log("Kasus B: pengelompokan rantai");
{
  nextId = 1;
  const a12 = input({ title: "Tugas 1.2", moduleTitle: "Eksponen (ATP 1.2)", dueAtMs: 3000 });
  const a11 = input({ title: "Tugas 1.1", moduleTitle: "Eksponen (ATP 1.1)", dueAtMs: 2000 });
  const a13 = input({ title: "Tugas 1.3", moduleTitle: "Eksponen (ATP 1.3)", dueAtMs: 4000 });
  const plan = planAssignmentChains([a12, a13, a11]);
  check(
    "di dalam rantai urut menaik menurut ATP walau masukan acak",
    plan.map((item) => item.id).join(",") === [a11.id, a12.id, a13.id].join(","),
    plan.map((item) => item.id).join(","),
  );
  check("posisi 1-based berurutan", plan.map((item) => item.position).join(",") === "1,2,3");
  check("kunci rantai = mapel|kelompok", plan[0].chainKey === "Matematika|Eksponen", String(plan[0].chainKey));
  check("label ATP per penugasan", plan[1].atpLabel === "ATP 1.2" && plan[1].atpCode === "1.2");
}
{
  nextId = 1;
  // ATP sama, mapel berbeda (Matematika vs KKA): dua rantai berbeda,
  // yang belum selesai di satu mapel TIDAK mengunci mapel lain.
  const mat = input({ title: "Mat 1.1", moduleTitle: "Eksponen (ATP 1.1)", moduleSubject: "Matematika", topicGroup: "Eksponen", dueAtMs: 1000 });
  const mat2 = input({ title: "Mat 1.2", moduleTitle: "Eksponen (ATP 1.2)", moduleSubject: "Matematika", topicGroup: "Eksponen", dueAtMs: 2000 });
  const kka = input({ title: "KKA 1.1", moduleTitle: "Berpikir Komputasional (ATP 1.1)", moduleSubject: "KKA", topicGroup: "Berpikir Komputasional", dueAtMs: 1500, ...done });
  const kka2 = input({ title: "KKA 1.2", moduleTitle: "Berpikir Komputasional (ATP 1.2)", moduleSubject: "KKA", topicGroup: "Berpikir Komputasional", dueAtMs: 2500 });
  const plan = planAssignmentChains([mat, mat2, kka, kka2]);
  check("ATP sama beda mapel = rantai berbeda", byId(plan, mat.id).chainKey !== byId(plan, kka.id).chainKey);
  check("KKA 1.2 tidak terkunci oleh Matematika 1.1 yang belum selesai", byId(plan, kka2.id).locked === false);
  check("Matematika 1.2 terkunci oleh Matematika 1.1", byId(plan, mat2.id).locked === true && byId(plan, mat2.id).lockedByTitle === "Mat 1.1");
}
{
  nextId = 1;
  const lainnya = input({ title: "Bebas Lainnya", topicGroup: "Lainnya", dueAtMs: 500 });
  const tanpaGrup = input({ title: "Bebas tanpa grup", topicGroup: null, dueAtMs: 600 });
  const grupKosong = input({ title: "Bebas grup kosong", topicGroup: "  ", dueAtMs: 700 });
  const tanpaAtp = input({ title: "Bebas tanpa ATP", moduleTitle: "Materi Pengayaan", dueAtMs: 800 });
  const tanpaModul = input({ title: "Bebas tanpa modul", moduleId: null, moduleTitle: null, moduleSubject: null, topicGroup: null, dueAtMs: 900 });
  const rantai = input({ title: "Rantai 1.1", dueAtMs: 5000 });
  const plan = planAssignmentChains([lainnya, tanpaGrup, grupKosong, tanpaAtp, tanpaModul, rantai]);
  for (const free of [lainnya, tanpaGrup, grupKosong, tanpaAtp, tanpaModul]) {
    const planned = byId(plan, free.id);
    check(`bebas (${free.title}): tanpa rantai, tak terkunci`, planned.chainKey === null && planned.locked === false);
  }
  check(
    "penugasan bebas sesudah rantai walau tenggatnya lebih awal",
    plan[plan.length - 1].id !== rantai.id && byId(plan, rantai.id).position === 1,
    `posisi rantai=${byId(plan, rantai.id).position}`,
  );
  check(
    "bebas diurutkan menurut tenggat terdekat",
    plan.slice(1).map((item) => item.id).join(",") === [lainnya.id, tanpaGrup.id, grupKosong.id, tanpaAtp.id, tanpaModul.id].join(","),
  );
  check("label ATP tetap tampil pada modul berkode walau bebas", byId(plan, lainnya.id).atpLabel === "ATP 1.1");
}

console.log("Kasus C: definisi selesai");
{
  nextId = 1;
  const full = input({ ...done });
  const noMaterial = input({ attemptSubmitted: true });
  const noAttempt = input({ materialCompleted: true });
  const noWorksheet = input({ worksheetId: null, materialCompleted: true });
  const noModuleNoWorksheet = input({ moduleId: null, worksheetId: null, moduleTitle: null, moduleSubject: null, topicGroup: null });
  const plan = planAssignmentChains([full, noMaterial, noAttempt, noWorksheet, noModuleNoWorksheet]);
  check("materi tuntas + attempt terkumpul = selesai", byId(plan, full.id).completed === true);
  check("attempt saja tanpa materi = belum selesai", byId(plan, noMaterial.id).completed === false);
  check("materi saja tanpa attempt = belum selesai", byId(plan, noAttempt.id).completed === false);
  check("tanpa LKPD: materi tuntas saja cukup", byId(plan, noWorksheet.id).completed === true);
  check("tanpa modul dan tanpa LKPD: tidak ada syarat (selesai)", byId(plan, noModuleNoWorksheet.id).completed === true);
}

console.log("Kasus D: komputasi kunci");
{
  nextId = 1;
  const a11 = input({ title: "Penghambat", moduleTitle: "Eksponen (ATP 1.1)", dueAtMs: 1000 });
  const a12 = input({ title: "Kedua", moduleTitle: "Eksponen (ATP 1.2)", dueAtMs: 2000 });
  const a13 = input({ title: "Ketiga", moduleTitle: "Eksponen (ATP 1.3)", dueAtMs: 3000 });
  const plan = planAssignmentChains([a11, a12, a13]);
  check("pertama rantai tidak pernah terkunci", byId(plan, a11.id).locked === false);
  check("kedua terkunci oleh pertama", byId(plan, a12.id).locked === true && byId(plan, a12.id).lockedById === a11.id);
  check("ketiga: penghambat yang dilaporkan adalah yang TERAWAL belum selesai", byId(plan, a13.id).lockedByTitle === "Penghambat");
}
{
  nextId = 1;
  const a11 = input({ title: "Satu", moduleTitle: "Eksponen (ATP 1.1)", dueAtMs: 1000, ...done });
  const a12 = input({ title: "Dua", moduleTitle: "Eksponen (ATP 1.2)", dueAtMs: 2000 });
  const a13 = input({ title: "Tiga", moduleTitle: "Eksponen (ATP 1.3)", dueAtMs: 3000 });
  const plan = planAssignmentChains([a11, a12, a13]);
  check("selesai membuka berikutnya", byId(plan, a12.id).locked === false);
  check("penghambat bergeser ke yang terawal belum selesai berikutnya", byId(plan, a13.id).locked === true && byId(plan, a13.id).lockedByTitle === "Dua");
}
{
  nextId = 1;
  // Data lama: ATP 1.2 terlanjur selesai walau 1.1 belum — yang selesai
  // tidak boleh ikut terkunci (tetap bisa dibaca ulang).
  const a11 = input({ title: "Satu", moduleTitle: "Eksponen (ATP 1.1)", dueAtMs: 1000 });
  const a12 = input({ title: "Dua", moduleTitle: "Eksponen (ATP 1.2)", dueAtMs: 2000, ...done });
  const plan = planAssignmentChains([a11, a12]);
  check("penugasan selesai tidak pernah terkunci walau pendahulu belum", byId(plan, a12.id).locked === false && byId(plan, a12.id).completed === true);
}
{
  nextId = 1;
  // Perbandingan ATP numerik per komponen: 2.10 sesudah 2.9.
  const a29 = input({ title: "2.9", moduleTitle: "Topik (ATP 2.9)", topicGroup: "Topik", dueAtMs: 1000, ...done });
  const a210 = input({ title: "2.10", moduleTitle: "Topik (ATP 2.10)", topicGroup: "Topik", dueAtMs: 2000 });
  const plan = planAssignmentChains([a210, a29]);
  check("ATP dibandingkan numerik (2.9 sebelum 2.10)", plan[0].id === a29.id && plan[1].id === a210.id);
  check("2.10 terbuka karena 2.9 selesai", byId(plan, a210.id).locked === false);
}

console.log("Kasus E: urutan antar-rantai");
{
  nextId = 1;
  // Rantai X tenggat belum-selesai terawalnya lebih lambat dari rantai
  // Y → Y lebih dulu. Rantai Z semua selesai → sesudah keduanya.
  const x1 = input({ title: "X1", moduleTitle: "X (ATP 1.1)", moduleSubject: "Matematika", topicGroup: "X", dueAtMs: 9000 });
  const y1 = input({ title: "Y1", moduleTitle: "Y (ATP 1.1)", moduleSubject: "Matematika", topicGroup: "Y", dueAtMs: 3000 });
  const z1 = input({ title: "Z1", moduleTitle: "Z (ATP 1.1)", moduleSubject: "Matematika", topicGroup: "Z", dueAtMs: 1000, ...done });
  const plan = planAssignmentChains([x1, y1, z1]);
  check(
    "rantai paling mendesak dulu, rantai tuntas terakhir",
    plan.map((item) => item.id).join(",") === [y1.id, x1.id, z1.id].join(","),
    plan.map((item) => item.title).join(","),
  );
}

console.log("Kasus F: kunci modul + wakil modul");
{
  nextId = 1;
  const a11 = input({ title: "Penghambat", moduleId: 100, moduleTitle: "Eksponen (ATP 1.1)", dueAtMs: 1000 });
  const a12 = input({ title: "Terkunci", moduleId: 101, moduleTitle: "Eksponen (ATP 1.2)", dueAtMs: 2000 });
  const a12b = input({ title: "Jalur lain modul sama", moduleId: 101, moduleTitle: "Eksponen (ATP 1.2)", dueAtMs: 2500, topicGroup: "Lainnya" });
  const plan = planAssignmentChains([a11, a12, a12b]);
  const lock101 = planModuleLock(plan, 101);
  check("modul dengan satu penugasan tak terkunci → modul tidak terkunci", lock101.locked === false);
  const planTanpaJalur = planAssignmentChains([a11, a12]);
  const lockTerkunci = planModuleLock(planTanpaJalur, 101);
  check("semua penugasan bermodul terkunci → modul terkunci + penghambatnya", lockTerkunci.locked === true && lockTerkunci.lockedByTitle === "Penghambat");
  check("modul tanpa penugasan pada daftar → tidak terkunci", planModuleLock(planTanpaJalur, 999).locked === false);
  check("wakil modul = posisi terawal penugasan bermodul itu", planModuleRepresentative(plan, 101)?.id === a12.id);
  check("planForAssignment menemukan / mengembalikan null", planForAssignment(plan, a11.id)?.id === a11.id && planForAssignment(plan, 424242) === null);
  check("pesan kunci menyebut penghambat", assignmentLockedMessage("Penghambat").includes("Penghambat") && moduleLockedMessage("Penghambat").includes("Penghambat"));
  check("kunci rantai kosong bila mapel/kelompok kosong", chainKeyOf("", "Eksponen") === null && chainKeyOf("Matematika", " ") === null);
}

console.log("Kasus G: wiring server");
{
  const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
  const activityRoute = readFileSync(new URL("../routes/activity.ts", import.meta.url), "utf8");

  const todayStart = muridRoute.indexOf('muridRoutes.get("/today"');
  const todayEnd = muridRoute.indexOf('muridRoutes.post("/welcome/seen"');
  const today = muridRoute.slice(todayStart, todayEnd);
  check("wilayah /today ditemukan", todayStart >= 0 && todayEnd > todayStart);
  check("/today membangun rencana dari perencana rantai", today.includes("planAssignmentChains("));
  check(
    "/today mengirim field rencana lengkap",
    ["position: planned?.position", "atp_label: planned?.atpLabel", "chain_key: planned?.chainKey", "completed: planned?.completed", "locked: planned?.locked", "locked_by_title: planned?.lockedByTitle"].every((needle) => today.includes(needle)),
  );
  check("/today mengurutkan penugasan menurut posisi rencana", today.includes("planByAssignmentId.get(a.id)?.position"));
  check(
    "/today menandai + mengurutkan modul dari rencana",
    today.includes("planModuleRepresentative(assignmentPlan, module.id)") && today.includes("planModuleLock(assignmentPlan, module.id)") && today.includes("locked: lock.locked") && today.includes("locked_by_title: lock.lockedByTitle"),
  );

  const moduleStart = muridRoute.indexOf('muridRoutes.get("/modules/:id"');
  const moduleEnd = muridRoute.indexOf('muridRoutes.get("/worksheets/:id"');
  const moduleRoute = muridRoute.slice(moduleStart, moduleEnd);
  check("wilayah GET /modules/:id ditemukan", moduleStart >= 0 && moduleEnd > moduleStart);
  check(
    "GET /modules/:id menegakkan kunci modul dengan 403 + pesan",
    moduleRoute.includes("planModuleLock(await loadStudentAssignmentPlan(user.userId), moduleId)") && moduleRoute.includes("moduleLockedMessage(moduleLock.lockedByTitle)") && moduleRoute.includes("}, 403)"),
  );

  const resolveStart = muridRoute.indexOf("async function resolveAttemptContext");
  const resolveEnd = muridRoute.indexOf("type ExistingGroupAttemptContext");
  const resolve = muridRoute.slice(resolveStart, resolveEnd);
  check("wilayah resolveAttemptContext ditemukan", resolveStart >= 0 && resolveEnd > resolveStart);
  check(
    "resolusi attempt memeriksa kunci (helper bersama)",
    muridRoute.includes("async function lockedAttemptError(") && resolve.includes("lockedAttemptError(studentId, assignmentId)"),
  );
  check(
    "jalur pemulihan konteks menyaring kandidat terkunci",
    resolve.includes("unlockedCandidates") && resolve.includes("assignmentLockedMessage(chosen.lockedByTitle)"),
  );
  check(
    "helper kunci memakai rencana server + pesan berbahasa Indonesia",
    muridRoute.includes("planForAssignment(await loadStudentAssignmentPlan(studentId), assignmentId)") && muridRoute.includes("assignmentLockedMessage(planned.lockedByTitle)"),
  );

  const tuntasStart = activityRoute.indexOf('input.event === "baca_materi_tuntas"');
  const tuntasEnd = activityRoute.indexOf("const [assignment] = await db");
  const tuntas = activityRoute.slice(tuntasStart, tuntasEnd);
  check("wilayah baca_materi_tuntas ditemukan", tuntasStart >= 0 && tuntasEnd > tuntasStart);
  check(
    "pencatatan tuntas baca menegakkan kunci modul dengan 403 + pesan",
    tuntas.includes("loadModuleLock(user.userId, moduleId)") && tuntas.includes("moduleLockedMessage(moduleLock.lockedByTitle)") && tuntas.includes("}, 403)"),
  );
  check(
    "kunci tuntas baca dinilai SEBELUM gerbang baca wajar",
    tuntas.indexOf("loadModuleLock(user.userId, moduleId)") < tuntas.indexOf("planCompletion("),
  );
}

console.log("Kasus H: tanpa migrasi");
{
  const journal = JSON.parse(
    readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
  );
  check("jurnal migrasi tetap 21 entri", journal.entries.length === 21, `got ${journal.entries.length}`);
  check("entri terakhir kini 0020_pemetaan_ruas", journal.entries[journal.entries.length - 1].tag === "0020_pemetaan_ruas");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
