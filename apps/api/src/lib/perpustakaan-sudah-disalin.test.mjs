// Tests for the "Sudah disalin" guard on Perpustakaan Bersama: a teacher
// who already owns a copy of a catalog item (copied_from_id = the source
// id, in ANY state) sees sudah_disalin = true in the catalog and cannot
// copy it a second time — the copy endpoints refuse with a friendly 400.
// Run with bun from apps/api:
//   bun src/lib/perpustakaan-sudah-disalin.test.mjs
//
// Same convention as perpustakaan-bersama.test.mjs: no test database, so
// the pure rules (duplicate guard, copied-source id set, entry flag
// passthrough, the module-copy cascade composition) are tested
// behaviorally and the route wiring is locked statically. No migration:
// the journal stays at 13 entries.
import { readFileSync } from "node:fs";
import {
  alreadyCopiedGuard,
  buildLibraryModuleEntry,
  buildLibraryWorksheetEntry,
  copiedSourceIdSet,
  mergeLibraryEntries,
  worksheetCopyValues,
} from "./library.ts";

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

const MODULE_DUP_MESSAGE = "Modul ini sudah pernah Anda salin.";
const WORKSHEET_DUP_MESSAGE = "LKPD ini sudah pernah Anda salin.";

// ---------------------------------------------------------------------------
// Case 1 — alreadyCopiedGuard: only an existing copy blocks, with the
// caller's exact per-kind message at 400.
// ---------------------------------------------------------------------------
{
  check("no existing copy → ok", alreadyCopiedGuard(false, MODULE_DUP_MESSAGE).ok === true);
  const moduleDup = alreadyCopiedGuard(true, MODULE_DUP_MESSAGE);
  check("existing module copy → 400 + exact module message",
    moduleDup.ok === false && moduleDup.status === 400 && moduleDup.message === MODULE_DUP_MESSAGE);
  const worksheetDup = alreadyCopiedGuard(true, WORKSHEET_DUP_MESSAGE);
  check("existing worksheet copy → 400 + exact worksheet message",
    worksheetDup.ok === false && worksheetDup.status === 400 && worksheetDup.message === WORKSHEET_DUP_MESSAGE);
}

// ---------------------------------------------------------------------------
// Case 2 — copiedSourceIdSet: the list flag's data source. Rows are the
// REQUESTING teacher's copies only (the route filters by teacher); any
// state counts, nulls and foreign targets do not flag anything.
// ---------------------------------------------------------------------------
{
  const myCopies = [
    { copiedFromId: 3, status: "draf" },
    { copiedFromId: 8, status: "terbit" },
    { copiedFromId: 9, status: "arsip" },
    { copiedFromId: 3, status: "draf" }, // salinan ganda lama tetap satu penanda
    { copiedFromId: null, status: "draf" }, // materi asli, bukan salinan
  ];
  const copied = copiedSourceIdSet(myCopies);
  check("draft copy counts", copied.has(3));
  check("published copy counts the same", copied.has(8));
  check("archived copy counts the same", copied.has(9));
  check("copied_from_id pointing elsewhere does not flag the page ids", !copied.has(4) && !copied.has(21));
  check("no copies at all → empty set", copiedSourceIdSet([]).size === 0);
  check("only originals (null copied_from_id) → empty set", copiedSourceIdSet([{ copiedFromId: null }]).size === 0);
  // Salinan milik guru LAIN tidak pernah sampai ke himpunan ini: route
  // menyaring teacher_id = peminta (dikunci statis di Case 5), jadi dari
  // sisi peminta himpunannya kosong dan penandanya false.
  const otherTeachersCopiesExcluded = copiedSourceIdSet([]);
  check("another teacher's copies never flag my list", otherTeachersCopiesExcluded.has(3) === false);
}

// ---------------------------------------------------------------------------
// Case 3 — Entry builders carry the flag through, untouched otherwise.
// ---------------------------------------------------------------------------
{
  const at = new Date("2026-11-05T00:00:00Z");
  const copiedModule = buildLibraryModuleEntry({
    id: 3, title: "Bunga Tunggal", subject: "Matematika", ownerName: "Feri",
    sharedAt: at, blockCount: 12, sharedWorksheetCount: 2, sudahDisalin: true,
  });
  check("module entry: sudah_disalin true passes through", copiedModule.sudah_disalin === true);
  check("module entry: other fields unchanged",
    copiedModule.kind === "module" && copiedModule.block_count === 12 && copiedModule.shared_worksheet_count === 2 && copiedModule.owner_name === "Feri");
  const freshModule = buildLibraryModuleEntry({
    id: 4, title: "Eksponen", subject: "Matematika", ownerName: "Feri",
    sharedAt: at, blockCount: 5, sharedWorksheetCount: 0, sudahDisalin: false,
  });
  check("module entry: sudah_disalin false passes through", freshModule.sudah_disalin === false);

  const copiedWorksheet = buildLibraryWorksheetEntry({
    id: 8, title: "LKPD ATP 2.1", subject: null, ownerName: "Rully",
    sharedAt: at, itemCount: 11, totalPoints: 100, sudahDisalin: true,
  });
  check("worksheet entry: sudah_disalin true passes through", copiedWorksheet.sudah_disalin === true);
  check("worksheet entry: other fields unchanged",
    copiedWorksheet.kind === "worksheet" && copiedWorksheet.item_count === 11 && copiedWorksheet.total_points === 100);

  const merged = mergeLibraryEntries([copiedModule], [copiedWorksheet]);
  check("merge keeps the flag on both kinds", merged.every((entry) => entry.sudah_disalin === true));
}

