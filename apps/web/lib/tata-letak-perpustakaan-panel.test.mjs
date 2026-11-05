// Tests for the Perpustakaan Bersama panel-width layout fix: since the
// panel lives in the guru shell's right pane, the library shell and card
// grid are governed by CSS container queries on the panel root
// (.library-root, container-type: inline-size) instead of viewport media
// queries — the old @media rules forced 3–4 crushed columns into the
// narrow pane. Run with bun from apps/web:
//   bun lib/tata-letak-perpustakaan-panel.test.mjs
//
// The fix is presentation-only: thresholds are calibrated so a card is
// never narrower than ±230px (grid gap 16px, shell gap 24px, sidebar
// 300px), and browsers without container queries keep the roomy base
// layout (1-column grid, stacked shell).
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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../app/globals.css");
const panel = read("../components/LibraryPanel.tsx");
const guru = read("../app/guru/page.tsx");

// Extract the body of the first rule/block starting at `marker`
// (brace-matched, so @container/@media blocks come out whole).
function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

// All viewport @media block bodies in the stylesheet.
function mediaBlocks(source) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("@media", from);
    if (start === -1) return blocks;
    const body = blockAfter(source.slice(start), "@media");
    if (body === null) return blocks;
    blocks.push(body);
    from = start + "@media".length;
  }
}

// ---------------------------------------------------------------------------
// Case 1 — The container: declared in CSS, carried by the panel root,
// scoped to the library only.
// ---------------------------------------------------------------------------
{
  const rootRule = blockAfter(css, ".library-root {");
  check("globals.css declares the .library-root container",
    rootRule !== null && rootRule.includes("container-type: inline-size;"));
  check("the container rule carries no visual properties (layout-neutral)",
    rootRule !== null && !/background|padding|margin|border|color/.test(rootRule));
  check("LibraryPanel root carries the container class",
    panel.includes('<div className="library-root">'));
  check("the container class is library-scoped (guru shell page does not use it)",
    !guru.includes("library-root"));
}

// ---------------------------------------------------------------------------
// Case 2 — Base fallback for no-container-query browsers: stacked shell,
// 1-column grid (roomy, only less dense).
// ---------------------------------------------------------------------------
{
  const shellBase = blockAfter(css, ".library-shell {");
  check("base shell is a single stacked column",
    shellBase !== null && shellBase.includes("grid-template-columns: minmax(0, 1fr);"));
  const gridBase = blockAfter(css, ".library-card-grid {");
  check("base card grid is 1 column",
    gridBase !== null && gridBase.includes("grid-template-columns: minmax(0, 1fr);")
    && !gridBase.includes("repeat("));
}

// ---------------------------------------------------------------------------
// Case 3 — Container thresholds govern the columns (calibration: a card
// is never narrower than ±230px; ordering is deliberate so the 4-column
// rule only wins together with the two-column shell).
// ---------------------------------------------------------------------------
{
  const at500 = blockAfter(css, "@container (min-width: 500px)");
  check("@container 500px → card grid 2 columns (±242px cards)",
    at500 !== null && at500.includes(".library-card-grid")
    && at500.includes("repeat(2, minmax(0, 1fr))"));
  const at880 = blockAfter(css, "@container (min-width: 880px)");
  check("@container 880px → card grid 3 columns (shell still stacked)",
    at880 !== null && at880.includes(".library-card-grid")
    && at880.includes("repeat(3, minmax(0, 1fr))") && !at880.includes(".library-shell"));
  const at1180 = blockAfter(css, "@container (min-width: 1180px)");
  check("@container 1180px → shell becomes content + 300px sidebar",
    at1180 !== null && at1180.includes(".library-shell")
    && at1180.includes("minmax(0, 1fr) 300px"));
  const at1400 = blockAfter(css, "@container (min-width: 1400px)");
  check("@container 1400px → card grid 4 columns inside the content column",
    at1400 !== null && at1400.includes(".library-card-grid")
    && at1400.includes("repeat(4, minmax(0, 1fr))"));

  const i500 = css.indexOf("@container (min-width: 500px)");
  const i880 = css.indexOf("@container (min-width: 880px)");
  const i1180 = css.indexOf("@container (min-width: 1180px)");
  const i1400 = css.indexOf("@container (min-width: 1400px)");
  check("container rules are ordered 500 → 880 → 1180 → 1400 (later wins)",
    i500 !== -1 && i500 < i880 && i880 < i1180 && i1180 < i1400);
}

// ---------------------------------------------------------------------------
// Case 4 — No viewport media rule governs the library shell/grid anymore
// (no double-governing left over from the standalone page).
// ---------------------------------------------------------------------------
{
  const offenders = mediaBlocks(css).filter(
    (body) => body.includes(".library-shell") || body.includes(".library-card-grid"));
  check("no @media block sets columns for .library-shell / .library-card-grid",
    offenders.length === 0, `${offenders.length} offending block(s)`);
  check("the old viewport shell breakpoint (@media 1024px) is gone",
    !css.includes("@media (min-width: 1024px)"));
}

// ---------------------------------------------------------------------------
// Case 5 — Populer shelf: items hold a fixed 230px basis and never crush;
// the shelf itself keeps horizontal scrolling.
// ---------------------------------------------------------------------------
{
  const shelfRule = blockAfter(css, ".library-shelf {");
  check("shelf remains a horizontal scroller",
    shelfRule !== null && shelfRule.includes("overflow-x: auto"));
  check("shelf cards carry a fixed non-shrinking 230px basis",
    panel.includes('flex: "0 0 230px"') && panel.includes("width: 230"));
}

console.log(`\ntata-letak-perpustakaan-panel (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
