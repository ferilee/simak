// Tests for "Perpustakaan Bersama" Fase 1 (v1.0.41) — web side. Run with
// bun from apps/web:
//   bun lib/perpustakaan-bersama.test.mjs
//
// The pure display helpers (kind label, card meta, copy confirm text,
// shared date, draft deep link) are tested behaviorally; the page wiring
// (sidebar link, share toggles with their confirm copy, attribution lines,
// shared block renderer reuse, library page surfaces and empty states) is
// locked statically against the page sources.
import { readFileSync } from "node:fs";
import {
  copiedDraftHref,
  copyConfirmText,
  formatSharedDate,
  libraryEntryMeta,
  libraryKindLabel,
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

// ---------------------------------------------------------------------------
// Case 1 — Pure display helpers.
// ---------------------------------------------------------------------------
{
  check("kind label: module → Materi", libraryKindLabel("module") === "Materi");
  check("kind label: worksheet → LKPD", libraryKindLabel("worksheet") === "LKPD");

  check(
    "module meta with shared worksheets",
    libraryEntryMeta({ kind: "module", block_count: 12, shared_worksheet_count: 2 }) === "12 blok · 2 LKPD ikut tersalin",
  );
  check(
    "module meta without shared worksheets says so honestly",
    libraryEntryMeta({ kind: "module", block_count: 5, shared_worksheet_count: 0 }) === "5 blok · tanpa LKPD yang dibagikan",
  );
  check(
    "module meta tolerates missing counts",
    libraryEntryMeta({ kind: "module" }) === "0 blok · tanpa LKPD yang dibagikan",
  );
  check(
    "worksheet meta shows items + points",
    libraryEntryMeta({ kind: "worksheet", item_count: 11, total_points: 100 }) === "11 soal · 100 poin",
  );

  check(
    "module copy confirm names the following worksheets",
    copyConfirmText({ kind: "module", title: "Bunga Tunggal", shared_worksheet_count: 3 })
      === 'Salin "Bunga Tunggal" ke akun Anda sebagai Draf? 3 LKPD yang dibagikan pada materi ini ikut tersalin.',
  );
  check(
    "module copy confirm without worksheets stays plain",
    copyConfirmText({ kind: "module", title: "Bunga Tunggal", shared_worksheet_count: 0 })
      === 'Salin "Bunga Tunggal" ke akun Anda sebagai Draf?',
  );
  check(
    "worksheet copy confirm is plain",
    copyConfirmText({ kind: "worksheet", title: "LKPD 1.1" }) === 'Salin "LKPD 1.1" ke akun Anda sebagai Draf?',
  );

  check("shared date formats in Indonesian", formatSharedDate("2026-11-04T05:00:00.000Z").includes("2026"));
  check("shared date: null → empty", formatSharedDate(null) === "");
  check("shared date: garbage → empty", formatSharedDate("bukan-tanggal") === "");

  check("draft href for a copied module", copiedDraftHref("module", 17) === "/guru?modul=17");
  check("draft href for a copied worksheet", copiedDraftHref("worksheet", 23) === "/guru?lkpd=23");
}

// ---------------------------------------------------------------------------
// Case 2 — Guru page wiring: sidebar, toggles, attribution, deep links.
// ---------------------------------------------------------------------------
{
  const guru = read("../app/guru/page.tsx");
  check("sidebar links to the library", guru.includes('href="/guru/perpustakaan"'));
  check("sidebar link is labelled Perpustakaan Bersama", guru.includes("Perpustakaan Bersama"));
  check("sidebar link carries the library icon svg", guru.includes("wizard-library-link") && guru.includes("M4 19.5v-15"));

  check("module share toggle handler exists", guru.includes("async function toggleModuleShare(module: ModuleSummary)"));
  check("module share-on asks first (confirmDialog)", /toggleModuleShare[\s\S]{0,1200}confirmDialog\(/.test(guru));
  check("module share confirm text is the approved one", guru.includes("Bagikan modul ini ke Perpustakaan Bersama? ${attachedCount} LKPD pada modul ini ikut dibagikan."));
  check("module share PATCHes with include_worksheets: true", guru.includes("include_worksheets: true"));
  check("worksheet share toggle handler exists", guru.includes("async function toggleWorksheetShare(worksheet: WorksheetSummary)"));
  check("worksheet share PATCHes the share endpoint", guru.includes("`/worksheets/${worksheet.id}/share`"));
  check("module share PATCHes the share endpoint", guru.includes("`/modules/${module.id}/share`"));

  check("share button shows Dibagikan when on / Bagikan when off (module)", guru.includes('{module.is_shared ? "Dibagikan" : "Bagikan"}'));
  check("share button shows Dibagikan when on / Bagikan when off (worksheet)", guru.includes('{worksheet.is_shared ? "Dibagikan" : "Bagikan"}'));
  check("share button exposes pressed state", guru.includes("aria-pressed={module.is_shared}") && guru.includes("aria-pressed={worksheet.is_shared}"));
  check("shared state styling hook exists", guru.includes('"is-shared"'));
  check("hint when module unshared but worksheets shared separately", guru.includes("LKPD pada modul ini masih dibagikan terpisah."));

  const attributionCount = (guru.match(/Disalin dari materi oleh/g) ?? []).length;
  check("attribution line appears in BOTH editor headers", attributionCount >= 2, `got ${attributionCount}`);

  check("guru page reads the ?modul= deep link once", guru.includes('params.get("modul")') && guru.includes("libraryDeepLinkRef"));
  check("guru page reads the ?lkpd= deep link once", guru.includes('params.get("lkpd")'));

  check("guru preview reuses the shared block renderer", guru.includes('import { ModuleBlockPreview } from "../../components/ModuleBlockPreview"') && guru.includes("<ModuleBlockPreview"));
  check("guru page no longer defines its own block renderer", !guru.includes("function PreviewBlock") && !guru.includes("function PreviewAttachmentBlock"));
}

// ---------------------------------------------------------------------------
// Case 3 — Library page wiring.
// ---------------------------------------------------------------------------
{
  const page = read("../app/guru/perpustakaan/page.tsx");
  check("page fetches the catalog", page.includes("`/library${suffix}`"));
  check("page sends q + kind filters", page.includes('params.set("q"') && page.includes('params.set("kind"'));
  check("kind chips cover Semua/Materi/LKPD", page.includes('"Semua"') && page.includes('"Materi"') && page.includes('"LKPD"'));
  check("empty state copy is the approved one", page.includes("Belum ada materi yang dibagikan guru lain."));
  check("no-results line is distinct from the empty state", page.includes("Tidak ada materi atau LKPD yang cocok dengan pencarian ini."));
  check("owner attribution is shown", page.includes("oleh {entry.owner_name}"));
  check("copy button label", page.includes("Salin ke punya saya"));
  check("preview button label", page.includes(">Pratinjau<") || page.includes("Pratinjau"));
  check("copy asks via the shared confirm text", page.includes("confirmDialog(copyConfirmText(entry)"));
  check("copy calls the module copy endpoint", page.includes("`/library/modules/${entry.id}/copy`"));
  check("copy calls the worksheet copy endpoint", page.includes("`/library/worksheets/${entry.id}/copy`"));
  check("success links to the copied draft", page.includes("Buka draf salinan") && page.includes("copiedDraftHref"));
  check("module preview fetches the library module preview", page.includes("`/library/modules/${entry.id}`"));
  check("worksheet preview fetches the library worksheet preview", page.includes("`/library/worksheets/${entry.id}`"));
  check("preview reuses the shared block renderer", page.includes("ModuleBlockPreview") && page.includes('from "../../../components/ModuleBlockPreview"'));
  check("page does NOT fork a video embed renderer", !page.includes("youtube-nocookie"));
  check("worksheet preview shows the teacher-only box", page.includes("Khusus guru") && page.includes("Kunci/Rubrik:"));
  check("worksheet preview shows rubric_max + points", page.includes("item.rubric_max") && page.includes("item.points"));
  check("worksheet preview marks the PG key option", page.includes('(kunci)'));
  check("preview has a back link to the list", page.includes("Kembali ke perpustakaan"));
  check("page links back to the guru room", page.includes('href="/guru"'));
  check("page is guru-gated client-side too", page.includes('me.user.role !== "guru"'));
}

// ---------------------------------------------------------------------------
// Case 4 — Students see no trace of the library.
// ---------------------------------------------------------------------------
{
  const muridNilai = read("../app/murid/nilai/page.tsx");
  const muridHome = read("../app/murid/assignments/[id]/page.tsx");
  check("murid pages never mention the library", !muridNilai.includes("perpustakaan") && !muridHome.includes("perpustakaan"));
  check("murid pages never call /library", !muridNilai.includes("/library") && !muridHome.includes("/library"));
}

console.log(`\nperpustakaan-bersama (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
