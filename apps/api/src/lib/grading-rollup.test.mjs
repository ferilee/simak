// Tests for "Status Penilaian di Pantau Hasil" (v1.0.66): rollup status
// penilaian per penugasan dari attempt efektif.
// Run with bun from apps/api:  bun src/lib/grading-rollup.test.mjs
//
// There is no test database in this repo's convention, so: the pure
// derivation (status from counts, unit summarization reusing the shared
// isGradedAttempt predicate) is tested behaviorally, and the route/loader
// wiring (batched loader, additive payload fields, no migration) is
// locked statically against the sources.
import { readFileSync } from "node:fs";
import { deriveGradingStatus, summarizeGradingUnits } from "./grading-rollup.ts";

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
const rollupLib = read("./grading-rollup.ts");
const assignmentsRoute = read("../routes/assignments.ts");

function attempt(status, totalScore) {
  return { id: 1, status, submittedAt: null, totalScore, updatedAt: new Date(0) };
}
const unit = (att, gradedItemCount = 0) => ({ attempt: att, gradedItemCount });

// ---------------------------------------------------------------------------
console.log("Case 1: penurunan status dari hitungan (semua batas)");
{
  check("0 pengumpulan → belum_ada_pengumpulan", deriveGradingStatus(0, 0) === "belum_ada_pengumpulan");
  check("ada pengumpulan, 0 dinilai → belum_dinilai", deriveGradingStatus(3, 0) === "belum_dinilai");
  check("1 dari 3 → sebagian", deriveGradingStatus(3, 1) === "sebagian");
  check("2 dari 3 → sebagian", deriveGradingStatus(3, 2) === "sebagian");
  check("1 dari 1 → selesai", deriveGradingStatus(1, 1) === "selesai");
  check("semua dinilai → selesai", deriveGradingStatus(8, 8) === "selesai");
}

// ---------------------------------------------------------------------------
console.log("Case 2: ringkasan unit — predikat dinilai + cicilan");
{
  const empty = summarizeGradingUnits([]);
  check("tanpa unit → semua nol + belum_ada_pengumpulan",
    empty.submitted_count === 0 && empty.graded_count === 0 && empty.partial_count === 0 && empty.grading_status === "belum_ada_pengumpulan",
    JSON.stringify(empty));

  const noAttempt = summarizeGradingUnits([unit(undefined), unit(undefined)]);
  check("unit tanpa attempt tidak terhitung", noAttempt.submitted_count === 0 && noAttempt.grading_status === "belum_ada_pengumpulan");

  const drafts = summarizeGradingUnits([unit(attempt("draf", null), 3)]);
  check("attempt draf bukan pengumpulan (walau ada butir berskor)", drafts.submitted_count === 0 && drafts.partial_count === 0);

  const plain = summarizeGradingUnits([unit(attempt("terkumpul", null), 0)]);
  check("terkumpul polos → penyebut 1, bukan dinilai, bukan cicilan",
    plain.submitted_count === 1 && plain.graded_count === 0 && plain.partial_count === 0 && plain.grading_status === "belum_dinilai",
    JSON.stringify(plain));

  const cicil = summarizeGradingUnits([unit(attempt("terkumpul", null), 2)]);
  check("terkumpul + butir berskor → sedang dicicil, tetap belum_dinilai",
    cicil.submitted_count === 1 && cicil.graded_count === 0 && cicil.partial_count === 1 && cicil.grading_status === "belum_dinilai",
    JSON.stringify(cicil));

  const gradedUnit = summarizeGradingUnits([unit(attempt("dinilai", "85.00"), 4)]);
  check("dinilai + total terisi → dinilai (predikat isGradedAttempt)",
    gradedUnit.submitted_count === 1 && gradedUnit.graded_count === 1 && gradedUnit.partial_count === 0 && gradedUnit.grading_status === "selesai",
    JSON.stringify(gradedUnit));

  const broken = summarizeGradingUnits([unit(attempt("dinilai", null), 4)]);
  check("dinilai tanpa total (keadaan rusak) → terhitung masuk, BUKAN dinilai, BUKAN cicilan",
    broken.submitted_count === 1 && broken.graded_count === 0 && broken.partial_count === 0 && broken.grading_status === "belum_dinilai",
    JSON.stringify(broken));

  const mixed = summarizeGradingUnits([
    unit(attempt("dinilai", "90.00"), 5),
    unit(attempt("terkumpul", null), 3),
    unit(attempt("terkumpul", null), 0),
    unit(attempt("draf", null), 0),
    unit(undefined),
  ]);
  check("campuran: submitted 3, graded 1, partial 1 → sebagian",
    mixed.submitted_count === 3 && mixed.graded_count === 1 && mixed.partial_count === 1 && mixed.grading_status === "sebagian",
    JSON.stringify(mixed));

  const allGraded = summarizeGradingUnits([unit(attempt("dinilai", "70.00"), 5), unit(attempt("dinilai", "0.00"), 5)]);
  check("semua dinilai (termasuk total 0) → selesai", allGraded.graded_count === 2 && allGraded.grading_status === "selesai");

  const onlyPartial = summarizeGradingUnits([unit(attempt("terkumpul", null), 1), unit(attempt("terkumpul", null), 2)]);
  check("semua pengumpulan masih dicicil → belum_dinilai dengan partial 2",
    onlyPartial.grading_status === "belum_dinilai" && onlyPartial.partial_count === 2 && onlyPartial.graded_count === 0);
}

// ---------------------------------------------------------------------------
console.log("Case 3: kabel statis route + pemuat + tanpa migrasi");
{
  check("pemuat memakai predikat isGradedAttempt dari nilai-saya (bukan definisi baru)",
    rollupLib.includes('from "./nilai-saya"') && rollupLib.includes("isGradedAttempt(attempt)"));
  check("pemuat menghitung butir berskor lewat countGradedByAttempt",
    rollupLib.includes("countGradedByAttempt(gradedRows)") && rollupLib.includes("isNotNull(worksheetAnswers.score)"));
  check("unit kelompok dari assignment_groups, unit individu dari sasaran penugasan",
    rollupLib.includes("assignmentGroups.assignmentId") && rollupLib.includes("targetsByAssignment"));
  check("route daftar penugasan memanggil pemuat rollup",
    assignmentsRoute.includes("loadAssignmentGradingRollups(user.userId, rows)"));
  check("serializeAssignment mengirim grading + grading_by_class (aditif)",
    assignmentsRoute.includes("grading: gradingView") && assignmentsRoute.includes("grading_by_class: gradingView?.by_class ?? []"));
  const journal = JSON.parse(read("../../../../packages/db/migrations/meta/_journal.json"));
  check("jurnal migrasi tetap 23 entri, terakhir 0022_token_serah_terima",
    journal.entries.length === 23 && journal.entries[journal.entries.length - 1].tag === "0022_token_serah_terima");
}

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
