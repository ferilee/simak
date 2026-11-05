// Tests for the Perpustakaan Bersama share-approval queue (Fase 2):
// teachers other than the designated approver must be approved before
// their shares go live. Run with bun from apps/api:
//   bun src/lib/persetujuan-berbagi.test.mjs
//
// There is no test database in this repo's convention, so: the pure rules
// (approver identity, the share state machine, cascade/carry planning,
// queue guards, queue entry shapes and ordering) are tested behaviorally,
// and the route wiring (approver-gated endpoints, inactive-mode branch,
// serializer fields, preview/download extensions) is locked statically
// against the sources. Jalur B is locked: migration 0013 exists and the
// journal has exactly 14 entries.
import { readFileSync, readdirSync } from "node:fs";
import {
  APPROVALS_FORBIDDEN_MESSAGE,
  approvalsGuard,
  buildApprovalQueueEntry,
  decisionGuard,
  isLibraryApprover,
  libraryApprovalActive,
  libraryApproverUsername,
  mergeApprovalQueue,
  nextShareState,
  nextShareTransition,
  planApprovalCarryIds,
  planShareCascadeIds,
  previewGuard,
  shareFieldsForStatus,
  shareTransitionValues,
  tarikGuard,
} from "./library.ts";

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
const readRepo = (rel) => readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");

const T0 = new Date("2026-11-01T02:00:00.000Z");
const NOW = new Date("2026-11-05T05:00:00.000Z");

function fields(shareStatus, overrides = {}) {
  return {
    shareStatus,
    isShared: shareStatus === "dibagikan",
    sharedAt: shareStatus === "dibagikan" ? T0 : null,
    shareRequestedAt: shareStatus === "menunggu" ? T0 : null,
    ...overrides,
  };
}

function sameFields(a, b) {
  return a.shareStatus === b.shareStatus
    && a.isShared === b.isShared
    && (a.sharedAt?.getTime() ?? null) === (b.sharedAt?.getTime() ?? null)
    && (a.shareRequestedAt?.getTime() ?? null) === (b.shareRequestedAt?.getTime() ?? null);
}

// ---------------------------------------------------------------------------
// Case 1 — Jalur B lock: migration 0013, journal = 14, schema + snapshot.
// ---------------------------------------------------------------------------
{
  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 14 entries", journal.entries.length === 14, `got ${journal.entries.length}`);
  const last = journal.entries[journal.entries.length - 1];
  const prev = journal.entries[journal.entries.length - 2];
  check("last journal entry is 0013_persetujuan_berbagi (idx 13)", last.tag === "0013_persetujuan_berbagi" && last.idx === 13);
  check("0013 'when' is after 0012 'when'", last.when > prev.when, `${last.when} vs ${prev.when}`);

  const files = readdirSync(new URL("../../../../packages/db/migrations", import.meta.url));
  check("migration file 0013 exists", files.some((name) => name.startsWith("0013_") && name.endsWith(".sql")));
  const sql = readRepo("packages/db/migrations/0013_persetujuan_berbagi.sql");
  for (const table of ["modules", "worksheets"]) {
    check(
      `${table}: share_status enum NOT NULL default 'pribadi'`,
      sql.includes(`ALTER TABLE \`${table}\` ADD \`share_status\` enum('pribadi','menunggu','dibagikan','ditolak') DEFAULT 'pribadi' NOT NULL`),
    );
    check(`${table}: share_requested_at datetime`, sql.includes(`ALTER TABLE \`${table}\` ADD \`share_requested_at\` datetime`));
    check(
      `${table}: backfill — is_shared rows become 'dibagikan'`,
      sql.includes(`UPDATE \`${table}\` SET \`share_status\` = 'dibagikan' WHERE \`is_shared\` = true`),
    );
  }
  check("migration adds NO foreign key", !/FOREIGN KEY/i.test(sql));
  const identifiers = [...sql.matchAll(/`([a-z_0-9]+)`/gi)].map((match) => match[1]);
  check("every identifier in the migration is ≤ 64 chars", identifiers.every((name) => name.length <= 64), identifiers.join(","));

  const enumSource = 'mysqlEnum("share_status", ["pribadi", "menunggu", "dibagikan", "ditolak"]).notNull().default("pribadi")';
  for (const [label, path] of [["modules schema", "packages/db/src/schema/modules.ts"], ["worksheets schema", "packages/db/src/schema/worksheets.ts"]]) {
    const source = readRepo(path);
    check(`${label}: shareStatus enum column`, source.includes(enumSource));
    check(`${label}: shareRequestedAt datetime("share_requested_at")`, source.includes('datetime("share_requested_at")'));
  }
  const snapshot = JSON.parse(readRepo("packages/db/migrations/meta/0013_snapshot.json"));
  check(
    "snapshot 0013 carries share_status + share_requested_at on both tables",
    "share_status" in snapshot.tables.modules.columns && "share_requested_at" in snapshot.tables.modules.columns
      && "share_status" in snapshot.tables.worksheets.columns && "share_requested_at" in snapshot.tables.worksheets.columns,
  );
}

