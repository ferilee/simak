// Tests for "Pemetaan Materi" (v1.0.36): student module visibility is
// assignment-based. A published module is visible to a student IFF it is
// linked (assignments.moduleId) from an assignment targeted at that
// student (non-archived target class OR a direct assignment_students row)
// whose status is "terbit" or "ditutup".
// Run with bun from apps/api:  bun src/lib/pemetaan-materi.test.mjs
//
// The old rule (module's teacher teaches the student AND subjects match)
// could not distinguish class levels within one subject: the class X
// module "Eksponen ATP 1.1" leaked into the "Materi terbit" list of an
// XI KKKR student of the same teacher; only "Bunga Tunggal ATP 2.1",
// mapped to his class, may appear.
//
// There is no test database in this repo's convention, so: the pure
// visibility gate (status + linked module + dedupe) is tested
// behaviorally over candidate rows already scoped to one student's
// targets (the Beni fixture below), and the route wiring — both target
// paths feeding the gate, both surfaces using the shared helpers, the
// activity route aligned — is locked statically against the sources.
// Jalur A is locked too: no new migration.
import { readFileSync, readdirSync } from "node:fs";
import { MODULE_VISIBLE_ASSIGNMENT_STATUSES, qualifyingModuleIds } from "./assignment-target.ts";

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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
console.log("Case 1: gerbang murni — status penugasan yang memberi keterlihatan");
{
  check(
    "status yang memberi keterlihatan tepat terbit + ditutup",
    JSON.stringify(MODULE_VISIBLE_ASSIGNMENT_STATUSES) === JSON.stringify(["terbit", "ditutup"]),
    JSON.stringify(MODULE_VISIBLE_ASSIGNMENT_STATUSES),
  );
  check("penugasan terbit → modulnya terlihat", JSON.stringify(qualifyingModuleIds([{ moduleId: 21, status: "terbit" }])) === "[21]");
  check("penugasan ditutup → materi tetap terlihat (bisa dibaca ulang)", JSON.stringify(qualifyingModuleIds([{ moduleId: 21, status: "ditutup" }])) === "[21]");
  check("penugasan draf → tidak memberi keterlihatan apa pun", JSON.stringify(qualifyingModuleIds([{ moduleId: 21, status: "draf" }])) === "[]");
  check("penugasan tanpa modul tertaut dilewati", JSON.stringify(qualifyingModuleIds([{ moduleId: null, status: "terbit" }])) === "[]");
  check("daftar kosong → tidak ada modul terlihat", JSON.stringify(qualifyingModuleIds([])) === "[]");
}

// ---------------------------------------------------------------------------
console.log("Case 2: kasus Beni — satu guru, satu mapel, jenjang kelas berbeda");
{
  // Baris kandidat SELALU sudah terlingkup sasaran murid yang meminta
  // (jalur kelas/jalur langsung di kueri lib). Untuk Beni (XI KKKR) hanya
  // penugasan Bunga Tunggal yang menjadi sasarannya; penugasan Eksponen
  // (sasaran X TKJ A) tidak pernah menjadi baris kandidatnya.
  const MODUL_BUNGA_TUNGGAL = 21;
  const MODUL_EKSPONEN = 11;
  const kandidatBeni = [{ moduleId: MODUL_BUNGA_TUNGGAL, status: "terbit" }];
  check(
    "Beni hanya melihat Bunga Tunggal ATP 2.1",
    JSON.stringify(qualifyingModuleIds(kandidatBeni)) === JSON.stringify([MODUL_BUNGA_TUNGGAL]),
  );
  const kandidatMuridXTKJA = [{ moduleId: MODUL_EKSPONEN, status: "terbit" }, { moduleId: MODUL_BUNGA_TUNGGAL, status: "draf" }];
  check(
    "murid X TKJ A melihat Eksponen; Bunga Tunggal-nya masih draf untuk kelasnya → tidak ikut",
    JSON.stringify(qualifyingModuleIds(kandidatMuridXTKJA)) === JSON.stringify([MODUL_EKSPONEN]),
  );
  // Regresi aturan lama: kecocokan guru/mapel TIDAK lagi menjadi masukan
  // gerbang — modul terbit tanpa baris penugasan sasaran tidak terlihat.
  check(
    "modul terbit tanpa penugasan yang memetakan → tidak terlihat oleh siapa pun",
    JSON.stringify(qualifyingModuleIds([])) === "[]",
  );
}

// ---------------------------------------------------------------------------
console.log("Case 3: satu modul dipetakan lewat dua penugasan → muncul sekali");
{
  const rows = [
    { moduleId: 21, status: "terbit" },
    { moduleId: 21, status: "ditutup" },
    { moduleId: 22, status: "terbit" },
  ];
  check(
    "duplikat modul dihilangkan, urutan kemunculan pertama dipertahankan",
    JSON.stringify(qualifyingModuleIds(rows)) === JSON.stringify([21, 22]),
    JSON.stringify(qualifyingModuleIds(rows)),
  );
}

