// Static source test for the module/worksheet list-row action bar on
// phones (calon v1.0.81).
// Run with bun from apps/web:  bun lib/aksi-baris-mobile.test.mjs
//
// Bug: on viewports ≤760px the guru module list (Langkah 1) and worksheet
// list (Langkah 2) placed EVERY .module-row-action button into the same
// grid cell (grid-column: 2; grid-row: 1 / span 2), so the buttons stacked
// on top of each other and Terbitkan was covered and untappable. The
// approved fix: both row components wrap their action buttons (plus the
// share badge that sits between them) in one .module-row-actions
// container; the container is display: contents on desktop (buttons stay
// direct grid items of .module-row, desktop unchanged) and becomes a
// full-width 4-column action bar under title + status on mobile, in the
// same pattern as .content-row-actions. The .content-row-actions rules
// themselves must not change.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");

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

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

console.log("Aksi baris mobile — tes statis sumber:");

// Markup: exactly two .module-row-actions wrappers (module row + worksheet
// row), each wrapping its four buttons in the original order and closing
// before the share-hint paragraph.
check(
  "wadah .module-row-actions muncul tepat 2x (baris modul + baris LKPD)",
  count(page, '<div className="module-row-actions">') === 2,
);

function segment(startNeedle, endNeedle) {
  const start = page.indexOf(startNeedle);
  const end = page.indexOf(endNeedle, start + startNeedle.length);
  return start >= 0 && end > start ? page.slice(start, end) : "";
}

function checkRow(segmentText, label, handlers, hintNeedle) {
  const open = segmentText.indexOf('<div className="module-row-actions">');
  const positions = handlers.map((handler) => segmentText.indexOf(handler));
  const hint = segmentText.indexOf(hintNeedle);
  const close = segmentText.indexOf("</div>", positions[positions.length - 1]);
  check(
    `${label}: wadah terbuka sebelum tombol pertama`,
    open >= 0 && positions.every((pos) => pos > open),
  );
  check(
    `${label}: urutan tombol utuh di dalam wadah`,
    positions.every((pos, i) => i === 0 || pos > positions[i - 1]),
  );
  check(
    `${label}: wadah menutup sesudah tombol Hapus, sebelum petunjuk berbagi`,
    close > positions[positions.length - 1] && (hint < 0 || close < hint),
  );
}

const moduleSegment = segment("function renderModuleRow", "function renderWorksheetRow");
check("segmen renderModuleRow ditemukan", moduleSegment.length > 0);
checkRow(
  moduleSegment,
  "baris modul",
  ["openPreview(module)", "changeStatus(module)", "toggleModuleShare(module)", "deleteModule(module)"],
  "module-share-hint",
);

const worksheetSegment = segment("function renderWorksheetRow", "const selectedModule");
check("segmen renderWorksheetRow ditemukan", worksheetSegment.length > 0);
checkRow(
  worksheetSegment,
  "baris LKPD",
  ["openWorksheetPreview(worksheet)", "changeWorksheetStatus(worksheet)", "toggleWorksheetShare(worksheet)", "deleteWorksheet(worksheet)"],
  "worksheetShareBadge?.hint",
);

// Button contents are untouched: the Terbitkan/Arsipkan toggle and the
// share toggle keep their labels in both rows (scoped to the two row
// segments — the assignment row elsewhere in the page has its own
// Terbitkan button).
check(
  "label Terbitkan/Arsipkan tetap ada di kedua baris",
  moduleSegment.includes("Terbitkan</>") && moduleSegment.includes("Arsipkan</>") &&
    worksheetSegment.includes("Terbitkan</>") && worksheetSegment.includes("Arsipkan</>"),
);
check(
  "label Bagikan/Dibagikan tetap ada di kedua baris",
  count(page, "Bagikan</>") === 2 && count(page, "Dibagikan</>") === 2,
);

// Base CSS: the wrapper is display: contents outside the mobile media
// query, so on desktop the buttons remain grid items of .module-row.
const firstMedia = css.indexOf("@media (max-width: 760px)");
const baseCss = firstMedia >= 0 ? css.slice(0, firstMedia) : css;
check(
  "wadah tembus pandang di desktop (display: contents di luar media query)",
  /\.module-row-actions \{\s*display: contents;/.test(baseCss),
);

// The old stacking rule must be gone from the whole stylesheet.
check(
  "aturan penumpuk lama (.module-row-action ke sel kolom 2) sudah tidak ada",
  !/\.module-row-action \{\s*grid-column: 2;\s*grid-row: 1 \/ span 2;/.test(css),
);

// Mobile CSS: assert inside the LAST max-width: 760px block (the one
// holding the .module-row mobile rules).
const mediaStart = css.lastIndexOf("@media (max-width: 760px)");
const media = mediaStart >= 0 ? css.slice(mediaStart) : "";
check("blok @media (max-width: 760px) ditemukan", mediaStart >= 0);
check(
  ".module-row menjadi satu kolom di mobile",
  /\.module-row \{\s*grid-template-columns: 1fr;/.test(media),
);
check(
  "bar aksi selebar penuh di baris ke-3, 4 kolom rata",
  /\.module-row-actions \{\s*grid-column: 1 \/ -1;\s*grid-row: 3;\s*display: grid;\s*grid-template-columns: repeat\(4, 1fr\);[^}]*width: 100%;/.test(media),
);
check(
  "tombol di bar aksi: ikon di atas label mini, tinggi ketuk 48px (≥44px)",
  /\.module-row-actions \.module-row-action \{[^}]*flex-direction: column;[^}]*min-height: 48px;[^}]*font-size: 11px;/.test(media),
);
check(
  "ikon tampil sebagai blok di dalam bar aksi mobile",
  /\.module-row-actions \.action-icon \{\s*display: block;[^}]*font-size: 15px;/.test(media),
);
check(
  "lencana status berbagi mengambil satu baris penuh di dalam bar aksi",
  /\.module-row-actions \.share-status-badge \{\s*grid-column: 1 \/ -1;/.test(media),
);

// The content-row action bar (blok materi & soal LKPD) must be unchanged:
// its base flex rule, its 4-column mobile bar, and its scoped button rule
// with the grid-placement reset all stay as they were.
check(
  "aturan dasar .content-row-actions tidak berubah (flex)",
  /\.content-row-actions \{\s*display: flex;\s*flex-wrap: wrap;/.test(baseCss),
);
check(
  "bar aksi .content-row-actions tetap 4 kolom selebar penuh di mobile",
  /\.content-row-actions \{\s*display: grid;\s*grid-template-columns: repeat\(4, 1fr\);[^}]*width: 100%;/.test(media),
);
check(
  "tombol .content-row-actions tetap membatalkan penempatan kisi (grid-column: auto)",
  /\.content-row-actions \.module-row-action \{[^}]*grid-column: auto;\s*grid-row: auto;[^}]*min-height: 48px;/.test(media),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
