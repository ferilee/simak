// Static source test for the clearly visible download buttons (v1.0.27).
// Run with bun from apps/web:  bun lib/tombol-unduh-jelas.test.mjs
//
// The "Unduh Excel (CSV)" / "Unduh PDF" buttons in the Rekap Sesi and
// Laporan Rentang panels used styles.secondaryButton (white, thin grey
// border, no weight, no cursor) and read as dead text. The approved fix:
// dedicated classes (green for CSV, red for PDF, white bold text) plus a
// download icon before the label, in BOTH panels. The shared
// styles.secondaryButton must stay intact for the other buttons using
// it, and the onClick handlers and labels must not change.
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

console.log("Tombol unduh jelas — tes statis sumber:");

const DOWNLOAD_PATH = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4";

// Markup: both panels (Laporan Rentang + Rekap Sesi) get the new classes.
check(
  "kelas download-button-csv muncul 2x (rentang + sesi)",
  count(page, 'className="download-button download-button-csv"') === 2,
);
check(
  "kelas download-button-pdf muncul 2x (rentang + sesi)",
  count(page, 'className="download-button download-button-pdf"') === 2,
);
check(
  "ikon unduh (svg row-action-icon) mendahului label di keempat tombol",
  count(page, 'download-button-csv"><svg className="row-action-icon"') === 2 &&
    count(page, 'download-button-pdf"><svg className="row-action-icon"') === 2 &&
    count(page, DOWNLOAD_PATH) === 4,
);
check(
  "tidak ada lagi tombol unduh bergaya secondaryButton",
  !page.includes('downloadRangeReport("csv")} style={styles.secondaryButton}') &&
    !page.includes('downloadRangeReport("pdf")} style={styles.secondaryButton}') &&
    !page.includes('"csv")} style={styles.secondaryButton}>Unduh') &&
    !page.includes('"pdf")} style={styles.secondaryButton}>Unduh'),
);
check(
  "handler unduh tidak berubah (rentang + sesi, csv + pdf)",
  page.includes('onClick={() => void downloadRangeReport("csv")}') &&
    page.includes('onClick={() => void downloadRangeReport("pdf")}') &&
    page.includes('onClick={() => void downloadSessionReport(sessionReport.assignment.id, "csv")}') &&
    page.includes('onClick={() => void downloadSessionReport(sessionReport.assignment.id, "pdf")}'),
);
check(
  "teks tombol tetap persis (Unduh Excel (CSV) 2x, Unduh PDF 2x)",
  count(page, ">Unduh Excel (CSV)</button>") === 2 && count(page, ">Unduh PDF</button>") === 2,
);

// The shared secondary style stays untouched for its other buttons.
check(
  "styles.secondaryButton tetap ada persis seperti semula",
  page.includes('secondaryButton: { border: "1px solid #d0d5dd", borderRadius: 8, background: "white", padding: "9px 12px" }'),
);
check(
  "styles.secondaryButton tetap dipakai tombol lain (mis. Batal)",
  count(page, "style={styles.secondaryButton}>Batal</button>") >= 3,
);

// CSS: base pill, green CSV, red PDF, darker hovers.
check(
  "kelas dasar .download-button (inline-flex, teks putih tebal, cursor pointer)",
  /\.download-button \{\s*display: inline-flex;[^}]*gap: 8px;[^}]*color: #ffffff;[^}]*font-weight: 700;[^}]*cursor: pointer;/.test(css),
);
check(
  "CSV hijau #067647, hover #05603a",
  /\.download-button-csv \{\s*border-color: #067647;\s*background: #067647;/.test(css) &&
    /\.download-button-csv:hover \{\s*border-color: #05603a;\s*background: #05603a;/.test(css),
);
check(
  "PDF merah #b42318, hover #912018",
  /\.download-button-pdf \{\s*border-color: #b42318;\s*background: #b42318;/.test(css) &&
    /\.download-button-pdf:hover \{\s*border-color: #912018;\s*background: #912018;/.test(css),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
