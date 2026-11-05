// Tests for guarded permanent deletion of modules (materi) and
// worksheets (LKPD). Run with bun from apps/api:
//   bun src/lib/hapus-materi-lkpd.test.mjs
//
// A module/worksheet may be permanently deleted ONLY while no
// assignment references it and no student has ever attempted its
// worksheets; otherwise the DELETE endpoints refuse with 409 and point
// at archiving instead. Same convention as the other suites: no test
// database, so the pure guard predicates are tested behaviorally and
// the route wiring (ownership, guard order, transaction shape, FK
// cascade reliance, storage untouched) is locked statically.
// No migration: the journal stays at 13 entries.
import { readFileSync } from "node:fs";
import {
  MODULE_ASSIGNMENT_REF_MESSAGE,
  MODULE_ATTEMPTS_MESSAGE,
  WORKSHEET_ASSIGNMENT_REF_MESSAGE,
  WORKSHEET_ATTEMPTS_MESSAGE,
  moduleDeleteGuard,
  worksheetDeleteGuard,
} from "./deletion.ts";

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

// ---------------------------------------------------------------------------
// Case 1 — Exact refusal messages (the routes surface them verbatim).
// ---------------------------------------------------------------------------
{
  check("module assignment message is exact",
    MODULE_ASSIGNMENT_REF_MESSAGE === "Materi ini masih dipakai oleh penugasan dan tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.",
    MODULE_ASSIGNMENT_REF_MESSAGE);
  check("module attempts message is exact",
    MODULE_ATTEMPTS_MESSAGE === "Sudah ada murid yang mengerjakan LKPD pada materi ini, sehingga materi tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.",
    MODULE_ATTEMPTS_MESSAGE);
  check("worksheet assignment message is exact",
    WORKSHEET_ASSIGNMENT_REF_MESSAGE === "LKPD ini masih dipakai oleh penugasan dan tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.",
    WORKSHEET_ASSIGNMENT_REF_MESSAGE);
  check("worksheet attempts message is exact",
    WORKSHEET_ATTEMPTS_MESSAGE === "LKPD ini sudah dikerjakan murid dan tidak dapat dihapus. Arsipkan saja bila tidak digunakan lagi.",
    WORKSHEET_ATTEMPTS_MESSAGE);
}

// ---------------------------------------------------------------------------
// Case 2 — moduleDeleteGuard matrix: assignment refs block BEFORE
// attempts when both are present; only zero/zero allows the delete.
// ---------------------------------------------------------------------------
{
  check("module: no refs, no attempts → ok",
    moduleDeleteGuard({ assignmentRefs: 0, attemptCount: 0 }).ok === true);
  const refOnly = moduleDeleteGuard({ assignmentRefs: 1, attemptCount: 0 });
  check("module: assignment ref → 409 + assignment message",
    refOnly.ok === false && refOnly.status === 409 && refOnly.message === MODULE_ASSIGNMENT_REF_MESSAGE);
  const attemptsOnly = moduleDeleteGuard({ assignmentRefs: 0, attemptCount: 1 });
  check("module: attempts → 409 + attempts message",
    attemptsOnly.ok === false && attemptsOnly.status === 409 && attemptsOnly.message === MODULE_ATTEMPTS_MESSAGE);
  const both = moduleDeleteGuard({ assignmentRefs: 2, attemptCount: 5 });
  check("module: refs AND attempts → assignment message wins (checked first)",
    both.ok === false && both.status === 409 && both.message === MODULE_ASSIGNMENT_REF_MESSAGE);
  const manyAttempts = moduleDeleteGuard({ assignmentRefs: 0, attemptCount: 30 });
  check("module: many attempts still blocked",
    manyAttempts.ok === false && manyAttempts.message === MODULE_ATTEMPTS_MESSAGE);
}

