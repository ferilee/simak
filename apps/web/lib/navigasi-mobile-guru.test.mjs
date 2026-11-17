// Tests for the guru mobile navigation rearrangement (calon
// v1.0.73): on mobile (≤760px) the guru shell's bottom bar holds
// ONLY the five workflow steps; the three secondary areas
// (Perpustakaan Bersama, CP & ATP, Jurnal Belajar) move behind a
// grid-icon FAB that opens a bottom sheet, and the FAB carries the
// unreviewed-journal badge so Jurnal Belajar is not forgotten.
// Run with bun from apps/web:
//   bun lib/navigasi-mobile-guru.test.mjs
//
// Locked here:
//  - journalFabBadgeLabel (lib/jurnal.ts) is pure: hidden for
//    unloaded/failed/zero counts, the number itself up to 99,
//    "99+" above that.
//  - GuruMobileMenu renders the grid FAB (four rects, accessible
//    label "Menu lainnya", never a "+" affordance) and a dialog
//    sheet with EXACTLY the three secondary destinations, closing
//    on backdrop click / Escape / close button, and choosing a
//    destination closes the sheet before navigating.
//  - The guru page wires the component to the same view openers as
//    the sidebar and feeds the badge from GET /guru/jurnal,
//    fail-soft (an error just clears the badge).
//  - globals.css hides the sidebar's three secondary links only
//    inside the ≤760px guru media rules, shows the FAB/sheet only
//    there too, and the desktop sidebar keeps its three entries.
//  - The murid shell never references the component.
import { readFileSync } from "node:fs";
import { journalFabBadgeLabel } from "./jurnal.ts";

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
const guru = read("../app/guru/page.tsx");
const murid = read("../app/murid/page.tsx");
const menu = read("../components/GuruMobileMenu.tsx");
const css = read("../app/globals.css");

// ---------------------------------------------------------------------------
// Case 1 — Badge label helper (pure).
// ---------------------------------------------------------------------------
{
  check("badge hidden before the count loads (null)", journalFabBadgeLabel(null) === null);
  check("badge hidden for undefined", journalFabBadgeLabel(undefined) === null);
  check("badge hidden for zero", journalFabBadgeLabel(0) === null);
  check("badge hidden for negative counts", journalFabBadgeLabel(-4) === null);
  check("badge hidden for NaN (failed/garbled payload)", journalFabBadgeLabel(Number.NaN) === null);
  check("badge hidden for Infinity", journalFabBadgeLabel(Number.POSITIVE_INFINITY) === null);
  check("badge shows small counts verbatim", journalFabBadgeLabel(1) === "1" && journalFabBadgeLabel(41) === "41");
  check("badge shows 99 verbatim", journalFabBadgeLabel(99) === "99");
  check("badge condenses counts above 99", journalFabBadgeLabel(100) === "99+" && journalFabBadgeLabel(250) === "99+");
  check("badge floors fractional counts", journalFabBadgeLabel(3.9) === "3");
}

// ---------------------------------------------------------------------------
// Case 2 — FAB: grid icon, accessible label, badge wiring.
// ---------------------------------------------------------------------------
{
  check("FAB carries the accessible label 'Menu lainnya'",
    menu.includes('aria-haspopup="dialog"') && menu.includes('"Menu lainnya"'));
  check("FAB icon is a four-square grid (four rects), not a plus",
    (menu.match(/<rect /g) ?? []).length === 4 && !menu.includes("M12 5v14M5 12h14"));
  check("FAB badge renders only through the pure helper",
    menu.includes("journalFabBadgeLabel(unreviewedTotal)") && menu.includes("guru-mobile-fab-badge"));
  check("FAB label announces the unreviewed count for screen readers",
    menu.includes("entri jurnal belum ditinjau"));
}

