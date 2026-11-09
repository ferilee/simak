// Tests for pemulihan konteks penugasan (konteks-pulih): perencana murni
// yang memutuskan konteks penugasan mana yang dipakai endpoint LKPD murid
// saat URL tidak membawa ?assignmentId=, plus wiring resolusinya di
// routes/murid.ts.
// Run with bun from apps/api:  bun src/lib/konteks-pulih.test.mjs
//
// Latar: tautan LKPD dari halaman modul tidak membawa parameter penugasan,
// dan server dulu diam-diam jatuh ke attempt individu — jawaban anggota
// kelompok terdampar di attempt pribadi dan Live Kelompok tidak pernah
// menyala. Perencana ini memilih penugasan pengganti dari kandidat yang
// sudah terlingkup pada murid (terbit, LKPD sama, murid sasaran); route
// lalu me-resolusi-nya lewat jalur yang persis sama dengan jalur parameter.
import { readFileSync } from "node:fs";
import { planRecoveredContext } from "./konteks-pulih.ts";

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

function planIs(label, candidates, expected) {
  const plan = planRecoveredContext(candidates);
  check(
    label,
    plan.kind === expected.kind && (expected.kind === "none" || plan.assignmentId === expected.assignmentId),
    `got ${JSON.stringify(plan)}, want ${JSON.stringify(expected)}`,
  );
}

const individu = (id, updatedAtMs) => ({ id, workMode: "individu", hasMembership: false, updatedAtMs });
const kelompokMember = (id, updatedAtMs) => ({ id, workMode: "kelompok", hasMembership: true, updatedAtMs });
const kelompokNonMember = (id, updatedAtMs) => ({ id, workMode: "kelompok", hasMembership: false, updatedAtMs });

console.log("Case 1: tabel kebenaran dasar");
planIs("tanpa kandidat → none", [], { kind: "none" });
planIs("satu individu → individu", [individu(7, 100)], { kind: "individu", assignmentId: 7 });
planIs("satu kelompok + anggota → kelompok", [kelompokMember(7, 100)], { kind: "kelompok", assignmentId: 7 });
planIs("satu kelompok tanpa anggota → ungrouped", [kelompokNonMember(7, 100)], { kind: "ungrouped", assignmentId: 7 });

console.log("Case 2: prioritas kelompok-beranggota mengalahkan kebaruan");
planIs(
  "kelompok lama beranggota > individu terbaru",
  [individu(9, 900), kelompokMember(3, 100)],
  { kind: "kelompok", assignmentId: 3 },
);
planIs(
  "dua kelompok beranggota → yang paling baru",
  [kelompokMember(3, 100), kelompokMember(8, 500), kelompokMember(5, 300)],
  { kind: "kelompok", assignmentId: 8 },
);
planIs(
  "seri updatedAt pada kelompok beranggota → id lebih besar",
  [kelompokMember(3, 500), kelompokMember(8, 500)],
  { kind: "kelompok", assignmentId: 8 },
);

console.log("Case 3: tanpa kelompok-beranggota, yang paling baru menang apa pun modenya");
planIs(
  "individu terbaru > kelompok non-anggota lama → individu",
  [kelompokNonMember(3, 100), individu(9, 900)],
  { kind: "individu", assignmentId: 9 },
);
planIs(
  "kelompok non-anggota terbaru > individu lama → ungrouped",
  [individu(3, 100), kelompokNonMember(9, 900)],
  { kind: "ungrouped", assignmentId: 9 },
);
planIs(
  "dua individu → yang paling baru",
  [individu(3, 100), individu(9, 900)],
  { kind: "individu", assignmentId: 9 },
);
planIs(
  "seri updatedAt lintas mode → id lebih besar (individu)",
  [kelompokNonMember(3, 500), individu(9, 500)],
  { kind: "individu", assignmentId: 9 },
);

console.log("Case 4: hasil tidak bergantung urutan masukan; masukan tidak diubah");
{
  const base = [individu(9, 900), kelompokMember(3, 100), kelompokNonMember(5, 950)];
  const expected = { kind: "kelompok", assignmentId: 3 };
  planIs("urutan asli", base, expected);
  planIs("urutan terbalik", [...base].reverse(), expected);
  planIs("urutan acak", [base[1], base[2], base[0]], expected);
  const snapshot = JSON.stringify(base);
  planRecoveredContext(base);
  check("array masukan tidak dimutasi perencana", JSON.stringify(base) === snapshot);
}

