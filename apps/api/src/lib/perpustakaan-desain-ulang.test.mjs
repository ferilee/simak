// Tests for the Perpustakaan Bersama visual redesign API additions:
// every catalog entry gains `salinan_count` (how many copies of it still
// exist, from ANY teacher) and modules gain `cover_key` (worksheets get
// a uniform null), and the list response gains a `stats` envelope
// sibling computed over the whole live universe. Run with bun from
// apps/api:
//   bun src/lib/perpustakaan-desain-ulang.test.mjs
//
// Same convention as the other library suites: no test database, so the
// pure aggregations (copy counts per source, the hero stats) are tested
// behaviorally and the route wiring is locked statically. No migration:
// the journal stays at 16 entries.
import { readFileSync } from "node:fs";
import {
  buildLibraryModuleEntry,
  buildLibraryStats,
  buildLibraryWorksheetEntry,
  countCopiesBySourceId,
  mergeLibraryEntries,
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
// Case 1 — countCopiesBySourceId: grouped copy rows fold into a per-source
// map; copies from any teacher are already summed by the GROUP BY, rows
// that are not copies (NULL source) and empty groups never appear.
// ---------------------------------------------------------------------------
{
  const counts = countCopiesBySourceId([
    { copiedFromId: 3, count: 4 },
    { copiedFromId: 8, count: 1 },
    { copiedFromId: null, count: 12 },
    { copiedFromId: 5, count: 0 },
  ]);
  check("counts land per source id", counts.get(3) === 4 && counts.get(8) === 1);
  check("non-copy rows (NULL source) are dropped", !counts.has(null) && counts.size === 2, `size ${counts.size}`);
  check("zero-count groups are dropped", !counts.has(5));
  check("duplicate groups for one source sum up",
    countCopiesBySourceId([{ copiedFromId: 3, count: 2 }, { copiedFromId: 3, count: 3 }]).get(3) === 5);
  check("empty input → empty map", countCopiesBySourceId([]).size === 0);
  check("an uncopied source reads as zero via the route's ?? 0 fallback",
    (counts.get(999) ?? 0) === 0);
}

// ---------------------------------------------------------------------------
// Case 2 — Entry builders: modules pass cover_key + salinan_count
// through; worksheets gain salinan_count and a uniform cover_key null.
// ---------------------------------------------------------------------------
{
  const at = new Date("2026-11-05T00:00:00Z");
  const moduleEntry = buildLibraryModuleEntry({
    id: 3, title: "Bunga Tunggal", subject: "Matematika", teacherId: 7, ownerName: "Feri Lee",
    kontributorTotal: 5, sharedAt: at, coverKey: "covers/bunga.webp", blockCount: 12,
    sharedWorksheetCount: 2, sudahDisalin: false, salinanCount: 4,
  });
  check("module entry carries salinan_count", moduleEntry.salinan_count === 4);
  check("module entry passes cover_key through", moduleEntry.cover_key === "covers/bunga.webp");
  check("module entry without a cover keeps cover_key null",
    buildLibraryModuleEntry({
      id: 4, title: "Tanpa Sampul", subject: "KKA", teacherId: 7, ownerName: "Feri Lee",
      kontributorTotal: 5, sharedAt: at, coverKey: null, blockCount: 1,
      sharedWorksheetCount: 0, sudahDisalin: true, salinanCount: 0,
    }).cover_key === null);
  const worksheetEntry = buildLibraryWorksheetEntry({
    id: 8, title: "LKPD ATP 2.1", subject: null, teacherId: 7, ownerName: "Feri Lee",
    kontributorTotal: 5, sharedAt: at, itemCount: 11, totalPoints: 100, sudahDisalin: true, salinanCount: 2,
  });
  check("worksheet entry carries salinan_count", worksheetEntry.salinan_count === 2);
  check("worksheet entry cover_key is a uniform null", worksheetEntry.cover_key === null && "cover_key" in worksheetEntry);
  const merged = mergeLibraryEntries([moduleEntry], [worksheetEntry]);
  check("merge keeps salinan_count + cover_key on both kinds",
    merged.every((entry) => typeof entry.salinan_count === "number" && "cover_key" in entry));
}

// ---------------------------------------------------------------------------
// Case 3 — buildLibraryStats: totals come from the universe id lists,
// total_kontributor mirrors the contributor summary length, and
// sudah_disalin_count intersects the viewer's own copy sources with the
// universe per kind (copies of non-universe items never count).
// ---------------------------------------------------------------------------
{
  const stats = buildLibraryStats({
    universeModuleIds: [3, 4, 5],
    universeWorksheetIds: [8, 9],
    totalKontributor: 2,
    viewerCopiedModuleIds: new Set([3, 5, 999]),
    viewerCopiedWorksheetIds: new Set([9, 1234]),
  });
  check("total_items sums both kinds of the universe", stats.total_items === 5, `got ${stats.total_items}`);
  check("total_kontributor mirrors the summary length", stats.total_kontributor === 2);
  check("sudah_disalin_count intersects per kind (999/1234 are outside the universe)",
    stats.sudah_disalin_count === 3, `got ${stats.sudah_disalin_count}`);
  const empty = buildLibraryStats({
    universeModuleIds: [], universeWorksheetIds: [], totalKontributor: 0,
    viewerCopiedModuleIds: new Set([1]), viewerCopiedWorksheetIds: new Set([2]),
  });
  check("empty universe → all zeros even when the viewer owns copies",
    empty.total_items === 0 && empty.total_kontributor === 0 && empty.sudah_disalin_count === 0);
  const noneCopied = buildLibraryStats({
    universeModuleIds: [1], universeWorksheetIds: [2], totalKontributor: 1,
    viewerCopiedModuleIds: new Set(), viewerCopiedWorksheetIds: new Set(),
  });
  check("no viewer copies → sudah_disalin_count 0 with a non-empty universe",
    noneCopied.total_items === 2 && noneCopied.sudah_disalin_count === 0);
}

// ---------------------------------------------------------------------------
// Case 4 — Route wiring (static locks): the salinan counts are ONE grouped
// query per kind over the returned page's ids with NO teacher filter
// (copies by any teacher), the module query selects the cover key, the
// universe/viewer-copy queries feed the pure stats helper, the envelope
// gains `stats`, and the journal stays at 14.
// ---------------------------------------------------------------------------
{
  const library = read("../routes/library.ts");
  const listSegment = library.slice(0, library.indexOf('libraryRoutes.get("/modules/:id"'));

  check("module salinan counts: one grouped query over the page ids, grouped by source",
    listSegment.includes("inArray(modules.copiedFromId, ids)")
    && listSegment.includes(".groupBy(modules.copiedFromId)")
    && listSegment.includes("countCopiesBySourceId("));
  check("worksheet salinan counts: one grouped query over the page ids, grouped by source",
    listSegment.includes("inArray(worksheets.copiedFromId, ids)")
    && listSegment.includes(".groupBy(worksheets.copiedFromId)"));
  check("salinan queries carry NO teacher filter (copies by any teacher count)",
    listSegment.includes(".where(inArray(modules.copiedFromId, ids))")
    && listSegment.includes(".where(inArray(worksheets.copiedFromId, ids))")
    && listSegment.includes("salinanModuleCounts") && listSegment.includes("salinanWorksheetCounts"));
  check("module entry query selects the cover key",
    listSegment.includes("coverKey: modules.coverKey"));
  check("entries receive cover + salinan counts",
    listSegment.includes("coverKey: row.coverKey")
    && listSegment.includes("salinanCount: salinanModuleCounts.get(row.id) ?? 0")
    && listSegment.includes("salinanCount: salinanWorksheetCounts.get(row.id) ?? 0"));
  check("stats are built by the pure helper from universe ids + viewer copy sets",
    listSegment.includes("buildLibraryStats({")
    && listSegment.includes("universeModuleIds: universeModuleRows.map((row) => row.id)")
    && listSegment.includes("viewerCopiedModuleIds: copiedSourceIdSet(viewerModuleCopyRows)"));
  check("universe queries only take live rows of other teachers",
    listSegment.includes("const universeModuleRows") && listSegment.includes("const universeWorksheetRows"));
  check("envelope gains stats as a sibling of the existing meta",
    listSegment.includes("contributors,") && listSegment.includes("stats,"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 19 entries (no new migration)", journal.entries.length === 19, `got ${journal.entries.length}`);
}

console.log(`\nperpustakaan-desain-ulang: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
