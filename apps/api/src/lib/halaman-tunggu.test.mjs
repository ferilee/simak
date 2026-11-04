// Tests for "Halaman Tunggu — Penugasan belum dibuka" (v1.0.37): the
// student assignment-detail endpoint enriches ONLY its not-yet-open 403
// with the assignment's public-to-target basics { title, subject_name,
// opens_at, closes_at } so the web can render a themed waiting page
// with a live countdown instead of a blank page + a small toast.
// Run with bun from apps/api:  bun src/lib/halaman-tunggu.test.mjs
//
// There is no test database in this repo's convention, so: the pure
// response builder is tested behaviorally over fixtures (a targeted
// student before opensAt gets exactly the four data fields with ISO
// values; the message stays byte-identical), and the route wiring —
// gate order (404 for non-targets first, with NO data), the subject
// resolved through loadAssignmentSubject, the normal 200 detail left
// untouched, the exit-ticket gate unchanged — is locked statically
// against the sources. Jalur A is locked too: no new migration.
import { readFileSync, readdirSync } from "node:fs";
import { buildNotYetOpenBody } from "./halaman-tunggu.ts";

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
console.log("Case 1: pembangun respons murni — isi 403 yang diperkaya");
{
  const assignment = {
    title: "BK 1.1 — Berpikir Komputasional",
    opensAt: new Date("2026-11-05T03:55:00.000Z"),
    dueAt: new Date("2026-11-05T10:55:00.000Z"),
  };
  const body = buildNotYetOpenBody(assignment, "Koding dan Kecerdasan Artifisial (KKA)");
  check("ok tetap false", body.ok === false);
  check("pesan persis seperti sebelumnya", body.message === "Penugasan belum dibuka.", body.message);
  check("data memuat tepat empat bidang", JSON.stringify(Object.keys(body.data).sort()) === JSON.stringify(["closes_at", "opens_at", "subject_name", "title"]), Object.keys(body.data).join(","));
  check("title dari penugasan", body.data.title === "BK 1.1 — Berpikir Komputasional", body.data.title);
  check("subject_name dari penyelesaian mapel", body.data.subject_name === "Koding dan Kecerdasan Artifisial (KKA)", body.data.subject_name);
  check("opens_at string ISO dari opensAt", body.data.opens_at === "2026-11-05T03:55:00.000Z", body.data.opens_at);
  check("closes_at string ISO dari dueAt", body.data.closes_at === "2026-11-05T10:55:00.000Z", body.data.closes_at);
  const noSubject = buildNotYetOpenBody(assignment, null);
  check("mapel tak teratasi → subject_name null (bukan string kosong)", noSubject.data.subject_name === null);
  check("tanpa mapel pun opens_at/closes_at tetap ISO", noSubject.data.opens_at === "2026-11-05T03:55:00.000Z" && noSubject.data.closes_at === "2026-11-05T10:55:00.000Z");
}

// ---------------------------------------------------------------------------
console.log("Case 2: pengawatan rute detail — urutan gerbang dan bentuk respons");
{
  const murid = read("../routes/murid.ts");
  const detailStart = murid.indexOf('muridRoutes.get("/assignments/:id", async (c)');
  const detailEnd = murid.indexOf('muridRoutes.post("/assignments/:id/exit-ticket"');
  check("handler detail ditemukan", detailStart !== -1 && detailEnd > detailStart);
  const detail = murid.slice(detailStart, detailEnd);

  const notFoundAt = detail.indexOf('"Penugasan belum tersedia untuk kelas Anda."');
  const gateAt = detail.indexOf("buildNotYetOpenBody(assignment, subjectName)");
  check("404 bukan-sasaran tetap ada di handler detail", notFoundAt !== -1);
  check("gerbang belum-dibuka memakai buildNotYetOpenBody", gateAt !== -1);
  check("404 dinilai SEBELUM gerbang belum-dibuka (bukan sasaran tidak pernah menerima data)", notFoundAt !== -1 && gateAt !== -1 && notFoundAt < gateAt);
  check("baris 404 polos tanpa data", detail.includes('return c.json({ ok: false, message: "Penugasan belum tersedia untuk kelas Anda." }, 404);'));
  check("gerbang membandingkan waktu kini dengan opensAt", detail.includes("if (now < assignment.opensAt.getTime())"));
  check("pemeriksaan sasaran tetap lewat accessibleAssignment", detail.includes("await accessibleAssignment(user.userId, assignmentId)"));
  check("mapel diselesaikan lewat loadAssignmentSubject", detail.includes("await loadAssignmentSubject(assignment)"));
  check("respons gerbang berstatus 403", detail.includes("return c.json(buildNotYetOpenBody(assignment, subjectName), 403);"));
  check("respons detail normal tetap { ok: true, data: { assignment: serializeAssignmentForStudent(...), ... } }", detail.includes("assignment: serializeAssignmentForStudent(assignment, assignmentProgress(assignment, attempt)"));
  check("pencatatan buka_materi tetap sesudah gerbang waktu", detail.indexOf('event: "buka_materi"') > gateAt);
}

// ---------------------------------------------------------------------------
console.log("Case 3: permukaan lain tidak berubah");
{
  const murid = read("../routes/murid.ts");
  const exitStart = murid.indexOf('muridRoutes.post("/assignments/:id/exit-ticket"');
  const exit = murid.slice(exitStart, exitStart + 1200);
  check("gerbang exit-ticket tetap 403 polos tanpa data", exit.includes('return c.json({ ok: false, message: "Penugasan belum dibuka." }, 403);'));
  check("exit-ticket tidak memakai buildNotYetOpenBody", !exit.includes("buildNotYetOpenBody"));
  check("impor loadAssignmentSubject + buildNotYetOpenBody terpasang", murid.includes('from "../lib/assignment-target"') && murid.includes('import { buildNotYetOpenBody } from "../lib/halaman-tunggu";'));
}

// ---------------------------------------------------------------------------
console.log("Case 4: Jalur A — tidak ada migrasi baru");
{
  const files = readdirSync(new URL("../../../../packages/db/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
  check("tidak ada berkas migrasi 0012+", !files.some((name) => /^001[2-9]/.test(name)), files.join(","));
  const journal = JSON.parse(read("../../../../packages/db/migrations/meta/_journal.json"));
  check("jurnal tetap 12 entri (idx terakhir 11)", journal.entries.length === 12 && journal.entries[journal.entries.length - 1].idx === 11);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