// ---------------------------------------------------------------------------
// Case 2 — Approver identity from configuration (pure).
// ---------------------------------------------------------------------------
{
  check("unset env → no approver username", libraryApproverUsername(undefined) === null && libraryApproverUsername(null) === null);
  check("empty/blank env → no approver username", libraryApproverUsername("") === null && libraryApproverUsername("   ") === null);
  check("configured username is trimmed + lowercased", libraryApproverUsername("  FeriLee ") === "ferilee");
  check("mode inactive without env", libraryApprovalActive(undefined) === false && libraryApprovalActive("  ") === false);
  check("mode active with env", libraryApprovalActive("ferilee") === true);

  check("approver matches case-insensitively", isLibraryApprover({ username: "FERILEE" }, "ferilee") === true);
  check("approver matches with surrounding spaces on both sides", isLibraryApprover({ username: " ferilee " }, " FeriLee ") === true);
  check("another teacher is not the approver", isLibraryApprover({ username: "rully" }, "ferilee") === false);
  check("nobody is approver while inactive", isLibraryApprover({ username: "ferilee" }, "") === false && isLibraryApprover({ username: "ferilee" }, undefined) === false);
  check("null user is not the approver", isLibraryApprover(null, "ferilee") === false && isLibraryApprover(undefined, "ferilee") === false);
}