// ---------------------------------------------------------------------------
console.log("Case 4: pengawatan lib — aturan dinyatakan satu kali, dua jalur sasaran");
{
  const lib = read("./assignment-target.ts");
  check("lib mengekspor listVisibleModuleIds", lib.includes("export async function listVisibleModuleIds"));
  check("lib mengekspor studentCanAccessModule", lib.includes("export async function studentCanAccessModule"));
  check("studentCanAccessModule dibangun di atas listVisibleModuleIds (satu aturan)", lib.includes("(await listVisibleModuleIds(studentId)).includes(moduleId)"));
  check(
    "jalur kelas: assignment_classes + kelas tidak diarsipkan + keanggotaan murid",
    lib.includes("innerJoin(assignmentClasses, eq(assignmentClasses.assignmentId, assignments.id))")
      && lib.includes("eq(classes.isArchived, false)")
      && lib.includes("eq(classMembers.studentId, studentId)"),
  );
  check(
    "jalur langsung: assignment_students milik murid",
    lib.includes("innerJoin(assignmentStudents, eq(assignmentStudents.assignmentId, assignments.id))")
      && lib.includes("eq(assignmentStudents.studentId, studentId)"),
  );
  check("hanya penugasan bermodul yang menjadi kandidat", lib.includes("isNotNull(assignments.moduleId)"));
  check("gerbang status diterapkan qualifyingModuleIds pada kandidat gabungan", lib.includes("qualifyingModuleIds(await targetedModuleAssignments(studentId))"));
}

// ---------------------------------------------------------------------------
console.log("Case 5: permukaan murid memakai aturan bersama; aturan lama hilang");
{
  const murid = read("../routes/murid.ts");
  const todayStart = murid.indexOf('muridRoutes.get("/today"');
  const todayEnd = murid.indexOf('muridRoutes.get("/nilai"');
  const today = murid.slice(todayStart, todayEnd);
  check("/today mengambil daftar materi dari listVisibleModuleIds", today.includes("await listVisibleModuleIds(user.userId)"));
  check("/today tetap menyaring modul berstatus terbit + urutan updatedAt naik", today.includes('eq(modules.status, "terbit")') && today.includes("inArray(modules.id, visibleModuleIds)") && today.includes("asc(modules.updatedAt)"));
  check("aturan lama guru+mapel hilang dari murid.ts (subjectKeys tak tersisa)", !murid.includes("subjectKeys"));
  check("aturan lama ATAU guru/mapel untuk modul hilang dari detail", !murid.includes("eq(classes.teacherId, module.teacherId)"));

  const detailStart = murid.indexOf('muridRoutes.get("/modules/:id"');
  const detailEnd = murid.indexOf('muridRoutes.get("/worksheets/:id"');
  const detail = murid.slice(detailStart, detailEnd);
  check("detail modul memakai studentCanAccessModule", detail.includes("await studentCanAccessModule(user.userId, moduleId)"));
  check("detail tetap 404 untuk modul tak terbit/tidak ada", detail.includes('eq(modules.status, "terbit")') && detail.includes('"Materi tidak ditemukan."'));
  check("detail tetap memakai pesan 403 yang sama", detail.includes('"Materi ini belum tersedia untuk kelas Anda."'));
  check("pencatatan buka_materi di detail tetap ada", detail.includes('event: "buka_materi"'));
  check("keadaan baca_materi_tuntas di detail tetap dibaca", detail.includes('eq(activityLogs.event, "baca_materi_tuntas")'));
  check("LKPD terbit yang tertanam di detail tetap dilayani", detail.includes("publishedWorksheets"));
}

// ---------------------------------------------------------------------------
console.log("Case 6: route aktivitas selaras — tuntas baca memakai aturan yang sama");
{
  const activity = read("../routes/activity.ts");
  const tuntasStart = activity.indexOf('input.event === "baca_materi_tuntas"');
  const tuntasEnd = activity.indexOf("studentIsAssignmentTarget", tuntasStart);
  const tuntas = activity.slice(tuntasStart, tuntasEnd);
  check("baca_materi_tuntas memeriksa studentCanAccessModule", tuntas.includes("await studentCanAccessModule(user.userId, moduleId)"));
  check("aturan lama ATAU guru/mapel hilang dari route aktivitas", !activity.includes("eq(classes.teacherId, module.teacherId)") && !activity.includes("or(eq(classes.teacherId"));
  check("baca_materi_tuntas tetap 404 untuk modul tak terbit", tuntas.includes('"Materi tidak ditemukan."'));
  check("peristiwa berbasis penugasan tetap memakai studentIsAssignmentTarget", activity.includes("await studentIsAssignmentTarget(assignment.id, user.userId)"));
}

// ---------------------------------------------------------------------------
console.log("Case 7: Jalur — tidak ada migrasi melampaui 0013 (Persetujuan Berbagi)");
{
  const files = readdirSync(new URL("../../../../packages/db/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
  check("tidak ada berkas migrasi 0017+", !files.some((name) => /^001[7-9]|^002/.test(name)), files.join(","));
  const journal = JSON.parse(read("../../../../packages/db/migrations/meta/_journal.json"));
  check("jurnal 17 entri (idx terakhir 16, 0016 poin-xp)", journal.entries.length === 17 && journal.entries[journal.entries.length - 1].idx === 16);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