// ---------------------------------------------------------------------------
// Case 3 — Bottom sheet: exactly the three secondary destinations.
// ---------------------------------------------------------------------------
{
  check("sheet is a modal dialog labelled 'Menu lainnya'",
    menu.includes('role="dialog"') && menu.includes('aria-modal="true"') && menu.includes('aria-label="Menu lainnya"'));
  check("sheet holds exactly three destination cards (wizard-library-link)",
    (menu.match(/wizard-library-link/g) ?? []).length === 3,
    `found ${(menu.match(/wizard-library-link/g) ?? []).length}`);
  check("sheet destinations are Perpustakaan Bersama, CP & ATP, Jurnal Belajar",
    menu.includes("<strong>Perpustakaan Bersama</strong>")
    && menu.includes("<strong>CP &amp; ATP</strong>")
    && menu.includes("<strong>Jurnal Belajar</strong>"));
  check("sheet marks the active view like the sidebar does",
    menu.includes('activeView === "perpustakaan"') && menu.includes('activeView === "kurikulum"') && menu.includes('activeView === "jurnal"'));

  const chooseStart = menu.indexOf("function choose");
  const chooseSegment = menu.slice(chooseStart, menu.indexOf("return (", chooseStart));
  check("choosing a destination closes the sheet before navigating",
    chooseSegment.includes("setOpen(false)") && chooseSegment.includes("opener()"));
  check("sheet closes on backdrop click, Escape, and its close button",
    menu.includes('className="guru-mobile-sheet-overlay" onClick={() => setOpen(false)}')
    && menu.includes('event.key === "Escape"')
    && menu.includes('aria-label="Tutup menu"'));
  check("sheet locks body scroll while open (Modal pattern)",
    menu.includes("document.body.style.overflow = \"hidden\""));
}

// ---------------------------------------------------------------------------
// Case 4 — Guru page wiring: same openers, fail-soft badge feed.
// ---------------------------------------------------------------------------
{
  check("guru page renders GuruMobileMenu with the sidebar's own openers",
    guru.includes("<GuruMobileMenu")
    && guru.includes("onOpenLibrary={openLibraryView}")
    && guru.includes("onOpenCurriculum={openCurriculumView}")
    && guru.includes("onOpenJournal={openJournalView}"));
  check("badge count comes from the journal overview endpoint",
    guru.includes('apiRequest<{ ok: true; data: GuruJournalOverviewData }>("/guru/jurnal")')
    && guru.includes("setJurnalUnreviewedTotal(response.data.unreviewed_total)"));
  check("badge feed is fail-soft: an error just clears the badge",
    guru.includes("if (!cancelled) setJurnalUnreviewedTotal(null);"));
  check("badge refreshes after leaving the journal view",
    guru.includes('if (guruView === "jurnal") return;'));
  check("desktop sidebar keeps its three secondary entries untouched",
    (guru.match(/wizard-library-link/g) ?? []).length === 3,
    `found ${(guru.match(/wizard-library-link/g) ?? []).length}`);
  check("the five steps stay the only step navigation (mobileTitles intact)",
    guru.includes('mobileTitle: "Materi"') && guru.includes('mobileTitle: "LKPD"')
    && guru.includes('mobileTitle: "Kelas"') && guru.includes('mobileTitle: "Terbit"')
    && guru.includes('mobileTitle: "Hasil"'));
}

// ---------------------------------------------------------------------------
// Case 5 — CSS gating: mobile-only, desktop untouched, murid untouched.
// ---------------------------------------------------------------------------
{
  check("FAB and sheet are display:none by default (desktop never shows them)",
    css.includes(".guru-mobile-fab {\n  display: none;\n}")
    && css.includes(".guru-mobile-sheet-overlay {\n  display: none;\n}"));

  const hideRuleAt = css.indexOf(".wizard-theme-guru .wizard-sidebar .wizard-library-link");
  check("mobile bottom bar hides the sidebar's secondary links",
    hideRuleAt !== -1 && css.slice(hideRuleAt, hideRuleAt + 140).includes("display: none"));
  check("the hide rule lives inside the ≤760px media block",
    hideRuleAt > css.indexOf("@media (max-width: 760px)"));

  const fabRuleAt = css.lastIndexOf(".guru-mobile-fab {");
  const fabRule = css.slice(fabRuleAt, fabRuleAt + 700);
  check("FAB is fixed above the bottom bar with safe-area respect",
    fabRule.includes("position: fixed") && fabRule.includes("display: grid")
    && fabRule.includes("env(safe-area-inset-bottom)") && fabRule.includes("env(safe-area-inset-right)"));
  check("FAB sits above the bottom bar but below the modal layer",
    fabRule.includes("z-index: 30"));

  const sheetRuleAt = css.lastIndexOf(".guru-mobile-sheet-overlay {");
  const sheetRule = css.slice(sheetRuleAt, sheetRuleAt + 260);
  check("sheet overlay anchors the sheet to the bottom edge",
    sheetRule.includes("position: fixed") && sheetRule.includes("align-items: flex-end"));
  check("sheet badge pill is styled", css.includes(".guru-mobile-fab-badge {"));

  check("murid shell never references the guru mobile menu",
    !murid.includes("GuruMobileMenu") && !murid.includes("guru-mobile-fab"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