console.log("Case 5: lib murni — tanpa akses basis data");
{
  const lib = readFileSync(new URL("./konteks-pulih.ts", import.meta.url), "utf8");
  check("lib tidak mengimpor @simak/db", !lib.includes("@simak/db"));
  check("lib tidak menyentuh db apa pun", !lib.includes("db.select") && !lib.includes("db.insert") && !lib.includes("db.update"));
}

console.log("Case 6: wiring di routes/murid.ts");
{
  const murid = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
  check("murid.ts mengimpor perencana dari lib/konteks-pulih", murid.includes('from "../lib/konteks-pulih"') && murid.includes("planRecoveredContext"));

  const resolver = murid.slice(murid.indexOf("async function resolveAttemptContext"), murid.indexOf("type ExistingGroupAttemptContext"));
  check("resolver ditemukan", resolver.length > 0);
  check(
    "jalur parameter utuh: validasi id + accessibleAssignment + resolveFromAssignment",
    resolver.includes('message: "ID penugasan tidak valid."')
      && resolver.includes("accessibleAssignment(studentId, assignmentId)")
      && resolver.includes("return resolveFromAssignment(studentId, worksheetId, assignment);"),
  );
  check(
    "tanpa parameter: kandidat dimuat lalu direncanakan",
    resolver.includes("planRecoveredContext(await loadRecoveryCandidates(studentId, worksheetId))"),
  );
  check(
    "rencana yang terpilih diresolusi lewat jalur yang sama dengan parameter",
    resolver.includes("accessibleAssignment(studentId, plan.assignmentId)") && resolver.includes("if (assignment) return resolveFromAssignment(studentId, worksheetId, assignment);"),
  );
  check(
    "tanpa kandidat: jatuh ke attempt individu tanpa konteks (perilaku lama)",
    resolver.includes('return { kind: "ready", attempt: await getOrCreateAttempt(studentId, worksheetId), group: null, assignmentId: null };'),
  );

  const fromAssignment = murid.slice(murid.indexOf("async function resolveFromAssignment"), murid.indexOf("async function loadRecoveryCandidates"));
  check(
    "resolveFromAssignment: kelompok beranggota → attempt bersama; non-anggota → ungrouped berkonteks",
    fromAssignment.includes("getOrCreateGroupAttempt(worksheetId, group.id)")
      && fromAssignment.includes('return { kind: "ungrouped", assignmentId: assignment.id };'),
  );
  check(
    "resolveFromAssignment: individu → attempt individu dengan id penugasan melekat",
    fromAssignment.includes("group: null, assignmentId: assignment.id };"),
  );

  const loader = murid.slice(murid.indexOf("async function loadRecoveryCandidates"), murid.indexOf("async function resolveAttemptContext"));
  check(
    "kandidat terlingkup: LKPD sama + status terbit",
    loader.includes('eq(assignments.worksheetId, worksheetId)') && loader.includes('eq(assignments.status, "terbit")'),
  );
  check(
    "kandidat dari dua jalur sasaran: kelas tujuan + sasaran langsung",
    loader.includes("assignmentClasses") && loader.includes("classMembers") && loader.includes("assignmentStudents"),
  );
  check(
    "kelas arsip tidak memberi kandidat",
    loader.includes("eq(classes.isArchived, false)"),
  );
  check(
    "keanggotaan hanya diperiksa untuk kandidat kelompok, lewat loadStudentGroup",
    loader.includes('row.workMode === "kelompok" ? (await loadStudentGroup(row.id, studentId)) !== null : false'),
  );

  const attemptRoute = murid.slice(murid.indexOf('muridRoutes.get("/worksheets/:id/attempt"'), murid.indexOf('muridRoutes.post("/worksheets/:id/presence"'));
  check("rute GET attempt ditemukan", attemptRoute.length > 0);
  check(
    "GET attempt mengekspos assignment_id hasil resolusi pada kedua bentuk respons",
    (attemptRoute.split("assignment_id: context.assignmentId").length - 1) === 2,
  );
  check(
    "respons ungrouped tetap tanpa attempt dan tanpa jawaban",
    attemptRoute.includes("ungrouped: true, assignment_id: context.assignmentId, status: null, submitted_at: null, answers: [], group: null"),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
