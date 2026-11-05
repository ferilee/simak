// Tests for the guarded permanent delete actions on the teacher
// workspace (web side). Run with bun from apps/web:
//   bun lib/hapus-materi-lkpd.test.mjs
//
// Step 1 module cards and Step 2 worksheet cards gain a subtle danger
// "Hapus" action. Clicking asks through the page's confirmDialog with
// the exact approved texts; success refreshes the lists via
// loadModules() and shows a brief message; a server refusal (409 —
// still assigned / already attempted) surfaces the server's message
// VERBATIM through the same setMessage pattern. The wiring is locked
// statically against the page source, as in the other web suites.
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
const page = read("../app/guru/page.tsx");

const moduleDeleteStart = page.indexOf("async function deleteModule(module: ModuleSummary)");
const moduleDeleteSegment = page.slice(moduleDeleteStart, page.indexOf("\n  }", moduleDeleteStart));
const worksheetDeleteStart = page.indexOf("async function deleteWorksheet(worksheet: WorksheetSummary)");
const worksheetDeleteSegment = page.slice(worksheetDeleteStart, page.indexOf("\n  }", worksheetDeleteStart));

// ---------------------------------------------------------------------------
// Case 1 — Hapus action present on both card types, danger styled.
// ---------------------------------------------------------------------------
{
  check("module card: Hapus button wired to deleteModule with the danger style",
    page.includes('onClick={() => void deleteModule(module)} className="module-row-action is-danger"'));
  check("worksheet card: Hapus button wired to deleteWorksheet with the danger style",
    page.includes('onClick={() => void deleteWorksheet(worksheet)} className="module-row-action is-danger"'));
  check("both cards label the action exactly 'Hapus'",
    (page.match(/className="module-row-action is-danger">\s*Hapus\s*<\/button>/g) ?? []).length === 2);

  const css = read("../app/globals.css");
  check("globals.css carries the soft danger style for row actions",
    css.includes(".module-row-action.is-danger") && css.includes("color: #b42318"));
}

// ---------------------------------------------------------------------------
// Case 2 — Confirm dialogs: exact texts + "Hapus" confirm label,
// asked BEFORE any request is made.
// ---------------------------------------------------------------------------
{
  check("deleteModule handler exists", moduleDeleteStart > -1);
  check("module confirm text is exact",
    moduleDeleteSegment.includes('`Hapus materi "${module.title}" secara permanen? Seluruh blok dan LKPD di dalamnya ikut terhapus. Tindakan ini tidak dapat dibatalkan.`'),
    moduleDeleteSegment.slice(0, 200));
  check("module confirm uses the shared confirmDialog with label 'Hapus'",
    moduleDeleteSegment.includes('confirmDialog(') && moduleDeleteSegment.includes('{ confirmLabel: "Hapus" }'));
  check("module confirm is asked before the DELETE request",
    moduleDeleteSegment.indexOf("confirmDialog(") < moduleDeleteSegment.indexOf('method: "DELETE"'));

  check("deleteWorksheet handler exists", worksheetDeleteStart > -1);
  check("worksheet confirm text is exact",
    worksheetDeleteSegment.includes('`Hapus LKPD "${worksheet.title}" secara permanen? Seluruh butir soalnya ikut terhapus. Tindakan ini tidak dapat dibatalkan.`'),
    worksheetDeleteSegment.slice(0, 200));
  check("worksheet confirm uses the shared confirmDialog with label 'Hapus'",
    worksheetDeleteSegment.includes('confirmDialog(') && worksheetDeleteSegment.includes('{ confirmLabel: "Hapus" }'));
  check("worksheet confirm is asked before the DELETE request",
    worksheetDeleteSegment.indexOf("confirmDialog(") < worksheetDeleteSegment.indexOf('method: "DELETE"'));
}

// ---------------------------------------------------------------------------
// Case 3 — Success refreshes the lists + brief message; refusal (409)
// surfaces the server's message verbatim via the same pattern.
// ---------------------------------------------------------------------------
{
  check("module delete calls DELETE /modules/:id",
    moduleDeleteSegment.includes('apiRequest(`/modules/${module.id}`, { method: "DELETE" })'));
  check("module delete success: brief message + list refresh",
    moduleDeleteSegment.includes('setMessage("Materi dihapus permanen.")')
    && moduleDeleteSegment.includes("await loadModules();"));
  check("module delete clears a stale selection of the deleted module",
    moduleDeleteSegment.includes("if (selectedId === module.id) setSelectedId(null);"));
  check("module delete refusal: server message verbatim via error.message",
    moduleDeleteSegment.includes('setMessage(error instanceof Error ? error.message : "Materi belum dapat dihapus.")'));

  check("worksheet delete calls DELETE /worksheets/:id",
    worksheetDeleteSegment.includes('apiRequest(`/worksheets/${worksheet.id}`, { method: "DELETE" })'));
  check("worksheet delete success: brief message + list refresh",
    worksheetDeleteSegment.includes('setMessage("LKPD dihapus permanen.")')
    && worksheetDeleteSegment.includes("await loadModules();"));
  check("worksheet delete clears a stale selection of the deleted worksheet",
    worksheetDeleteSegment.includes("if (selectedWorksheetId === worksheet.id) setSelectedWorksheetId(null);"));
  check("worksheet delete refusal: server message verbatim via error.message",
    worksheetDeleteSegment.includes('setMessage(error instanceof Error ? error.message : "LKPD belum dapat dihapus.")'));

  // The verbatim guarantee rests on apiRequest: ApiError.message IS the
  // server's `message` field. Locked so a future api.ts change cannot
  // silently start swallowing the 409 texts.
  const api = read("./api.ts");
  check("apiRequest throws ApiError carrying the server's message verbatim",
    api.includes("throw new ApiError(body.message ??"));
}

console.log(`\nhapus-materi-lkpd (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