// ---------------------------------------------------------------------------
// Case 3 — Share state machine (mode ACTIVE), full matrix.
// ---------------------------------------------------------------------------
{
  const statuses = ["pribadi", "menunggu", "dibagikan", "ditolak"];
  // Withdrawal (shared=false) always lands on a clean private state,
  // whoever the owner is — penarikan tidak butuh persetujuan.
  for (const status of statuses) {
    for (const approvalRequired of [true, false]) {
      const next = nextShareTransition(fields(status), false, approvalRequired, NOW);
      check(
        `off from ${status} (approvalRequired=${approvalRequired}) → pribadi bersih`,
        sameFields(next, { shareStatus: "pribadi", isShared: false, sharedAt: null, shareRequestedAt: null }),
        JSON.stringify(next),
      );
    }
  }
  // Non-approver owner switching on: pribadi/ditolak → menunggu (cap
  // pengajuan = sekarang); menunggu stays menunggu WITHOUT moving the
  // request timestamp; dibagikan stays dibagikan untouched.
  check("on, non-approver, pribadi → menunggu (requested_at = now)",
    sameFields(nextShareTransition(fields("pribadi"), true, true, NOW), { shareStatus: "menunggu", isShared: false, sharedAt: null, shareRequestedAt: NOW }));
  check("on, non-approver, ditolak → menunggu lagi (requested_at = now)",
    sameFields(nextShareTransition(fields("ditolak"), true, true, NOW), { shareStatus: "menunggu", isShared: false, sharedAt: null, shareRequestedAt: NOW }));
  check("on, non-approver, menunggu → tetap menunggu, requested_at TIDAK digeser",
    sameFields(nextShareTransition(fields("menunggu"), true, true, NOW), fields("menunggu")));
  check("on, non-approver, dibagikan → tetap dibagikan, shared_at dipertahankan",
    sameFields(nextShareTransition(fields("dibagikan"), true, true, NOW), fields("dibagikan")));
  // Approver owner switching on: straight to live, exactly like the
  // legacy instant share, from every starting state.
  for (const status of statuses) {
    const next = nextShareTransition(fields(status), true, false, NOW);
    check(
      `on, approver, ${status} → dibagikan`,
      next.shareStatus === "dibagikan" && next.isShared === true && next.shareRequestedAt === null
        && next.sharedAt?.getTime() === (status === "dibagikan" ? T0 : NOW).getTime(),
      JSON.stringify(next),
    );
  }
  // The invariant across the whole matrix: isShared ⟺ dibagikan, and
  // shared_at is set exactly in the live state.
  let invariantHolds = true;
  for (const status of statuses) {
    for (const shared of [true, false]) {
      for (const approvalRequired of [true, false]) {
        const next = nextShareTransition(fields(status), shared, approvalRequired, NOW);
        if (next.isShared !== (next.shareStatus === "dibagikan")) invariantHolds = false;
        if (next.shareStatus === "dibagikan" && next.sharedAt === null) invariantHolds = false;
        if (next.shareStatus !== "dibagikan" && next.sharedAt !== null) invariantHolds = false;
        if (next.shareStatus === "menunggu" && next.shareRequestedAt === null) invariantHolds = false;
      }
    }
  }
  check("invariant holds across the whole matrix (isShared ⟺ dibagikan, cap waktu konsisten)", invariantHolds);

  // Legacy equivalence: with no approval required, the {isShared,
  // sharedAt} projection equals nextShareState — the Fase 1 behavior.
  const legacyOn = nextShareState(true, NOW);
  const projected = nextShareTransition(fields("pribadi"), true, false, NOW);
  check("no-approval 'on' projects exactly onto nextShareState(true)",
    projected.isShared === legacyOn.isShared && projected.sharedAt?.getTime() === legacyOn.sharedAt?.getTime());
  const legacyOff = nextShareState(false, NOW);
  const projectedOff = nextShareTransition(fields("dibagikan"), false, true, NOW);
  check("'off' projects exactly onto nextShareState(false)",
    projectedOff.isShared === legacyOff.isShared && projectedOff.sharedAt === legacyOff.sharedAt);
}

// ---------------------------------------------------------------------------
// Case 4 — Clean field sets per target status + DB value mapping.
// ---------------------------------------------------------------------------
{
  check("fields for dibagikan", sameFields(shareFieldsForStatus("dibagikan", NOW), { shareStatus: "dibagikan", isShared: true, sharedAt: NOW, shareRequestedAt: null }));
  check("fields for menunggu", sameFields(shareFieldsForStatus("menunggu", NOW), { shareStatus: "menunggu", isShared: false, sharedAt: null, shareRequestedAt: NOW }));
  check("fields for ditolak (semua cap dibersihkan)", sameFields(shareFieldsForStatus("ditolak", NOW), { shareStatus: "ditolak", isShared: false, sharedAt: null, shareRequestedAt: null }));
  check("fields for pribadi (semua cap dibersihkan)", sameFields(shareFieldsForStatus("pribadi", NOW), { shareStatus: "pribadi", isShared: false, sharedAt: null, shareRequestedAt: null }));
  const values = shareTransitionValues(shareFieldsForStatus("menunggu", NOW));
  check("transition values use the Drizzle column keys",
    values.isShared === false && values.sharedAt === null && values.shareStatus === "menunggu" && values.shareRequestedAt?.getTime() === NOW.getTime());
}

