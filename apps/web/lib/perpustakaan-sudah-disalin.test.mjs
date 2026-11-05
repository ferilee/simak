// Tests for the "Sudah disalin" state on Perpustakaan Bersama cards
// (web side). Run with bun from apps/web:
//   bun lib/perpustakaan-sudah-disalin.test.mjs
//
// The API marks catalog entries the requesting teacher has already
// copied (sudah_disalin). Such a card shows a DISABLED "✓ Sudah disalin"
// button instead of the copy action, while Pratinjau stays enabled and
// the not-yet-copied flow (confirm → copy → draft link) is untouched.
// The predicate + label are tested behaviorally; the panel wiring is
// locked statically against the panel source (components/LibraryPanel.tsx
// — the library UI lives inside the guru shell now).
import { readFileSync } from "node:fs";
import { isSudahDisalin, SUDAH_DISALIN_LABEL } from "./perpustakaan.ts";

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
// Case 1 — Predicate + label.
// ---------------------------------------------------------------------------
{
  check("label is exactly the approved one", SUDAH_DISALIN_LABEL === "✓ Sudah disalin", SUDAH_DISALIN_LABEL);
  check("flag true → sudah disalin", isSudahDisalin({ kind: "module", id: 3, sudah_disalin: true }) === true);
  check("flag false → belum disalin", isSudahDisalin({ kind: "worksheet", id: 8, sudah_disalin: false }) === false);
  check("flag missing (older payload) → belum disalin", isSudahDisalin({ kind: "module", id: 3 }) === false);
  check("flag undefined → belum disalin", isSudahDisalin({ kind: "module", id: 3, sudah_disalin: undefined }) === false);
}

// ---------------------------------------------------------------------------
// Case 2 — Card wiring on the library panel (static locks).
// ---------------------------------------------------------------------------
{
  const page = read("../components/LibraryPanel.tsx");
  check("page imports the predicate + label from the lib",
    page.includes("isSudahDisalin") && page.includes("SUDAH_DISALIN_LABEL") && page.includes('from "../lib/perpustakaan"'));
  check("copied card renders the disabled button with the label",
    page.includes("disabled style={styles.primaryButtonDisabled}") && page.includes("{SUDAH_DISALIN_LABEL}"));
  check("the predicate drives exactly one branch (the card copy button)",
    (page.match(/isSudahDisalin\(entry\)/g) ?? []).length === 1,
    `got ${(page.match(/isSudahDisalin\(entry\)/g) ?? []).length}`);
  check("disabled style is visibly greyed + not-allowed",
    page.includes('primaryButtonDisabled: {') && page.includes('cursor: "not-allowed"') && page.includes('background: "#eaecf0"'));
  check("not-yet-copied card keeps the active copy button",
    // Desain ulang: kartu kini komponen LibraryCard — tombolnya memanggil
    // prop onCopy, yang dihalaman dihubungkan ke copyEntry yang sama.
    page.includes("onClick={() => onCopy(entry)}")
    && page.includes("onCopy={(entry) => void copyEntry(entry)}")
    && page.includes('"Salin ke punya saya"'));
  check("copy flow still confirms via the shared confirm text", page.includes("confirmDialog(copyConfirmText(entry)"));
  check("Pratinjau button is untouched by the copied state",
    page.includes("onClick={() => void openPreview(entry)}") && page.includes("styles.secondaryButton"));

  const lib = read("./perpustakaan.ts");
  check("LibraryEntry type carries the optional flag", lib.includes("sudah_disalin?: boolean"));
}

console.log(`\nperpustakaan-sudah-disalin (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