// ---------------------------------------------------------------------------
// Case 3 — worksheetDeleteGuard matrix (same shape, worksheet texts).
// ---------------------------------------------------------------------------
{
  check("worksheet: no refs, no attempts → ok",
    worksheetDeleteGuard({ assignmentRefs: 0, attemptCount: 0 }).ok === true);
  const refOnly = worksheetDeleteGuard({ assignmentRefs: 1, attemptCount: 0 });
  check("worksheet: assignment ref → 409 + assignment message",
    refOnly.ok === false && refOnly.status === 409 && refOnly.message === WORKSHEET_ASSIGNMENT_REF_MESSAGE);
  const attemptsOnly = worksheetDeleteGuard({ assignmentRefs: 0, attemptCount: 1 });
  check("worksheet: one attempt → 409 + attempts message",
    attemptsOnly.ok === false && attemptsOnly.status === 409 && attemptsOnly.message === WORKSHEET_ATTEMPTS_MESSAGE);
  const both = worksheetDeleteGuard({ assignmentRefs: 3, attemptCount: 2 });
  check("worksheet: refs AND attempts → assignment message wins (checked first)",
    both.ok === false && both.status === 409 && both.message === WORKSHEET_ASSIGNMENT_REF_MESSAGE);
}

// ---------------------------------------------------------------------------
// Case 4 — Module route wiring (static locks).
// ---------------------------------------------------------------------------
{
  const modules = read("../routes/modules.ts");
  const start = modules.indexOf('moduleRoutes.delete("/:id", requireRole("guru")');
  check("DELETE /modules/:id exists with the guru role gate", start > -1);
  const segment = modules.slice(start, modules.indexOf("moduleRoutes.", start + 10));

  check("module delete: ownership via ownedModule, 404 as other mutations",
    segment.includes("ownedModule(user.userId, moduleId)") && segment.includes('"Modul tidak ditemukan." }, 404'));
  check("module delete: invalid id → 400 like the other mutations",
    segment.includes('"ID modul tidak valid." }, 400'));
  check("module delete: counts assignments pointing at the module itself",
    segment.includes("eq(assignments.moduleId, moduleId)"));
  check("module delete: counts assignments pointing at any attached worksheet",
    segment.includes("inArray(assignments.worksheetId, worksheetIds)"));
  check("module delete: counts attempts across all attached worksheets",
    segment.includes("inArray(worksheetAttempts.worksheetId, worksheetIds)"));
  check("module delete: guard receives the SUM of both assignment counts",
    segment.includes("Number(moduleAssignmentRefs?.count ?? 0) + Number(worksheetAssignmentRefs?.count ?? 0)"));
  check("module delete: guard refusal → its own status (409) + verbatim message",
    segment.includes("if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);"));
  check("module delete: guard runs BEFORE the transaction",
    segment.indexOf("moduleDeleteGuard({") > -1
    && segment.indexOf("moduleDeleteGuard({") < segment.indexOf("db.transaction("));
  check("module delete: worksheets deleted explicitly inside the transaction, before the module row",
    segment.includes("tx.delete(worksheets)")
    && segment.includes("tx.delete(modules)")
    && segment.indexOf("tx.delete(worksheets)") < segment.indexOf("tx.delete(modules)"));
  check("module delete: success envelope is the file's standard one",
    segment.includes("return c.json({ ok: true, data: { id: moduleId } });"));
  check("module delete: storage objects are never touched (no storage delete calls)",
    !segment.includes("DeleteObject") && !segment.includes("deleteObject") && !modules.includes("DeleteObjectCommand"));
  check("module delete: no copied_from special-casing (library copies are ordinary rows)",
    !segment.includes("copiedFrom") && !segment.includes("copied_from"));
}

