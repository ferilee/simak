// Tests for "Aturan B" (group sizing + partial re-formation with
// per-group locks). Run with bun from apps/api:
//   bun src/lib/aturan-kelompok-b.test.mjs
//
// There is no test database in this repo's convention, so: the pure
// rules (locked predicate, name suffixes, the re-formation plan) are
// tested behaviorally over fixtures, and the DB/route wiring (partial
// regenerate, shuffle 409 semantics, PATCH path, groups view) is locked
// statically against the sources. No new migration: journal stays 13.
import { readFileSync } from "node:fs";
import {
  groupNameSuffix,
  groupReformationLocked,
  planReformation,
} from "./groups.ts";

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
const readRepo = (rel) => readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
console.log("Case 1: groupReformationLocked — predikat kunci per kelompok");
{
  check("penuh (4 dari target 4) terkunci walau belum ada attempt", groupReformationLocked(4, 4, null, false) === true);
  check("melebihi target juga terkunci", groupReformationLocked(5, 4, null, false) === true);
  check("belum penuh + belum ada attempt → tidak terkunci", groupReformationLocked(3, 4, null, false) === false);
  check("belum penuh + attempt draf tanpa jawaban → tidak terkunci", groupReformationLocked(3, 4, "draf", false) === false);
  check("belum penuh + attempt draf SUDAH berjawaban → terkunci", groupReformationLocked(3, 4, "draf", true) === true);
  check("belum penuh + attempt terkumpul → terkunci", groupReformationLocked(2, 4, "terkumpul", false) === true);
  check("belum penuh + attempt dinilai → terkunci", groupReformationLocked(2, 4, "dinilai", false) === true);
  check("target tidak valid jatuh ke bawaan 4", groupReformationLocked(4, 0, null, false) === true && groupReformationLocked(3, 0, null, false) === false);
}

// ---------------------------------------------------------------------------
console.log("Case 2: groupNameSuffix");
{
  check('"Kelompok 3" → 3', groupNameSuffix("Kelompok 3") === 3);
  check('"Kelompok 12" → 12', groupNameSuffix("Kelompok 12") === 12);
  check('"Kelompok A" → null', groupNameSuffix("Kelompok A") === null);
  check('"kelompok 3" (huruf kecil) → null', groupNameSuffix("kelompok 3") === null);
  check('nama salinan bebas → null', groupNameSuffix("Tim Hebat") === null);
}

// ---------------------------------------------------------------------------
console.log("Case 3: planReformation — kelompok penuh dipertahankan persis, sisanya dibentuk ulang");
{
  const plan = planReformation(
    [
      { id: 11, name: "Kelompok 1", memberIds: [1, 2, 3, 4], attemptStatus: null, hasAnswers: false },
      { id: 12, name: "Kelompok 2", memberIds: [5, 6], attemptStatus: "draf", hasAnswers: false },
    ],
    [1, 2, 3, 4, 5, 6],
    4,
  );
  check("kelompok penuh masuk preservedIds", same(plan.preservedIds, [11]), JSON.stringify(plan));
  check("kelompok belum penuh masuk dissolvedIds", same(plan.dissolvedIds, [12]));
  check("kolam = anggota kelompok bubar saja", same(plan.poolStudentIds, [5, 6]));
  check("penomoran baru melanjutkan sesudah Kelompok 1", plan.firstNewGroupNumber === 2);
  check("bukan noop", plan.noop === false);
}

// ---------------------------------------------------------------------------
console.log("Case 4: planReformation — kelompok yang sudah mulai bekerja terkunci walau belum penuh");
{
  const plan = planReformation(
    [
      { id: 11, name: "Kelompok 1", memberIds: [1, 2], attemptStatus: "terkumpul", hasAnswers: false },
      { id: 12, name: "Kelompok 2", memberIds: [3, 4, 5], attemptStatus: "draf", hasAnswers: true },
      { id: 13, name: "Kelompok 3", memberIds: [6], attemptStatus: "draf", hasAnswers: false },
    ],
    [1, 2, 3, 4, 5, 6],
    4,
  );
  check("attempt terkumpul + draf berjawaban sama-sama dipertahankan", same(plan.preservedIds, [11, 12]), JSON.stringify(plan));
  check("hanya kelompok draf tanpa jawaban yang dibubarkan", same(plan.dissolvedIds, [13]));
  check("kolam = anggota kelompok bubar", same(plan.poolStudentIds, [6]));
  check("penomoran melanjutkan akhiran terkunci terbesar (2) → 3", plan.firstNewGroupNumber === 3);
}