// ---------------------------------------------------------------------------
// Case 5 — Cascade + approval-carry planning (pure).
// ---------------------------------------------------------------------------
{
  const attached = [
    { id: 1, shareStatus: "pribadi" },
    { id: 2, shareStatus: "ditolak" },
    { id: 3, shareStatus: "menunggu" },
    { id: 4, shareStatus: "dibagikan" },
  ];
  check("cascade to menunggu: hanya pribadi + ditolak yang mengikuti",
    JSON.stringify(planShareCascadeIds(attached, "menunggu")) === JSON.stringify([1, 2]));
  check("cascade to dibagikan: hanya pribadi + ditolak yang mengikuti",
    JSON.stringify(planShareCascadeIds(attached, "dibagikan")) === JSON.stringify([1, 2]));
  check("cascade to pribadi/ditolak: tidak ada yang mengikuti",
    planShareCascadeIds(attached, "pribadi").length === 0 && planShareCascadeIds(attached, "ditolak").length === 0);
  check("approval carry: hanya yang menunggu yang ikut tayang",
    JSON.stringify(planApprovalCarryIds(attached)) === JSON.stringify([3]));
  check("approval carry on empty set", planApprovalCarryIds([]).length === 0);
}

// ---------------------------------------------------------------------------
// Case 6 — Queue guards (pure).
// ---------------------------------------------------------------------------
{
  const forbidden = approvalsGuard(false);
  check("approvals guard: non-approver → 403 with the approved message",
    !forbidden.ok && forbidden.status === 403 && forbidden.message === APPROVALS_FORBIDDEN_MESSAGE
      && APPROVALS_FORBIDDEN_MESSAGE === "Hanya penyetuju Perpustakaan Bersama yang dapat membuka antrean persetujuan.");
  check("approvals guard: approver passes", approvalsGuard(true).ok === true);

  check("decision guard: missing item → 404 (gaya katalog)",
    (() => { const g = decisionGuard(null, "Modul tidak ditemukan di perpustakaan."); return !g.ok && g.status === 404 && g.message === "Modul tidak ditemukan di perpustakaan."; })());
  check("decision guard: menunggu → ok", decisionGuard({ shareStatus: "menunggu" }, "x").ok === true);
  for (const status of ["pribadi", "dibagikan", "ditolak"]) {
    const g = decisionGuard({ shareStatus: status }, "x");
    check(`decision guard: ${status} → 409 "sudah diputuskan"`, !g.ok && g.status === 409 && g.message === "Pengajuan ini sudah diputuskan.");
  }

  check("tarik guard: missing item → 404",
    (() => { const g = tarikGuard(null, 7, "LKPD tidak ditemukan di perpustakaan."); return !g.ok && g.status === 404; })());
  check("tarik guard: approver's own live item → 400 with the saklar guidance",
    (() => { const g = tarikGuard({ teacherId: 7, shareStatus: "dibagikan" }, 7, "x"); return !g.ok && g.status === 400 && g.message === "Ini materi Anda sendiri; matikan lewat saklar Bagikan."; })());
  check("tarik guard: other's non-live item → 409",
    (() => { const g = tarikGuard({ teacherId: 9, shareStatus: "menunggu" }, 7, "x"); return !g.ok && g.status === 409 && g.message === "Materi ini tidak sedang tayang di Perpustakaan Bersama."; })());
  check("tarik guard: other's live item → ok", tarikGuard({ teacherId: 9, shareStatus: "dibagikan" }, 7, "x").ok === true);
}