// ---------------------------------------------------------------------------
// Case 5 — Worksheet route wiring (static locks).
// ---------------------------------------------------------------------------
{
  const worksheets = read("../routes/worksheets.ts");
  const start = worksheets.indexOf('worksheetRoutes.delete("/:id", requireRole("guru")');
  check("DELETE /worksheets/:id exists with the guru role gate", start > -1);
  const segment = worksheets.slice(start, worksheets.indexOf("worksheetRoutes.", start + 10));

  check("worksheet delete: ownership via ownedWorksheet, 404 as other mutations",
    segment.includes("ownedWorksheet(user.userId, worksheetId)") && segment.includes('"LKPD tidak ditemukan." }, 404'));
  check("worksheet delete: invalid id → 400 like the other mutations",
    segment.includes('"ID LKPD tidak valid." }, 400'));
  check("worksheet delete: counts assignments pointing at the worksheet",
    segment.includes("eq(assignments.worksheetId, worksheetId)"));
  check("worksheet delete: counts attempts of the worksheet",
    segment.includes("eq(worksheetAttempts.worksheetId, worksheetId)"));
  check("worksheet delete: guard refusal → its own status (409) + verbatim message",
    segment.includes("if (!guard.ok) return c.json({ ok: false, message: guard.message }, guard.status);"));
  check("worksheet delete: guard runs BEFORE the transaction",
    segment.indexOf("worksheetDeleteGuard({") > -1
    && segment.indexOf("worksheetDeleteGuard({") < segment.indexOf("db.transaction("));
  check("worksheet delete: the row is deleted inside a transaction",
    segment.includes("db.transaction(") && segment.includes("tx.delete(worksheets)"));
  check("worksheet delete: success envelope is the file's standard one",
    segment.includes("return c.json({ ok: true, data: { id: worksheetId } });"));
  check("worksheet delete: storage objects are never touched (no storage delete calls)",
    !segment.includes("DeleteObject") && !segment.includes("deleteObject") && !worksheets.includes("DeleteObjectCommand"));
  check("worksheet delete: no copied_from special-casing (library copies are ordinary rows)",
    !segment.includes("copiedFrom") && !segment.includes("copied_from"));
}

// ---------------------------------------------------------------------------
// Case 6 — Schema FK facts the deletes rely on (static locks).
// worksheets.module_id has NO cascade (hence the explicit worksheet
// delete in the module transaction); items/blocks cascade; attempts
// cascade but are unreachable behind the guards; activity_logs nulls.
// ---------------------------------------------------------------------------
{
  const worksheetsSchema = readRepo("packages/db/src/schema/worksheets.ts");
  const modulesSchema = readRepo("packages/db/src/schema/modules.ts");
  const attemptsSchema = readRepo("packages/db/src/schema/worksheet-attempts.ts");
  const activitySchema = readRepo("packages/db/src/schema/activity.ts");

  check("worksheets.module_id references modules WITHOUT cascade (explicit delete required)",
    worksheetsSchema.includes('.references(() => modules.id),'));
  check("worksheet_items.worksheet_id cascades on worksheet delete",
    worksheetsSchema.includes('.references(() => worksheets.id, { onDelete: "cascade" })'));
  check("module_blocks.module_id cascades on module delete",
    modulesSchema.includes('.references(() => modules.id, { onDelete: "cascade" })'));
  check("worksheet_attempts.worksheet_id cascades (only reachable when a guard is bypassed — guards block first)",
    attemptsSchema.includes('.references(() => worksheets.id, { onDelete: "cascade" })'));
  check("activity_logs.module_id is set null on module delete (student activity trail survives)",
    activitySchema.includes('.references(() => modules.id, { onDelete: "set null" })'));
}

// ---------------------------------------------------------------------------
// Case 7 — Library interplay: deleting one's own copy is an ordinary
// guarded delete; the sudah_disalin flag reads row existence, so it
// flips back to false by itself once the copy row is gone.
// ---------------------------------------------------------------------------
{
  const libraryRoute = read("../routes/library.ts");
  const libraryLib = read("./library.ts");
  check("library list still derives the flag from the requester's existing copy rows",
    libraryRoute.includes("copiedSourceIdSet(copyRows)")
    && libraryRoute.includes("sudahDisalin: copiedModuleIds.has(row.id)")
    && libraryRoute.includes("sudahDisalin: copiedWorksheetIds.has(row.id)"));
  check("copiedSourceIdSet reads only copied_from_id (row existence, any state)",
    libraryLib.includes("if (row.copiedFromId !== null) ids.add(row.copiedFromId);"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("no new migration: journal still has exactly 13 entries", journal.entries.length === 13, `got ${journal.entries.length}`);
}

console.log(`\nhapus-materi-lkpd: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