// ---------------------------------------------------------------------------
console.log("Case 5: planReformation — murid susulan ikut kolam; penomoran melompati nomor kelompok bubar");
{
  // Kelompok 1 dan 3 penuh (terkunci), Kelompok 2 belum penuh (bubar),
  // murid 99 baru masuk kelas dan belum berkelompok.
  const plan = planReformation(
    [
      { id: 11, name: "Kelompok 1", memberIds: [1, 2, 3, 4], attemptStatus: null, hasAnswers: false },
      { id: 12, name: "Kelompok 2", memberIds: [5, 6], attemptStatus: null, hasAnswers: false },
      { id: 13, name: "Kelompok 3", memberIds: [7, 8, 9, 10], attemptStatus: null, hasAnswers: false },
    ],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99],
    4,
  );
  check("dua kelompok penuh dipertahankan", same(plan.preservedIds, [11, 13]), JSON.stringify(plan));
  check("Kelompok 2 dibubarkan", same(plan.dissolvedIds, [12]));
  check("kolam = anggota Kelompok 2 + murid susulan 99 (urutan daftar kelas)", same(plan.poolStudentIds, [5, 6, 99]));
  check("kelompok baru mulai dari Kelompok 4 (sesudah akhiran terkunci terbesar)", plan.firstNewGroupNumber === 4);
  check("bukan noop", plan.noop === false);
}

// ---------------------------------------------------------------------------
console.log("Case 6: planReformation — noop hanya bila semua terkunci dan kolam kosong");
{
  const allLocked = planReformation(
    [{ id: 11, name: "Kelompok 1", memberIds: [1, 2, 3, 4], attemptStatus: null, hasAnswers: false }],
    [1, 2, 3, 4],
    4,
  );
  check("semua terkunci + tidak ada yang belum berkelompok → noop", allLocked.noop === true);
  check("noop: tidak ada yang dibubarkan, kolam kosong", same(allLocked.dissolvedIds, []) && same(allLocked.poolStudentIds, []));

  const oneUngrouped = planReformation(
    [{ id: 11, name: "Kelompok 1", memberIds: [1, 2, 3, 4], attemptStatus: null, hasAnswers: false }],
    [1, 2, 3, 4, 5],
    4,
  );
  check("semua terkunci TETAPI ada murid belum berkelompok → bukan noop", oneUngrouped.noop === false);
  check("kolam berisi murid yang belum berkelompok itu", same(oneUngrouped.poolStudentIds, [5]));
  check("kelompok barunya bernomor 2", oneUngrouped.firstNewGroupNumber === 2);

  const emptyDissolved = planReformation(
    [
      { id: 11, name: "Kelompok 1", memberIds: [1, 2, 3, 4], attemptStatus: null, hasAnswers: false },
      { id: 12, name: "Kelompok 2", memberIds: [], attemptStatus: null, hasAnswers: false },
    ],
    [1, 2, 3, 4],
    4,
  );
  check("kelompok kosong yang tidak terkunci membuat bukan noop (ia dibubarkan)", emptyDissolved.noop === false && same(emptyDissolved.dissolvedIds, [12]));
}

// ---------------------------------------------------------------------------
console.log("Case 7: planReformation — tidak ada yang terkunci = pembentukan ulang penuh ala lama");
{
  const plan = planReformation(
    [
      { id: 11, name: "Kelompok 1", memberIds: [1, 2], attemptStatus: "draf", hasAnswers: false },
      { id: 12, name: "Kelompok 2", memberIds: [3], attemptStatus: null, hasAnswers: false },
    ],
    [1, 2, 3],
    4,
  );
  check("tidak ada yang dipertahankan", same(plan.preservedIds, []));
  check("semua kelompok dibubarkan", same(plan.dissolvedIds, [11, 12]));
  check("kolam = seluruh daftar kelas", same(plan.poolStudentIds, [1, 2, 3]));
  check("penomoran mulai lagi dari 1", plan.firstNewGroupNumber === 1);
  check("bukan noop", plan.noop === false);
}

