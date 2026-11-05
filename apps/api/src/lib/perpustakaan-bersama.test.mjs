// Tests for "Perpustakaan Bersama" Fase 1 (v1.0.41): teachers share
// modules/LKPD with all other teachers; others browse, preview, and copy
// into their own account as drafts. Run with bun from apps/api:
//   bun src/lib/perpustakaan-bersama.test.mjs
//
// There is no test database in this repo's convention, so: the pure rules
// (share state, copy/preview guards, catalog entry shapes, merge order,
// copy planning, deep-copy value builders) are tested behaviorally, and
// the route wiring (owner-only toggles, guru-only catalog, transaction
// copies, serializer fields) is locked statically against the sources.
// Jalur B is locked: migration 0012 exists (the journal has since grown
// to 14 entries with 0013_persetujuan_berbagi — see that package's suite).
import { readFileSync, readdirSync } from "node:fs";
import {
  buildLibraryModuleEntry,
  buildLibraryWorksheetEntry,
  copyGuard,
  mergeLibraryEntries,
  moduleBlockCopyValues,
  moduleCopyValues,
  nextShareState,
  planModuleCopyWorksheets,
  previewGuard,
  worksheetCopyValues,
  worksheetItemCopyValues,
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

// ---------------------------------------------------------------------------
// Case 1 — Jalur B lock: migration 0012, journal entries, safe identifiers.
// ---------------------------------------------------------------------------
{
  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 14 entries (0013 persetujuan-berbagi menyusul 0012)", journal.entries.length === 14, `got ${journal.entries.length}`);
  const entry0012 = journal.entries[12];
  const entry0011 = journal.entries[11];
  check("journal entry idx 12 is 0012_perpustakaan_bersama", entry0012.tag === "0012_perpustakaan_bersama" && entry0012.idx === 12);
  check("0012 'when' is after 0011 'when'", entry0012.when > entry0011.when, `${entry0012.when} vs ${entry0011.when}`);

  const files = readdirSync(new URL("../../../../packages/db/migrations", import.meta.url));
  check("migration file 0012 exists", files.some((name) => name.startsWith("0012_") && name.endsWith(".sql")));
  const sql = readRepo("packages/db/migrations/0012_perpustakaan_bersama.sql");
  for (const table of ["modules", "worksheets"]) {
    check(`${table}: is_shared boolean NOT NULL default false`, sql.includes(`ALTER TABLE \`${table}\` ADD \`is_shared\` boolean DEFAULT false NOT NULL`));
    check(`${table}: shared_at datetime`, sql.includes(`ALTER TABLE \`${table}\` ADD \`shared_at\` datetime`));
    check(`${table}: copied_from_id bigint`, sql.includes(`ALTER TABLE \`${table}\` ADD \`copied_from_id\` bigint`));
    check(`${table}: copied_from_teacher_name varchar(120)`, sql.includes(`ALTER TABLE \`${table}\` ADD \`copied_from_teacher_name\` varchar(120)`));
  }
  check("migration adds NO foreign key", !/FOREIGN KEY/i.test(sql));
  const identifiers = [...sql.matchAll(/`([a-z_0-9]+)`/gi)].map((match) => match[1]);
  check("every identifier in the migration is ≤ 64 chars", identifiers.every((name) => name.length <= 64), identifiers.join(","));

  const modulesSchema = readRepo("packages/db/src/schema/modules.ts");
  const worksheetsSchema = readRepo("packages/db/src/schema/worksheets.ts");
  for (const [label, source] of [["modules schema", modulesSchema], ["worksheets schema", worksheetsSchema]]) {
    check(`${label}: isShared boolean("is_shared") default false`, source.includes('boolean("is_shared").notNull().default(false)'));
    check(`${label}: sharedAt datetime("shared_at")`, source.includes('datetime("shared_at")'));
    check(`${label}: copiedFromId plain bigint, no references`, /copiedFromId: bigint\("copied_from_id", \{ mode: "number" \}\)(?!\s*\.references)/.test(source));
    check(`${label}: copiedFromTeacherName varchar(120)`, source.includes('varchar("copied_from_teacher_name", { length: 120 })'));
  }
}

// ---------------------------------------------------------------------------
// Case 2 — Share state transitions.
// ---------------------------------------------------------------------------
{
  const now = new Date("2026-11-04T06:00:00.000Z");
  const on = nextShareState(true, now);
  check("turning on sets isShared + sharedAt = now", on.isShared === true && on.sharedAt === now);
  const off = nextShareState(false, now);
  check("turning off clears sharedAt to null", off.isShared === false && off.sharedAt === null);
}

// ---------------------------------------------------------------------------
// Case 3 — Copy + preview guards.
// ---------------------------------------------------------------------------
{
  const NF = "Modul tidak ditemukan di perpustakaan.";
  check("copy: missing source → 404", copyGuard(null, 7, NF).status === 404);
  check("copy: own shared → 400", copyGuard({ teacherId: 7, isShared: true }, 7, NF).status === 400);
  const ownCopy = copyGuard({ teacherId: 7, isShared: false }, 7, NF);
  check("copy: own unshared → still 400 with the own-message", ownCopy.status === 400 && ownCopy.message === "Ini materi Anda sendiri.");
  check("copy: other's unshared → 404", copyGuard({ teacherId: 9, isShared: false }, 7, NF).status === 404);
  check("copy: other's shared → ok", copyGuard({ teacherId: 9, isShared: true }, 7, NF).ok === true);

  check("preview: missing → 404", previewGuard(undefined, 7, NF).status === 404);
  check("preview: own shared → 404 (catalog is others-only)", previewGuard({ teacherId: 7, isShared: true }, 7, NF).status === 404);
  check("preview: own unshared → 404", previewGuard({ teacherId: 7, isShared: false }, 7, NF).status === 404);
  check("preview: other's unshared → 404", previewGuard({ teacherId: 9, isShared: false }, 7, NF).status === 404);
  check("preview: other's shared → ok", previewGuard({ teacherId: 9, isShared: true }, 7, NF).ok === true);
}

// ---------------------------------------------------------------------------
// Case 4 — Catalog entry shapes + merge order.
// ---------------------------------------------------------------------------
{
  const at = (iso) => new Date(iso);
  const moduleEntry = buildLibraryModuleEntry({
    id: 3, title: "Bunga Tunggal", subject: "Matematika", ownerName: "Feri",
    sharedAt: at("2026-11-02T00:00:00Z"), blockCount: 12, sharedWorksheetCount: 2,
  });
  check("module entry kind/id/title/subject/owner", moduleEntry.kind === "module" && moduleEntry.id === 3 && moduleEntry.subject === "Matematika" && moduleEntry.owner_name === "Feri");
  check("module entry carries block_count + shared_worksheet_count only", moduleEntry.block_count === 12 && moduleEntry.shared_worksheet_count === 2 && !("item_count" in moduleEntry) && !("total_points" in moduleEntry));

  const worksheetEntry = buildLibraryWorksheetEntry({
    id: 8, title: "LKPD ATP 2.1", subject: null, ownerName: "Rully",
    sharedAt: at("2026-11-03T00:00:00Z"), itemCount: 11, totalPoints: 100,
  });
  check("worksheet entry carries item_count + total_points only", worksheetEntry.item_count === 11 && worksheetEntry.total_points === 100 && !("block_count" in worksheetEntry));
  check("worksheet entry keeps null subject (standalone LKPD)", worksheetEntry.subject === null);

  const older = buildLibraryModuleEntry({ id: 1, title: "A", subject: "KKA", ownerName: "X", sharedAt: at("2026-11-01T00:00:00Z"), blockCount: 1, sharedWorksheetCount: 0 });
  const noDate = buildLibraryWorksheetEntry({ id: 2, title: "B", subject: null, ownerName: "Y", sharedAt: null, itemCount: 1, totalPoints: 10 });
  const merged = mergeLibraryEntries([older, moduleEntry], [worksheetEntry, noDate]);
  check("merged catalog is newest shared_at first", merged.map((entry) => entry.id).join(",") === "8,3,1,2", merged.map((entry) => entry.id).join(","));
  check("null shared_at sinks to the bottom", merged[merged.length - 1].id === 2);
}

// ---------------------------------------------------------------------------
// Case 5 — Module copy planning: only shared worksheets follow.
// ---------------------------------------------------------------------------
{
  const attached = [
    { id: 21, isShared: true },
    { id: 22, isShared: false },
    { id: 23, isShared: true },
  ];
  check("plan keeps shared worksheets in order", planModuleCopyWorksheets(attached).join(",") === "21,23");
  check("plan is empty when none are shared", planModuleCopyWorksheets([{ id: 1, isShared: false }]).length === 0);
  check("plan is empty for no worksheets", planModuleCopyWorksheets([]).length === 0);
}

// ---------------------------------------------------------------------------
// Case 6 — Deep-copy value builders.
// ---------------------------------------------------------------------------
{
  const moduleValues = moduleCopyValues(
    { id: 5, title: "Eksponen", subject: "Matematika", description: "desc", coverKey: "materi/9/5/cover.webp" },
    42,
    "Feri Dwi Hermawan",
  );
  check("module copy: owned by copier", moduleValues.teacherId === 42);
  check("module copy: status forced to draf, version restarts at 1", moduleValues.status === "draf" && moduleValues.version === 1);
  check("module copy: unshared with null shared_at", moduleValues.isShared === false && moduleValues.sharedAt === null);
  check("module copy: attribution snapshot frozen", moduleValues.copiedFromId === 5 && moduleValues.copiedFromTeacherName === "Feri Dwi Hermawan");
  check("module copy: cover referenced by the same key", moduleValues.coverKey === "materi/9/5/cover.webp");
  check("module copy: title/subject/description carried", moduleValues.title === "Eksponen" && moduleValues.subject === "Matematika" && moduleValues.description === "desc");

  const blockValues = moduleBlockCopyValues(
    { sortOrder: 3, type: "gambar", contentJson: { caption: "Grafik" }, attachmentKey: "materi/9/5/img.webp" },
    99,
  );
  check("block copy: identical content + attachment key, new module id",
    blockValues.moduleId === 99 && blockValues.sortOrder === 3 && blockValues.type === "gambar"
    && blockValues.attachmentKey === "materi/9/5/img.webp" && blockValues.contentJson.caption === "Grafik");

  const worksheetValues = worksheetCopyValues({ id: 6, title: "LKPD 1.1", instructions: "Kerjakan" }, 42, 99, "Feri Dwi Hermawan");
  check("worksheet copy (in module): attached to the NEW module", worksheetValues.moduleId === 99 && worksheetValues.teacherId === 42);
  check("worksheet copy: draf + unshared + attribution", worksheetValues.status === "draf" && worksheetValues.isShared === false && worksheetValues.copiedFromId === 6 && worksheetValues.copiedFromTeacherName === "Feri Dwi Hermawan");
  const standalone = worksheetCopyValues({ id: 6, title: "LKPD 1.1", instructions: null }, 42, null, "Feri Dwi Hermawan");
  check("worksheet copy (standalone): module_id NULL", standalone.moduleId === null && standalone.instructions === null);

  const options = { options: ["2", "4"], tolerance: 0 };
  const itemValues = worksheetItemCopyValues(
    { sortOrder: 2, itemType: "isian_singkat", prompt: "2^3 = ?", optionsJson: options, answerKey: "8", explanation: "2×2×2", rubricMax: 100, points: 15 },
    77,
  );
  check("item copy: every field carried incl. key, explanation, rubric, points",
    itemValues.worksheetId === 77 && itemValues.sortOrder === 2 && itemValues.itemType === "isian_singkat"
    && itemValues.prompt === "2^3 = ?" && itemValues.optionsJson === options && itemValues.answerKey === "8"
    && itemValues.explanation === "2×2×2" && itemValues.rubricMax === 100 && itemValues.points === 15);
}

// ---------------------------------------------------------------------------
// Case 7 — Route wiring (static locks).
// ---------------------------------------------------------------------------
{
  const library = read("../routes/library.ts");
  check("library routes: list is guru-only", library.includes('libraryRoutes.get("/", requireRole("guru")'));
  check("library routes: module preview is guru-only", library.includes('libraryRoutes.get("/modules/:id", requireRole("guru")'));
  check("library routes: worksheet preview is guru-only", library.includes('libraryRoutes.get("/worksheets/:id", requireRole("guru")'));
  check("library routes: module copy is guru-only", library.includes('libraryRoutes.post("/modules/:id/copy", requireRole("guru")'));
  check("library routes: worksheet copy is guru-only", library.includes('libraryRoutes.post("/worksheets/:id/copy", requireRole("guru")'));
  check("library list excludes the requester's own modules", library.includes("ne(modules.teacherId, user.userId)"));
  check("library list excludes the requester's own worksheets", library.includes("ne(worksheets.teacherId, user.userId)"));
  check("library list only includes shared rows", library.includes("eq(modules.isShared, true)") && library.includes("eq(worksheets.isShared, true)"));
  check("previews go through previewGuard", (library.match(/previewGuard\(/g) ?? []).length >= 2);
  check("copies go through copyGuard", (library.match(/copyGuard\(/g) ?? []).length >= 2);
  check("module copy plans worksheets via planModuleCopyWorksheets", library.includes("planModuleCopyWorksheets(attached)"));
  check("copies run inside transactions", (library.match(/db\.transaction\(/g) ?? []).length >= 2);
  check("worksheet preview serializer exposes rubric_max + answer_key", library.includes("rubric_max: item.rubricMax") && library.includes("answer_key: item.answerKey"));
  check("module preview lists only shared worksheets", library.includes("eq(worksheets.moduleId, moduleId), eq(worksheets.isShared, true)"));

  const app = read("../app.ts");
  check("app registers the library routes", app.includes('v1.route("/library", libraryRoutes)'));

  const modulesRoute = read("../routes/modules.ts");
  check("module share endpoint exists, guru-only", modulesRoute.includes('moduleRoutes.patch("/:id/share", requireRole("guru")'));
  check("module share uses nextShareState", modulesRoute.includes("nextShareState(input.shared, now)"));
  check("module share honors include_worksheets cascade-on", modulesRoute.includes("input.include_worksheets === true") && modulesRoute.includes("set({ isShared: true, sharedAt: now })"));
  check("module share reports shared_worksheet_count", modulesRoute.includes("shared_worksheet_count"));
  check("module serializer exposes is_shared + attribution", modulesRoute.includes("is_shared: module.isShared") && modulesRoute.includes("copied_from_teacher_name: module.copiedFromTeacherName"));

  const worksheetsRoute = read("../routes/worksheets.ts");
  check("worksheet share endpoint exists, guru-only", worksheetsRoute.includes('worksheetRoutes.patch("/:id/share", requireRole("guru")'));
  check("worksheet share uses nextShareState", worksheetsRoute.includes("nextShareState(input.shared, new Date())"));
  check("worksheet serializer exposes is_shared + attribution", worksheetsRoute.includes("is_shared: worksheet.isShared") && worksheetsRoute.includes("copied_from_teacher_name: worksheet.copiedFromTeacherName"));

  const uploads = read("../routes/uploads.ts");
  check("download allows other teachers only for SHARED modules", uploads.includes("module.teacherId !== user.userId && !module.isShared"));

  const murid = read("../routes/murid.ts");
  check("student routes have no library trace", !murid.includes("perpustakaan") && !murid.includes("isShared") && !murid.includes("/library"));
}

console.log(`\nperpustakaan-bersama: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
