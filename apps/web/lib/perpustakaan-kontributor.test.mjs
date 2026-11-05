// Tests for the contributor filter + shared-count badge on
// Perpustakaan Bersama (web side). Run with bun from apps/web:
//   bun lib/perpustakaan-kontributor.test.mjs
//
// The API's list response carries a `contributors` summary (whole live
// universe, independent of the active filters). The page renders one
// chip per contributor — "Semua kontributor" resets — and selecting a
// chip refetches with teacher_id. Each card's byline shows a badge with
// the owner's live total ("{n} dibagikan"). The pure label/resolution
// helpers are tested behaviorally; the page wiring is locked statically.
import { readFileSync } from "node:fs";
import {
  contributorChipLabel,
  kontributorBadgeLabel,
  resolveSelectedContributor,
} from "./perpustakaan.ts";

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

const CONTRIBUTORS = [
  { teacher_id: 7, name: "Feri Lee", modul_count: 3, lkpd_count: 2, total: 5 },
  { teacher_id: 9, name: "Ani", modul_count: 0, lkpd_count: 2, total: 2 },
];

// ---------------------------------------------------------------------------
// Case 1 — Pure helpers: chip label, badge label, selection resolution.
// ---------------------------------------------------------------------------
{
  check("chip label is exactly '{name} ({total})'",
    contributorChipLabel(CONTRIBUTORS[0]) === "Feri Lee (5)", contributorChipLabel(CONTRIBUTORS[0]));
  check("chip label uses the combined total, not per-kind counts",
    contributorChipLabel(CONTRIBUTORS[1]) === "Ani (2)");
  check("badge label is exactly '{n} dibagikan'",
    kontributorBadgeLabel({ kind: "module", id: 3, kontributor_total: 5 }) === "5 dibagikan");
  check("badge label tolerates a missing total (older payload)",
    kontributorBadgeLabel({ kind: "worksheet", id: 8 }) === "0 dibagikan");
  check("no selection stays no selection", resolveSelectedContributor(null, CONTRIBUTORS) === null);
  check("a still-live contributor stays selected", resolveSelectedContributor(7, CONTRIBUTORS) === 7);
  check("a vanished contributor falls back to all (null)", resolveSelectedContributor(42, CONTRIBUTORS) === null);
  check("an empty contributor list clears any selection", resolveSelectedContributor(7, []) === null);
}

// ---------------------------------------------------------------------------
// Case 2 — Panel wiring (static locks): chips row, teacher_id fetch,
// graceful fallback, card badge, and the pre-existing behaviors intact.
// (The library UI lives in components/LibraryPanel.tsx, inside the guru
// shell; the old route file only redirects.)
// ---------------------------------------------------------------------------
{
  const page = read("../components/LibraryPanel.tsx");
  const lib = read("./perpustakaan.ts");

  check("lib types carry the contributor fields",
    lib.includes("teacher_id?: number") && lib.includes("kontributor_total?: number")
    && lib.includes("type ContributorSummary"));
  check("page types the contributors meta on the list response", page.includes("contributors?: ContributorSummary[]"));
  check("page stores the contributors meta from the response",
    page.includes("setContributors(freshContributors)") && page.includes("response.contributors ?? []"));
  check("selection is resolved against each fresh contributor list (graceful fallback)",
    page.includes("resolveSelectedContributor(current, freshContributors)"));
  check("selecting a contributor refetches with teacher_id",
    page.includes('params.set("teacher_id", String(selectedContributor))'));
  check("contributor state participates in the list effect dependencies",
    page.includes("}, [query, kind, selectedContributor, forbidden, listVersion]);"));
  check("chips row renders only when contributors exist",
    page.includes("contributors.length > 0") && page.includes('aria-label="Saring kontributor"'));
  check("'Semua kontributor' chip clears the selection",
    page.includes("Semua kontributor") && page.includes("onClick={() => setSelectedContributor(null)}"));
  check("contributor chips select their teacher and label via the helper",
    page.includes("onClick={() => setSelectedContributor(contributor.teacher_id)}")
    && page.includes("{contributorChipLabel(contributor)}"));
  check("chips reuse the kind chips' active/idle styles",
    page.includes("selectedContributor === contributor.teacher_id ? styles.chipActive : styles.chip")
    && page.includes("selectedContributor === null ? styles.chipActive : styles.chip"));
  check("card byline keeps the owner attribution and gains the badge",
    page.includes("oleh {entry.owner_name}") && page.includes("{kontributorBadgeLabel(entry)}")
    && page.includes("styles.contributorBadge"));

  check("sudah-disalin card state is unbroken",
    page.includes("isSudahDisalin(entry)") && page.includes("{SUDAH_DISALIN_LABEL}"));
  check("approver queue section is unbroken",
    page.includes("Menunggu persetujuan ({pendingCount || approvals.length})") && page.includes("decideApproval(entry"));
  check("approver Tarik action is unbroken",
    page.includes("tarikEntry(entry)") && page.includes("approvalTarikPath(entry)"));
  check("an active contributor filter counts toward the empty-state wording",
    page.includes('selectedContributor !== null;') || page.includes("|| selectedContributor !== null"));
}

console.log(`\nperpustakaan-kontributor (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
