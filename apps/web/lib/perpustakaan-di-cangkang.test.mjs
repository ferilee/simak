// Tests for Perpustakaan Bersama living INSIDE the guru shell (web side).
// Run with bun from apps/web:
//   bun lib/perpustakaan-di-cangkang.test.mjs
//
// The library is no longer a standalone page: components/LibraryPanel.tsx
// renders it in the shell's right pane as a sibling view of the five
// wizard steps. The sidebar entry is a view-switch button (no page
// navigation), the panel mounts lazily on first activation and stays
// mounted (hidden via data-active, like the step panels), the old route
// /guru/perpustakaan only redirects into the shell with the library view
// preselected (?tampilan=perpustakaan), and a successful copy hands the
// new draft back to the shell through a callback instead of navigating
// to ?modul=/?lkpd= (those deep links still work for outside arrivals).
// All of it is wiring, so it is locked statically against the sources.
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
const guru = read("../app/guru/page.tsx");
const panel = read("../components/LibraryPanel.tsx");
const route = read("../app/guru/perpustakaan/page.tsx");
const css = read("../app/globals.css");

// ---------------------------------------------------------------------------
// Case 1 — Shell view state: langkah | perpustakaan, lazy mount.
// ---------------------------------------------------------------------------
{
  check("shell has a dedicated view state beside guruStep",
    guru.includes('const [guruView, setGuruView] = useState<"langkah" | "perpustakaan">("langkah")'));
  check("steps visibility derives from the view (langkahTampil)",
    guru.includes('const langkahTampil = guruView === "langkah";')
    && guru.includes("data-active={langkahTampil && guruStep === 0}")
    && guru.includes("data-active={langkahTampil && guruStep === 4 && hasilTab === \"nilai\"}"));
  check("library mounts lazily (own mounted flag, starts unmounted)",
    guru.includes("const [libraryMounted, setLibraryMounted] = useState(false)"));

  const openSegment = guru.slice(guru.indexOf("function openLibraryView"), guru.indexOf("function openCopiedDraft"));
  check("opening the library mounts it and switches the view — without touching guruStep",
    openSegment.includes("setLibraryMounted(true)") && openSegment.includes('setGuruView("perpustakaan")')
    && !openSegment.includes("setGuruStep("));
}

// ---------------------------------------------------------------------------
// Case 2 — Sidebar entry is a view switch, not a navigation.
// ---------------------------------------------------------------------------
{
  check("no page link to the library remains anywhere in the shell",
    !guru.includes('href="/guru/perpustakaan"'));
  check("sidebar entry is a button wired to openLibraryView, same card + label",
    guru.includes("onClick={openLibraryView}") && guru.includes("wizard-library-link")
    && guru.includes("<strong>Perpustakaan Bersama</strong>") && guru.includes("Materi &amp; LKPD dari guru lain"));
  check("sidebar entry shows its active state while the library view is open",
    guru.includes('className={`wizard-library-link${guruView === "perpustakaan" ? " is-active" : ""}`}')
    && guru.includes('aria-current={guruView === "perpustakaan" ? "page" : undefined}'));
  check("step buttons return to the langkah view and only highlight there",
    guru.includes('onClick={() => { setGuruView("langkah"); setGuruStep(index); }}')
    && guru.includes('langkahTampil && guruStep === index ? "is-active" : ""'));
  check("button reset + active styles exist for the link-turned-button",
    css.includes("button.wizard-library-link") && css.includes(".wizard-library-link.is-active"));
}

// ---------------------------------------------------------------------------
// Case 3 — The panel is a sibling view: lazy-mounted, kept mounted.
// ---------------------------------------------------------------------------
{
  check("shell imports the panel component",
    guru.includes('import { LibraryPanel } from "../../components/LibraryPanel";'));
  check("panel renders inside a wizard-step-panel section driven by data-active",
    guru.includes('data-active={guruView === "perpustakaan"}')
    && guru.includes("<LibraryPanel onOpenCopiedDraft={openCopiedDraft} />"));
  check("mounting is gated by libraryMounted ONLY (never unmounted by view switches)",
    guru.includes("{libraryMounted ? (")
    && (guru.match(/<LibraryPanel /g) ?? []).length === 1);
  check("shell heading swaps to the library while its view is active",
    guru.includes('guruView === "perpustakaan" ? (') && guru.includes("<h2>Perpustakaan Bersama</h2>"));
  check("step footer (prev/next) renders only in the langkah view",
    guru.includes("{langkahTampil ? (") && guru.includes('className="wizard-footer"'));
}

