// Tests for the Perpustakaan Bersama share-approval queue (web side).
// Run with bun from apps/web:
//   bun lib/persetujuan-berbagi.test.mjs
//
// Owners see a share-status badge beside the Bagikan toggle on their
// Step 1/Step 2 cards (the toggle itself follows share_status: a pending
// request shows ON so turning it off cancels the request). The library
// page shows the decision queue — plus a Tarik action on live cards —
// only to the approver, driven by the API's viewer meta. The pure display
// rules are tested behaviorally; the page wiring is locked statically.
import { readFileSync } from "node:fs";
import {
  approvalDecisionPath,
  approvalEntryMeta,
  approvalKindLabel,
  approvalTarikPath,
  approvalToLibraryEntry,
  formatRequestedDate,
  shareStatusBadge,
  shareToggleOn,
  tarikConfirmText,
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
// Case 1 — Toggle display derives from share_status (pure).
// ---------------------------------------------------------------------------
{
  check("menunggu → saklar menyala (mematikan = membatalkan pengajuan)", shareToggleOn("menunggu", false) === true);
  check("dibagikan → saklar menyala", shareToggleOn("dibagikan", true) === true);
  check("pribadi → saklar mati", shareToggleOn("pribadi", false) === false);
  check("ditolak → saklar mati (menyalakan = mengajukan lagi)", shareToggleOn("ditolak", false) === false);
  check("status belum dikenal (payload lama) → cadangan is_shared", shareToggleOn(undefined, true) === true && shareToggleOn(null, false) === false);
}

// ---------------------------------------------------------------------------
// Case 2 — Status badges beside the toggle (pure).
// ---------------------------------------------------------------------------
{
  const waiting = shareStatusBadge("menunggu");
  check("menunggu → lencana kuning 'Menunggu persetujuan', tanpa petunjuk",
    waiting !== null && waiting.label === "Menunggu persetujuan" && waiting.tone === "amber" && waiting.hint === null);
  const rejected = shareStatusBadge("ditolak");
  check("ditolak → lencana merah 'Ditolak' + petunjuk pengajuan ulang yang disetujui",
    rejected !== null && rejected.label === "Ditolak" && rejected.tone === "red"
      && rejected.hint === "Ajukan lagi dengan menyalakan Bagikan setelah diperbaiki.");
  check("pribadi/dibagikan/tidak dikenal → tanpa lencana (tampilan Fase 1)",
    shareStatusBadge("pribadi") === null && shareStatusBadge("dibagikan") === null && shareStatusBadge(undefined) === null);
}

// ---------------------------------------------------------------------------
// Case 3 — Queue entry helpers (pure).
// ---------------------------------------------------------------------------
{
  check("queue kind labels", approvalKindLabel("modul") === "Materi" && approvalKindLabel("lkpd") === "LKPD");
  check("queue module meta with pending worksheets",
    approvalEntryMeta({ kind: "modul", id: 1, title: "X", teacher_name: "Rully", share_requested_at: null, subject: null, block_count: 12, pending_worksheet_count: 2 }) === "12 blok · 2 LKPD ikut menunggu");
  check("queue module meta without pending worksheets",
    approvalEntryMeta({ kind: "modul", id: 1, title: "X", teacher_name: "Rully", share_requested_at: null, subject: null, block_count: 12, pending_worksheet_count: 0 }) === "12 blok · tanpa LKPD yang menunggu");
  check("queue worksheet meta",
    approvalEntryMeta({ kind: "lkpd", id: 2, title: "Y", teacher_name: "Rully", share_requested_at: null, subject: null, item_count: 10 }) === "10 soal");
  check("requested date formats in Indonesian", formatRequestedDate("2026-11-05T05:00:00.000Z").includes("2026"));
  check("requested date: null → empty", formatRequestedDate(null) === "");

  const asLibrary = approvalToLibraryEntry({ kind: "lkpd", id: 8, title: "LKPD 1.1", teacher_name: "Rully", share_requested_at: "2026-11-05T05:00:00.000Z", subject: "KKA", item_count: 10 });
  check("queue entry converts to a catalog entry for the shared preview",
    asLibrary.kind === "worksheet" && asLibrary.id === 8 && asLibrary.owner_name === "Rully" && asLibrary.subject === "KKA");
  const asLibraryModule = approvalToLibraryEntry({ kind: "modul", id: 5, title: "Eksponen", teacher_name: "Rully", share_requested_at: null, subject: "Matematika", block_count: 3, pending_worksheet_count: 0 });
  check("queue module converts to kind 'module'", asLibraryModule.kind === "module" && asLibraryModule.id === 5);
}

// ---------------------------------------------------------------------------
// Case 4 — Decision/tarik endpoints + confirm text (pure).
// ---------------------------------------------------------------------------
{
  const moduleEntry = { kind: "modul", id: 5, title: "Eksponen", teacher_name: "Rully", share_requested_at: null, subject: null };
  const worksheetEntry = { kind: "lkpd", id: 8, title: "LKPD 1.1", teacher_name: "Rully", share_requested_at: null, subject: null };
  check("decision path for a module", approvalDecisionPath(moduleEntry) === "/library/approvals/modules/5");
  check("decision path for a worksheet", approvalDecisionPath(worksheetEntry) === "/library/approvals/worksheets/8");
  check("tarik path for a module", approvalTarikPath({ kind: "module", id: 5, title: "Eksponen", subject: null, owner_name: "Rully", shared_at: null }) === "/library/approvals/modules/5/tarik");
  check("tarik path for a worksheet", approvalTarikPath({ kind: "worksheet", id: 8, title: "LKPD 1.1", subject: null, owner_name: "Rully", shared_at: null }) === "/library/approvals/worksheets/8/tarik");
  check("tarik confirm text is exactly the approved one",
    tarikConfirmText() === "Tarik materi ini dari Perpustakaan Bersama? Salinan yang sudah dibuat guru lain tidak terpengaruh.");
}

// ---------------------------------------------------------------------------
// Case 5 — Guru page wiring: badges + toggle derivation (static).
// ---------------------------------------------------------------------------
{
  const guru = read("../app/guru/page.tsx");
  check("guru page derives both toggles via shareToggleOn",
    guru.includes("shareToggleOn(module.share_status, module.is_shared)") && guru.includes("shareToggleOn(worksheet.share_status, worksheet.is_shared)"));
  check("guru page renders the status badge beside both toggles",
    guru.includes("shareStatusBadge(module.share_status)") && guru.includes("shareStatusBadge(worksheet.share_status)")
      && (guru.match(/share-status-badge/g) ?? []).length >= 2);
  check("guru page sends the derived toggle state (menunggu dapat dibatalkan)",
    guru.includes("shared: !shareOn") && guru.includes("shared: !shareOn, include_worksheets: true"));
  check("guru page explains the pending outcome after toggling on",
    guru.includes("menunggu persetujuan penyetuju Perpustakaan Bersama"));
  const css = read("../app/globals.css");
  check("badge styles exist for both tones", css.includes(".share-status-badge.is-amber") && css.includes(".share-status-badge.is-red"));
}

// ---------------------------------------------------------------------------
// Case 6 — Library panel wiring: queue section is approver-only (static).
// (The library UI lives in components/LibraryPanel.tsx, inside the guru
// shell; the old route file only redirects.)
// ---------------------------------------------------------------------------
{
  const page = read("../components/LibraryPanel.tsx");
  check("page reads the viewer meta from the catalog response",
    page.includes("response.approver === true") && page.includes("response.pending_count"));
  check("page fetches the approvals queue", page.includes('"/library/approvals"'));
  check("queue section renders only for the approver",
    page.includes("isApprover && approvals !== null && approvals.length > 0") && page.includes("Menunggu persetujuan ("));
  check("queue cards offer Pratinjau + Setujui + Tolak",
    page.includes("openPreview(approvalToLibraryEntry(entry))") && page.includes('"setujui"') && page.includes('"tolak"')
      && page.includes(">Setujui<") === false && page.includes("Setujui") && page.includes("Tolak"));
  check("decisions post through the decision-path helper", page.includes("approvalDecisionPath(entry)"));
  {
    // Desain ulang: kartu katalog kini komponen LibraryCard — tombol
    // Tarik-nya memanggil prop onTarik (dihubungkan halaman ke
    // tarikEntry) dan tetap hanya dirender di dalam kondisi isApprover.
    const cardSegment = page.slice(page.indexOf("function LibraryCard"), page.indexOf("function PreviewView"));
    const tarikButtonAt = cardSegment.indexOf("onClick={() => onTarik(entry)}");
    const conditionalAt = cardSegment.lastIndexOf("{isApprover ? (", tarikButtonAt);
    check("live cards gain a Tarik action ONLY inside the approver conditional",
      page.includes("approvalTarikPath(entry)") && page.includes("tarikConfirmText()")
        && page.includes("onTarik={(entry) => void tarikEntry(entry)}")
        && tarikButtonAt > -1 && conditionalAt > -1 && tarikButtonAt - conditionalAt < 400,
      `button@${tarikButtonAt} conditional@${conditionalAt}`);
  }
  check("queue + catalog refresh after a decision",
    page.includes("setQueueVersion((version) => version + 1)") && page.includes("setListVersion((version) => version + 1)"));
}

console.log(`\npersetujuan-berbagi (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