// ---------------------------------------------------------------------------
// Case 7 — Preview guard approver extension (pure) + legacy behavior.
// ---------------------------------------------------------------------------
{
  const pending = { teacherId: 9, isShared: false, shareStatus: "menunggu" };
  check("preview: non-approver + menunggu → 404 (privat bagi semua guru lain)",
    !previewGuard(pending, 7, "x").ok);
  check("preview: approver + menunggu → ok (dapat memeriksa sebelum memutuskan)",
    previewGuard(pending, 7, "x", { isApprover: true }).ok === true);
  check("preview: approver + pribadi → tetap 404",
    !previewGuard({ teacherId: 9, isShared: false, shareStatus: "pribadi" }, 7, "x", { isApprover: true }).ok);
  check("preview: approver + ditolak → tetap 404 (hanya menunggu yang dibuka)",
    !previewGuard({ teacherId: 9, isShared: false, shareStatus: "ditolak" }, 7, "x", { isApprover: true }).ok);
  check("preview: approver melihat materinya sendiri dari katalog → tetap 404",
    !previewGuard({ teacherId: 7, isShared: false, shareStatus: "menunggu" }, 7, "x", { isApprover: true }).ok);
  check("preview legacy (3 argumen): dibagikan → ok, privat → 404, milik sendiri → 404",
    previewGuard({ teacherId: 9, isShared: true }, 7, "x").ok === true
      && !previewGuard({ teacherId: 9, isShared: false }, 7, "x").ok
      && !previewGuard({ teacherId: 7, isShared: true }, 7, "x").ok);
}

// ---------------------------------------------------------------------------
// Case 8 — Queue entry shapes + oldest-first merge (pure).
// ---------------------------------------------------------------------------
{
  const moduleEntry = buildApprovalQueueEntry({
    kind: "module", id: 5, title: "Eksponen", ownerName: "Rully", shareRequestedAt: T0, subject: "Matematika",
    blockCount: 12, pendingWorksheetCount: 2, itemCount: null,
  });
  check("queue module entry: kind 'modul' + counts, tanpa item_count",
    moduleEntry.kind === "modul" && moduleEntry.block_count === 12 && moduleEntry.pending_worksheet_count === 2
      && moduleEntry.teacher_name === "Rully" && !("item_count" in moduleEntry));
  const worksheetEntry = buildApprovalQueueEntry({
    kind: "worksheet", id: 8, title: "LKPD 1.1", ownerName: "Rully", shareRequestedAt: NOW, subject: null,
    blockCount: null, pendingWorksheetCount: null, itemCount: 10,
  });
  check("queue worksheet entry: kind 'lkpd' + item_count, subject null untuk mandiri",
    worksheetEntry.kind === "lkpd" && worksheetEntry.item_count === 10 && worksheetEntry.subject === null && !("block_count" in worksheetEntry));
  const merged = mergeApprovalQueue([moduleEntry], [worksheetEntry]);
  check("queue merge: pengajuan paling lama di atas", merged[0].id === 5 && merged[1].id === 8);
}