// ---------------------------------------------------------------------------
// Case 4 — Old route is only a redirect; preselect param opens the view.
// ---------------------------------------------------------------------------
{
  check("old route redirects into the shell with the library preselected",
    route.includes('import { redirect } from "next/navigation";')
    && route.includes('redirect("/guru?tampilan=perpustakaan")'));
  check("old route carries no library UI anymore",
    !route.includes("<LibraryPanel") && !route.includes("library-shell")
    && !route.includes("Salin ke punya saya") && route.split("\n").length < 20,
    `route has ${route.split("\n").length} lines`);
  check("shell reads the preselect param once, with the deep-link params",
    guru.includes('params.get("tampilan") === "perpustakaan"') && guru.includes("libraryDeepLinkRef"));
  const preselectAt = guru.indexOf('params.get("tampilan") === "perpustakaan"');
  const preselectSegment = guru.slice(preselectAt, preselectAt + 220);
  check("preselect mounts the panel and activates the library view",
    preselectSegment.includes("setLibraryMounted(true)") && preselectSegment.includes('setGuruView("perpustakaan")'));
}

// ---------------------------------------------------------------------------
// Case 5 — Copy hand-off: callback in-shell, href fallback, deep links.
// ---------------------------------------------------------------------------
{
  check("shell defines the copy callback with the draft kind/id signature",
    guru.includes('function openCopiedDraft(kind: "module" | "worksheet", id: number)'));
  const callbackSegment = guru.slice(guru.indexOf("function openCopiedDraft"), guru.indexOf("async function loadModules"));
  check("callback records the draft, returns to the steps, and reloads the lists",
    callbackSegment.includes("pendingCopiedDraftRef.current = { kind, id }")
    && callbackSegment.includes('setGuruView("langkah")') && callbackSegment.includes("void loadModules()"));
  check("loadModules applies the pending draft through the shared selection logic",
    guru.includes("selectDraftFromLists(pendingDraft.kind, pendingDraft.id, response.data, worksheetResponse.data)"));
  check("one shared selection helper serves deep links AND the callback",
    guru.includes("function selectDraftFromLists(")
    && guru.includes('selectDraftFromLists("module", moduleParam, response.data, worksheetResponse.data)')
    && guru.includes('selectDraftFromLists("worksheet", worksheetParam, response.data, worksheetResponse.data)'));
  check("the ?modul= / ?lkpd= deep links still exist for outside arrivals",
    guru.includes('params.get("modul")') && guru.includes('params.get("lkpd")'));

  check("panel declares the optional callback prop",
    panel.includes('onOpenCopiedDraft?: (kind: "module" | "worksheet", id: number) => void;'));
  check("panel's copied banner calls the callback when the shell provides one",
    panel.includes("onClick={() => onOpenCopiedDraft(copiedLink.kind, copiedLink.id)}"));
  check("panel falls back to the copied-draft href without the callback",
    panel.includes("copiedDraftHref(copiedLink.kind, copiedLink.id)") && panel.includes("Buka draf salinan"));
}

// ---------------------------------------------------------------------------
// Case 6 — Embedded chrome: no standalone page furniture in the panel.
// ---------------------------------------------------------------------------
{
  // Akar panel kini membawa kelas container tata letak (library-root,
  // lihat tata-letak-perpustakaan-panel); tetap div di dalam panel
  // cangkang, bukan <main> halaman mandiri.
  check("panel root is the library-root div inside the shell panel, not a page <main>",
    panel.includes("  return (\n    <div className=\"library-root\">\n      <section style={styles.hero}>") && !panel.includes("<main"));
  check("standalone back-to-guru link is gone from the panel",
    !panel.includes("← Ruang guru") && !panel.includes('href="/guru"') && !panel.includes("styles.container"));
  check("in-library back buttons (preview → list) survive",
    panel.includes("Kembali ke perpustakaan"));
}

console.log(`\nperpustakaan-di-cangkang (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