// ---------------------------------------------------------------------------
// Case 4 — Module-copy cascade composition: worksheets copied along with
// a module carry copied_from_id = the SOURCE worksheet ids, so the same
// set logic flags those source worksheets in the catalog afterwards.
// ---------------------------------------------------------------------------
{
  const sourceWorksheets = [
    { id: 21, title: "LKPD A", instructions: null },
    { id: 23, title: "LKPD B", instructions: "Kerjakan" },
  ];
  const cascadeCopies = sourceWorksheets.map((source) => worksheetCopyValues(source, 7, 99, "Feri"));
  check("cascade copies point back at their source worksheets",
    cascadeCopies[0].copiedFromId === 21 && cascadeCopies[1].copiedFromId === 23);
  const copied = copiedSourceIdSet(cascadeCopies);
  const at = new Date("2026-11-05T00:00:00Z");
  const entryA = buildLibraryWorksheetEntry({
    id: 21, title: "LKPD A", subject: "Matematika", ownerName: "Feri",
    sharedAt: at, itemCount: 5, totalPoints: 50, sudahDisalin: copied.has(21),
  });
  const entryB = buildLibraryWorksheetEntry({
    id: 23, title: "LKPD B", subject: "Matematika", ownerName: "Feri",
    sharedAt: at, itemCount: 6, totalPoints: 60, sudahDisalin: copied.has(23),
  });
  const entryOther = buildLibraryWorksheetEntry({
    id: 25, title: "LKPD C", subject: "Matematika", ownerName: "Feri",
    sharedAt: at, itemCount: 6, totalPoints: 60, sudahDisalin: copied.has(25),
  });
  check("cascade-copied worksheets report sudah_disalin = true", entryA.sudah_disalin === true && entryB.sudah_disalin === true);
  check("a worksheet outside the cascade stays false", entryOther.sudah_disalin === false);
}

// ---------------------------------------------------------------------------
// Case 5 — Route wiring (static locks) + Jalur B journal lock.
// ---------------------------------------------------------------------------
{
  const library = read("../routes/library.ts");

  check("list flags modules from the requester's own copies only",
    library.includes("eq(modules.teacherId, user.userId), inArray(modules.copiedFromId, ids)"));
  check("list flags worksheets from the requester's own copies only",
    library.includes("eq(worksheets.teacherId, user.userId), inArray(worksheets.copiedFromId, ids)"));
  check("list passes the module flag into the entry builder", library.includes("sudahDisalin: copiedModuleIds.has(row.id)"));
  check("list passes the worksheet flag into the entry builder", library.includes("sudahDisalin: copiedWorksheetIds.has(row.id)"));
  check("both list kinds build the copied set via copiedSourceIdSet (no per-entry queries)",
    (library.match(/copiedSourceIdSet\(copyRows\)/g) ?? []).length === 2);

  const moduleCopySegment = library.slice(library.indexOf('post("/modules/:id/copy"'), library.indexOf('post("/worksheets/:id/copy"'));
  check("module copy: duplicate check exists", moduleCopySegment.includes("alreadyCopiedGuard("));
  check("module copy: exact duplicate message", moduleCopySegment.includes(`"${MODULE_DUP_MESSAGE}"`));
  check("module copy: duplicate check runs AFTER copyGuard (precedence preserved)",
    moduleCopySegment.indexOf("copyGuard(") > -1
    && moduleCopySegment.indexOf("copyGuard(") < moduleCopySegment.indexOf("alreadyCopiedGuard("));
  check("module copy: duplicate check runs BEFORE the transaction (nothing is created)",
    moduleCopySegment.indexOf("alreadyCopiedGuard(") < moduleCopySegment.indexOf("db.transaction("));
  check("module copy: existence probe is scoped to requester + source id",
    moduleCopySegment.includes("eq(modules.teacherId, user.userId), eq(modules.copiedFromId, moduleId)"));

  const worksheetCopySegment = library.slice(library.indexOf('post("/worksheets/:id/copy"'));
  check("worksheet copy: duplicate check exists", worksheetCopySegment.includes("alreadyCopiedGuard("));
  check("worksheet copy: exact duplicate message", worksheetCopySegment.includes(`"${WORKSHEET_DUP_MESSAGE}"`));
  check("worksheet copy: duplicate check runs AFTER copyGuard (precedence preserved)",
    worksheetCopySegment.indexOf("copyGuard(") > -1
    && worksheetCopySegment.indexOf("copyGuard(") < worksheetCopySegment.indexOf("alreadyCopiedGuard("));
  check("worksheet copy: duplicate check runs BEFORE the transaction (nothing is created)",
    worksheetCopySegment.indexOf("alreadyCopiedGuard(") < worksheetCopySegment.indexOf("db.transaction("));
  check("worksheet copy: existence probe is scoped to requester + source id",
    worksheetCopySegment.includes("eq(worksheets.teacherId, user.userId), eq(worksheets.copiedFromId, worksheetId)"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 17 entries (0016 poin-xp menyusul, tanpa migrasi baru dari paket ini)", journal.entries.length === 17, `got ${journal.entries.length}`);
}

console.log(`\nperpustakaan-sudah-disalin: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
