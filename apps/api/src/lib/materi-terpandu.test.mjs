// Tests for daftar materi murid terpandu (v1.0.65, sisi API):
// perluasan payload /murid/today yang ADITIF untuk daftar materi —
// topic_group + penanda tuntas per modul — dan himpunan sinyal
// baca_materi_tuntas yang cakupannya diperluas ke semua modul daftar.
// Run with bun from apps/api:  bun src/lib/materi-terpandu.test.mjs
//
// Yang dikunci di sini:
//  - Payload modules /today membawa topic_group (dasar pengelompokan
//    per kelompok materi di web) dan material_completed per modul,
//    TANPA menghapus/mengubah field lama (locked/locked_by_title dari
//    v1.0.63 tetap persis).
//  - material_completed dibaca dari himpunan completedMaterialModuleIds
//    yang sama dengan checklist kartu penugasan (predikat
//    baca_materi_tuntas), dan kueri himpunan itu kini mencakup gabungan
//    modul penugasan + modul terbit yang terlihat
//    (materialSignalModuleIds) — modul yang hanya tertaut penugasan
//    ditutup pun penanda tuntasnya benar.
//  - Tanpa migrasi: jurnal kini 21 entri, terakhir 0020 (paket hub tahap 2).
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

const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
const todayStart = muridRoute.indexOf('muridRoutes.get("/today"');
const todayEnd = muridRoute.indexOf('muridRoutes.post("/welcome/seen"');
const today = muridRoute.slice(todayStart, todayEnd);

console.log("Kasus A: wilayah /today");
check("wilayah /today ditemukan", todayStart >= 0 && todayEnd > todayStart);

console.log("Kasus B: payload modules aditif");
check("modules membawa topic_group dari baris modul", today.includes("topic_group: module.topicGroup"));
check(
  "modules membawa material_completed dari himpunan tuntas",
  today.includes("material_completed: completedMaterialModuleIds.has(module.id)"),
);
check(
  "field kunci v1.0.63 pada modules tidak berubah",
  today.includes("locked: lock.locked") && today.includes("locked_by_title: lock.lockedByTitle"),
);
check(
  "field lama modules tetap lengkap",
  ["id: module.id", "title: module.title", "subject: module.subject", "description: module.description", "cover_key: module.coverKey", "status: module.status", "updated_at: module.updatedAt"].every((needle) => today.includes(needle)),
);

console.log("Kasus C: cakupan himpunan sinyal tuntas");
check(
  "himpunan sinyal = gabungan modul penugasan + modul terbit terlihat",
  today.includes("const materialSignalModuleIds = [...new Set([...assignmentModuleIds, ...publishedModules.map((module) => module.id)])];"),
);
check(
  "kueri baca_materi_tuntas memakai himpunan gabungan itu",
  today.includes("inArray(activityLogs.moduleId, materialSignalModuleIds)") && today.includes('eq(activityLogs.event, "baca_materi_tuntas")'),
);
check(
  "checklist kartu penugasan tetap membaca himpunan yang sama",
  today.includes("material_completed: assignment.moduleId !== null && completedMaterialModuleIds.has(assignment.moduleId)"),
);

console.log("Kasus D: tanpa migrasi");
{
  const journal = JSON.parse(
    readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
  );
  check("jurnal migrasi tetap 21 entri", journal.entries.length === 21, `got ${journal.entries.length}`);
  check("entri terakhir kini 0020_pemetaan_ruas", journal.entries[journal.entries.length - 1].tag === "0020_pemetaan_ruas");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