// ---------------------------------------------------------------------------
// Case 9 — Wiring locks (static).
// ---------------------------------------------------------------------------
{
  const envSource = read("../lib/env.ts");
  check("env declares SIMAK_LIBRARY_APPROVER", envSource.includes("SIMAK_LIBRARY_APPROVER"));

  const modulesRoute = read("../routes/modules.ts");
  check("module share: mode gate reads the configured approver", modulesRoute.includes("libraryApprovalActive(env.SIMAK_LIBRARY_APPROVER)"));
  check("module share: INACTIVE branch keeps the Fase 1 code path literally",
    modulesRoute.includes("nextShareState(input.shared, now)") && modulesRoute.includes("set({ isShared: true, sharedAt: now })"));
  check("module share: ACTIVE branch runs the state machine + cascade planner",
    modulesRoute.includes("nextShareTransition(") && modulesRoute.includes("planShareCascadeIds(attached, next.shareStatus)"));
  check("module share: inactive branch precedes the state machine",
    modulesRoute.indexOf("nextShareState(input.shared, now)") < modulesRoute.indexOf("nextShareTransition("));
  check("module serializer exposes share_status + share_requested_at",
    modulesRoute.includes("share_status: module.shareStatus") && modulesRoute.includes("share_requested_at: module.shareRequestedAt"));

  const worksheetsRoute = read("../routes/worksheets.ts");
  check("worksheet share: mode gate reads the configured approver", worksheetsRoute.includes("libraryApprovalActive(env.SIMAK_LIBRARY_APPROVER)"));
  check("worksheet share: INACTIVE branch keeps the Fase 1 code path literally",
    worksheetsRoute.includes("nextShareState(input.shared, new Date())"));
  check("worksheet share: ACTIVE branch runs the state machine",
    worksheetsRoute.includes("nextShareTransition(") && worksheetsRoute.includes("shareTransitionValues(next)"));
  check("worksheet serializer exposes share_status + share_requested_at",
    worksheetsRoute.includes("share_status: worksheet.shareStatus") && worksheetsRoute.includes("share_requested_at: worksheet.shareRequestedAt"));

  const library = read("../routes/library.ts");
  check("approvals queue endpoint exists, guru-only", library.includes('libraryRoutes.get("/approvals", requireRole("guru")'));
  check("module decision endpoint exists, guru-only + validated body",
    library.includes('libraryRoutes.post("/approvals/modules/:id", requireRole("guru"), zValidator("json", approvalDecisionSchema)'));
  check("worksheet decision endpoint exists, guru-only + validated body",
    library.includes('libraryRoutes.post("/approvals/worksheets/:id", requireRole("guru"), zValidator("json", approvalDecisionSchema)'));
  check("tarik endpoints exist, guru-only",
    library.includes('libraryRoutes.post("/approvals/modules/:id/tarik", requireRole("guru")')
      && library.includes('libraryRoutes.post("/approvals/worksheets/:id/tarik", requireRole("guru")'));
  check("all five approval endpoints pass the approver gate", (library.match(/approverGate\(user\)/g) ?? []).length === 5);
  check("decisions go through decisionGuard, tarik through tarikGuard",
    (library.match(/decisionGuard\(/g) ?? []).length >= 2 && (library.match(/tarikGuard\(/g) ?? []).length >= 2);
  check("module approval carries pending worksheets via the carry planner inside a transaction",
    library.includes("planApprovalCarryIds(attached)") && library.includes("db.transaction("));
  {
    // Penolakan modul bersifat bedah: blok tolak pada endpoint modul
    // hanya menyentuh tabel modules, tidak pernah worksheets.
    const segment = library.split('libraryRoutes.post("/approvals/modules/:id"')[1].split("libraryRoutes.post(")[0];
    const tolakBlock = segment.split('if (decision === "tolak")')[1].split("}")[0];
    check("module rejection touches ONLY the module row (no worksheet update in the tolak branch)",
      tolakBlock.includes("update(modules)") && !tolakBlock.includes("worksheets"));
  }
  check("list response carries the viewer meta (approver + pending_count)",
    library.includes("approver") && library.includes("pending_count: pendingCount"));
  check("catalog still only lists live (is_shared) rows — menunggu tidak bocor",
    library.includes("eq(modules.isShared, true)") && library.includes("eq(worksheets.isShared, true)"));
  check("previews receive the approver flag for the menunggu extension",
    (library.match(/isApprover: isLibraryApprover\(user, env\.SIMAK_LIBRARY_APPROVER\)/g) ?? []).length >= 2);

  const uploads = read("../routes/uploads.ts");
  check("download extends to menunggu modules for the approver only",
    uploads.includes('module.shareStatus === "menunggu"') && uploads.includes("isLibraryApprover(user, env.SIMAK_LIBRARY_APPROVER)"));
  check("download keeps the shared-only base rule for other teachers",
    uploads.includes("module.teacherId !== user.userId && !module.isShared"));
}

console.log(`\npersetujuan-berbagi: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
