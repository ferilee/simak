// Tests for the contributor filter + shared-count badge on
// Perpustakaan Bersama: the catalog can be filtered per contributing
// teacher (teacher_id), the response carries a `contributors` summary
// computed over the whole live universe (independent of the active
// filters), and each entry carries its owner's live total for the card
// badge. Run with bun from apps/api:
//   bun src/lib/perpustakaan-kontributor.test.mjs
//
// Same convention as the other library suites: no test database, so the
// pure rules (summary merge + ordering, the teacher_id parser, entry
// passthrough) are tested behaviorally and the route wiring is locked
// statically. No migration: the journal stays at 15 entries.
import { readFileSync } from "node:fs";
import {
  buildContributorSummaries,
  buildLibraryModuleEntry,
  buildLibraryWorksheetEntry,
  mergeLibraryEntries,
  parseContributorParam,
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

// ---------------------------------------------------------------------------
// Case 1 — buildContributorSummaries: counts merge across kinds, totals
// sum, zero-live teachers are absent, ordering is total DESC/name ASC.
// ---------------------------------------------------------------------------
{
  const names = new Map([
    [2, "Budi"],
    [7, "Feri Lee"],
    [9, "Ani"],
    [11, "Citra"],
  ]);
  const summaries = buildContributorSummaries(
    [
      { teacherId: 7, count: 3 },
      { teacherId: 2, count: 5 },
      { teacherId: 11, count: 1 },
    ],
    [
      { teacherId: 7, count: 2 },
      { teacherId: 9, count: 5 },
      { teacherId: 11, count: 2 },
    ],
    names,
  );
  check("one summary per contributing teacher", summaries.length === 4, `got ${summaries.length}`);
  const feri = summaries.find((summary) => summary.teacher_id === 7);
  check("counts sum across kinds (3 modul + 2 lkpd = 5)",
    feri !== undefined && feri.modul_count === 3 && feri.lkpd_count === 2 && feri.total === 5);
  check("summary carries the owner's name", feri !== undefined && feri.name === "Feri Lee");
  const ani = summaries.find((summary) => summary.teacher_id === 9);
  check("worksheet-only teacher appears with modul_count 0",
    ani !== undefined && ani.modul_count === 0 && ani.lkpd_count === 5 && ani.total === 5);
  check("ordering: total DESC, ties broken by name ASC (id locale)",
    summaries.map((summary) => summary.teacher_id).join(",") === "9,2,7,11",
    summaries.map((summary) => `${summary.teacher_id}:${summary.total}`).join(","));
  check("empty inputs → no contributors", buildContributorSummaries([], [], new Map()).length === 0);
  check("zero-count rows never produce a summary",
    buildContributorSummaries([{ teacherId: 4, count: 0 }], [{ teacherId: 4, count: 0 }], new Map([[4, "Dedi"]])).length === 0);
  check("a zero count in one kind does not erase the other kind",
    buildContributorSummaries([{ teacherId: 4, count: 0 }], [{ teacherId: 4, count: 2 }], new Map([[4, "Dedi"]]))[0]?.total === 2);
  check("missing name falls back to 'Guru'",
    buildContributorSummaries([{ teacherId: 42, count: 1 }], [], new Map())[0]?.name === "Guru");
}

// ---------------------------------------------------------------------------
// Case 2 — parseContributorParam: absent = no filter; a positive integer
// filters; anything else is invalid (route answers the exact 400).
// ---------------------------------------------------------------------------
{
  const absent = parseContributorParam(undefined);
  check("absent param → valid, no filter", absent.valid === true && absent.teacherId === null);
  const five = parseContributorParam("5");
  check("positive integer → valid filter", five.valid === true && five.teacherId === 5);
  check("zero is invalid", parseContributorParam("0").valid === false);
  check("negative is invalid", parseContributorParam("-3").valid === false);
  check("fraction is invalid", parseContributorParam("2.5").valid === false);
  check("non-numeric is invalid", parseContributorParam("feri").valid === false);
  check("empty string is invalid", parseContributorParam("").valid === false);
}

// ---------------------------------------------------------------------------
// Case 3 — Entry builders carry teacher_id + kontributor_total through,
// consistent with the summary total for the same owner.
// ---------------------------------------------------------------------------
{
  const at = new Date("2026-11-05T00:00:00Z");
  const names = new Map([[7, "Feri Lee"]]);
  const [summary] = buildContributorSummaries([{ teacherId: 7, count: 3 }], [{ teacherId: 7, count: 2 }], names);
  const moduleEntry = buildLibraryModuleEntry({
    id: 3, title: "Bunga Tunggal", subject: "Matematika", teacherId: 7, ownerName: "Feri Lee",
    kontributorTotal: summary.total, sharedAt: at, blockCount: 12, sharedWorksheetCount: 2, sudahDisalin: false,
  });
  check("module entry carries teacher_id", moduleEntry.teacher_id === 7);
  check("module entry kontributor_total matches the summary total",
    moduleEntry.kontributor_total === 5 && moduleEntry.kontributor_total === summary.total);
  check("module entry other fields unchanged",
    moduleEntry.owner_name === "Feri Lee" && moduleEntry.block_count === 12 && moduleEntry.sudah_disalin === false);
  const worksheetEntry = buildLibraryWorksheetEntry({
    id: 8, title: "LKPD ATP 2.1", subject: null, teacherId: 7, ownerName: "Feri Lee",
    kontributorTotal: summary.total, sharedAt: at, itemCount: 11, totalPoints: 100, sudahDisalin: true,
  });
  check("worksheet entry carries teacher_id + the same owner total",
    worksheetEntry.teacher_id === 7 && worksheetEntry.kontributor_total === moduleEntry.kontributor_total);
  const merged = mergeLibraryEntries([moduleEntry], [worksheetEntry]);
  check("merge keeps the contributor fields on both kinds",
    merged.every((entry) => entry.teacher_id === 7 && entry.kontributor_total === 5));
}

// ---------------------------------------------------------------------------
// Case 4 — Route wiring (static locks): the teacher_id filter lands on
// BOTH entry queries as an extra AND beside the not-the-viewer rule, the
// contributor summary is computed from the whole live universe only
// (is_shared, never the viewer's rows, untouched by the active filters),
// entries are built with the summary totals, the envelope gains
// `contributors`, and the journal stays at 14.
// ---------------------------------------------------------------------------
{
  const library = read("../routes/library.ts");
  const listSegment = library.slice(0, library.indexOf('libraryRoutes.get("/modules/:id"'));

  check("route parses teacher_id through the pure parser",
    listSegment.includes('parseContributorParam(c.req.query("teacher_id"))'));
  check("invalid teacher_id answers the exact 400 message",
    listSegment.includes('"Kontributor tidak valid."') && listSegment.includes('}, 400);'));
  check("module list filters by contributor as an added AND",
    listSegment.includes("...(contributorId !== null ? [eq(modules.teacherId, contributorId)] : [])"));
  check("worksheet list filters by contributor as an added AND",
    listSegment.includes("...(contributorId !== null ? [eq(worksheets.teacherId, contributorId)] : [])"));
  check("both entry queries still exclude the viewer's own rows beside the contributor filter",
    listSegment.includes("ne(modules.teacherId, user.userId),\n          ...(contributorId !== null ? [eq(modules.teacherId, contributorId)] : [])")
    && listSegment.includes("ne(worksheets.teacherId, user.userId),\n          ...(contributorId !== null ? [eq(worksheets.teacherId, contributorId)] : [])"));
  check("both entry queries select the owner id for the entries",
    listSegment.includes("teacherId: modules.teacherId") && listSegment.includes("teacherId: worksheets.teacherId"));

  const summarySegment = listSegment.slice(
    listSegment.indexOf("// Ringkasan kontributor"),
    listSegment.indexOf("const moduleEntries = [];"),
  );
  check("contributor module counts only count live rows of other teachers",
    summarySegment.includes("and(eq(modules.isShared, true), ne(modules.teacherId, user.userId))")
    && summarySegment.includes(".groupBy(modules.teacherId)"));
  check("contributor worksheet counts only count live rows of other teachers",
    summarySegment.includes("and(eq(worksheets.isShared, true), ne(worksheets.teacherId, user.userId))")
    && summarySegment.includes(".groupBy(worksheets.teacherId)"));
  check("pending/rejected rows can never count: the summary queries never touch share_status (is_shared is the only gate)",
    !summarySegment.includes("shareStatus"));
  check("summary computation is independent of the active filters (no search pattern, no kind switch, no contributor filter)",
    !summarySegment.includes("like(")
    && !summarySegment.includes("kindParam")
    && !summarySegment.includes("eq(modules.teacherId, contributorId)")
    && !summarySegment.includes("eq(worksheets.teacherId, contributorId)"));
  check("summary is built by the pure helper with owner names",
    summarySegment.includes("buildContributorSummaries(") && summarySegment.includes("contributorNames"));
  check("entries receive the owner's summary total",
    (listSegment.match(/kontributorTotal: kontributorTotals\.get\(row\.teacherId\) \?\? 0/g) ?? []).length === 2);
  check("envelope gains contributors as a sibling of the existing meta",
    listSegment.includes("pending_count: pendingCount,") && listSegment.includes("contributors,"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 15 entries (no new migration)", journal.entries.length === 15, `got ${journal.entries.length}`);
}

console.log(`\nperpustakaan-kontributor: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