// ---------------------------------------------------------------------------
console.log("Case 8: penguncian statis kabel basis data + rute");
{
  const groupsSrc = read("./groups.ts");
  const routesSrc = read("../routes/assignments.ts");

  check("planGroupSizes tidak lagi memakai pembulatan round()", !groupsSrc.includes("Math.round(n / target)"));
  check("classShuffleLocked tetap diekspor apa adanya", groupsSrc.includes("export async function classShuffleLocked"));
  check("assignmentHasGroupWork tetap memakai classShuffleLocked", groupsSrc.includes("assignmentHasGroupWork") && groupsSrc.split("assignmentHasGroupWork")[1].includes("classShuffleLocked"));

  const regenerateSegment = groupsSrc.split("export async function regenerateGroupsForClass")[1].split("export type AssignmentGroupMemberView")[0];
  check("regenerate memakai planReformation", regenerateSegment.includes("planReformation("));
  check("regenerate hanya menghapus kelompok bubar (bukan seluruh kelas)", regenerateSegment.includes("inArray(assignmentGroups.id, plan.dissolvedIds)") && !regenerateSegment.includes("eq(assignmentGroups.classId, classId)),\n    );\n    await generateGroupsForClass"));
  check("regenerate menulis kelompok baru dengan nomor lanjutan rencana", regenerateSegment.includes("insertGroupsForClass(tx, assignment, classId, chunks, plan.firstNewGroupNumber)"));
  check("regenerate mengembalikan ringkasan { preserved, formed, pooled_students, noop }", regenerateSegment.includes("pooled_students: plan.poolStudentIds.length") && regenerateSegment.includes("noop: true"));

  const viewSegment = groupsSrc.split("export async function loadAssignmentGroupsView")[1].split("export async function copyGroupsForClass")[0];
  check("tampilan panel membawa locked per kelompok dari predikat yang sama", viewSegment.includes("locked: groupReformationLocked("));
  check("tampilan panel tidak lagi memanggil classShuffleLocked", !viewSegment.includes("classShuffleLocked(assignment"));
  check("shuffle_locked tampilan = semua terkunci + tidak ada yang belum berkelompok", viewSegment.includes("groupViews.every((group) => group.locked) && ungrouped.length === 0"));

  const shuffleSegment = routesSrc.split('post("/:id/groups/shuffle"')[1].split('post("/:id/groups/copy"')[0];
  check("rute shuffle tidak lagi ditolak menyeluruh oleh classShuffleLocked", !shuffleSegment.includes("classShuffleLocked"));
  check("rute shuffle memakai regenerateGroupsForClass", shuffleSegment.includes("regenerateGroupsForClass(assignment, classId)"));
  check("rute shuffle 409 dengan pesan noop yang baru", shuffleSegment.includes("summary.noop") && shuffleSegment.includes("Semua kelompok kelas ini sudah terkunci dan tidak ada murid yang belum berkelompok."));
  check("rute shuffle menyertakan shuffle_result pada respons sukses", shuffleSegment.includes("shuffle_result: { preserved: summary.preserved, formed: summary.formed, pooled_students: summary.pooled_students }"));

  const patchSegment = routesSrc.split("groupSizeChanged && updated!.workMode")[1].split("const membershipsByStudent")[0];
  check("jalur PATCH ukuran kelompok membentuk ulang sebagian setiap kelas berkelompok", patchSegment.includes("if (existing) {") && patchSegment.includes("regenerateGroupsForClass(updated!, kelas.id)") && !patchSegment.includes("classShuffleLocked"));

  const copySegment = routesSrc.split('post("/:id/groups/copy"')[1].split('post("/:id/groups/:groupId/members"')[0];
  check("endpoint salin kelompok TIDAK berubah: tetap dijaga classShuffleLocked", copySegment.includes("classShuffleLocked(assignment, classId)"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("tidak ada migrasi baru dari paket ini: jurnal 16 entri (0013 persetujuan-berbagi menyusul)", journal.entries.length === 16, `got ${journal.entries.length}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
