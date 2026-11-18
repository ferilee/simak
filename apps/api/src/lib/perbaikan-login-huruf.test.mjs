// Tests for the case-insensitive profile provisioning fix (bug login
// huruf besar/kecil, calon v1.0.76): a local users row inherited from
// the internal-endpoint era can store identifiers in a different case
// than the canonical RUAS values (production: local 'Aldo_kkkr' /
// 'Aldo_kkkr' vs RUAS 'aldo_kkkr' / id 230). The candidate query found
// that row through the case-insensitive DB collation, but
// planProfileSync compared with case-sensitive JS ===, decided
// "insert", and the insert collided with the unique username key
// under the same collation — login answered 503 "Penyimpanan SIMAK
// sedang tidak tersedia." on every attempt, and the RUAS→SIMAK
// handoff (same upsertSimakProfile) hit the same trap.
// Run with bun from apps/api:
//   bun src/lib/perbaikan-login-huruf.test.mjs
//
// Same convention as the other suites: no test database, so the pure
// decision (planProfileSync) is tested behaviorally and the DB wiring
// is locked statically. No migration: the journal stays at 24 entries.
import { readFileSync } from "node:fs";

// The modules under test parse the environment / build the db pool at
// import time; give them harmless dummy values before importing.
process.env.DATABASE_URL = "mysql://uji:uji@localhost:3306/simak_uji";
process.env.SESSION_SECRET = "secret-uji-perbaikan-login-huruf-0123456789";
process.env.RUSTFS_ENDPOINT = "http://localhost:9000";
process.env.RUSTFS_ACCESS_KEY = "uji";
process.env.RUSTFS_SECRET_KEY = "uji";

const { normalizeIdentity } = await import("./ruas-auth.ts");
const { planProfileSync } = await import("../services/user-profile.ts");

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
// Case 1 — exact matches still win exactly as before (no heal).
// ---------------------------------------------------------------------------
{
  const identity = { ruasUserId: "230", username: "aldo_kkkr" };
  const row = { id: 103, ruasUserId: "230", username: "aldo_kkkr" };

  const plan = planProfileSync(identity, [row]);
  check("exact match on both identifiers → sync, no heal",
    plan.action === "sync" && plan.user.id === 103 && plan.heal === false);

  const byUsername = planProfileSync(identity, [{ id: 7, ruasUserId: "id-lain", username: "aldo_kkkr" }]);
  check("exact match via username alone → sync, no heal",
    byUsername.action === "sync" && byUsername.heal === false);
  const byRuasId = planProfileSync(identity, [{ id: 8, ruasUserId: "230", username: "nama-lain" }]);
  check("exact match via ruas_user_id alone → sync, no heal",
    byRuasId.action === "sync" && byRuasId.heal === false);
}

// ---------------------------------------------------------------------------
// Case 2 — THE Aldo case: stored row carries the typed-case identifiers
// from the endpoint era ('Aldo_kkkr' in both columns); the shared-db
// identity is canonical ('aldo_kkkr', numeric ruas id '230'). The plan
// must SYNC the stored row with heal — never insert.
// ---------------------------------------------------------------------------
{
  const identity = { ruasUserId: "230", username: "aldo_kkkr" };
  const stored = { id: 103, ruasUserId: "Aldo_kkkr", username: "Aldo_kkkr" };

  const plan = planProfileSync(identity, [stored]);
  check("Aldo: case-differing stored row → sync WITH heal (not insert)",
    plan.action === "sync" && plan.user.id === 103 && plan.heal === true,
    JSON.stringify(plan));

  // Same trap through the ruas_user_id column alone (endpoint-era rows
  // whose ruas_user_id is the typed username, in screaming case).
  const byRuasId = planProfileSync(
    { ruasUserId: "aldo_kkkr", username: "aldo_kkkr" },
    [{ id: 55, ruasUserId: "ALDO_KKKR", username: "nama-lain" }],
  );
  check("case match via ruas_user_id alone → sync WITH heal",
    byRuasId.action === "sync" && byRuasId.user.id === 55 && byRuasId.heal === true);

  // And through the username column alone, mixed case stored.
  const byUsername = planProfileSync(identity, [{ id: 56, ruasUserId: "id-lain", username: "Aldo_KKKR" }]);
  check("case match via username alone → sync WITH heal",
    byUsername.action === "sync" && byUsername.user.id === 56 && byUsername.heal === true);

  // End-to-end composition: the shared-db identity is built by
  // normalizeIdentity from the RUAS row (numeric id, canonical
  // username) and then decides against the stored row — sync + heal,
  // and the values the sync writes are the identity's canonical ones
  // (that write is what heals 'Aldo_kkkr' into 'aldo_kkkr'/'230').
  const fromDb = normalizeIdentity({
    username: "aldo_kkkr",
    ruasUserId: 230,
    name: "Muhammad Aldo Eka Wardana",
    role: "participant",
  });
  const composed = fromDb && planProfileSync(fromDb, [stored]);
  check("incident replay: canonical identity syncs the stored row with canonical values",
    fromDb !== null && composed !== null && composed.action === "sync"
    && composed.user.id === 103 && composed.heal === true
    && fromDb.ruasUserId === "230" && fromDb.username === "aldo_kkkr");
}

// ---------------------------------------------------------------------------
// Case 3 — legacy spaced ghosts still heal, and case+space combined
// heals too (the fold is trim THEN lowercase, on both sides).
// ---------------------------------------------------------------------------
{
  const identity = { ruasUserId: "230", username: "aldo_kkkr" };

  const spaced = { id: 160, ruasUserId: " aldo_kkkr", username: " aldo_kkkr" };
  const healSpaced = planProfileSync({ ruasUserId: "aldo_kkkr", username: "aldo_kkkr" }, [spaced]);
  check("spaced-only stored row still → sync WITH heal",
    healSpaced.action === "sync" && healSpaced.user.id === 160 && healSpaced.heal === true);

  const spacedAndCased = { id: 170, ruasUserId: " Aldo_kkkr ", username: " Aldo_kkkr " };
  const healBoth = planProfileSync(identity, [spacedAndCased]);
  check("case AND space combined → sync WITH heal",
    healBoth.action === "sync" && healBoth.user.id === 170 && healBoth.heal === true,
    JSON.stringify(healBoth));
}

// ---------------------------------------------------------------------------
// Case 4 — priority stays deterministic: an exact row beats a
// case-differing row even when listed later; among folded candidates
// the first (lowest id; the route orders by id) is healed.
// ---------------------------------------------------------------------------
{
  const identity = { ruasUserId: "230", username: "aldo_kkkr" };
  const caseRow = { id: 50, ruasUserId: "Aldo_kkkr", username: "Aldo_kkkr" };
  const exactRow = { id: 60, ruasUserId: "230", username: "aldo_kkkr" };

  const collision = planProfileSync(identity, [caseRow, exactRow]);
  check("collision: exact row wins over the case-differing row listed first",
    collision.action === "sync" && collision.user.id === 60 && collision.heal === false);

  const otherCaseRow = { id: 70, ruasUserId: "ALDO_KKKR", username: "ALDO_KKKR" };
  const twoFolded = planProfileSync(identity, [caseRow, otherCaseRow]);
  check("two folded candidates → the first is healed",
    twoFolded.action === "sync" && twoFolded.user.id === 50 && twoFolded.heal === true);
}

// ---------------------------------------------------------------------------
// Case 5 — genuinely new users still insert; the fold must not
// over-match different students.
// ---------------------------------------------------------------------------
{
  const identity = { ruasUserId: "230", username: "aldo_kkkr" };

  check("no candidates → insert", planProfileSync(identity, []).action === "insert");

  const stranger = { id: 99, ruasUserId: "beni_kkkr", username: "beni_kkkr" };
  check("unrelated candidate (a different student) → insert",
    planProfileSync(identity, [stranger]).action === "insert");

  const nearMiss = { id: 98, ruasUserId: "aldo_kkkr2", username: "aldo_kkkr2" };
  check("near-miss identifier (extra suffix) does not fold-match → insert",
    planProfileSync(identity, [nearMiss]).action === "insert");
}

// ---------------------------------------------------------------------------
// Case 6 — wiring locks: the fold is trim+lowercase and runs AFTER the
// exact comparison; the candidate query also folds (lower+trim) so the
// stored row is found under any column collation, while keeping the
// exact and trim comparisons; the sync write stores the identity's
// canonical identifiers (the heal); login and the RUAS→SIMAK handoff
// share the same upsertSimakProfile path.
// ---------------------------------------------------------------------------
{
  const profile = read("../services/user-profile.ts");
  const planSegment = profile.slice(
    profile.indexOf("export function planProfileSync"),
    profile.indexOf("export async function upsertSimakProfile"),
  );
  check("fold is trim + lowercase",
    profile.includes('return value.trim().toLowerCase();'));
  check("decision checks exact equality before folded equality",
    planSegment.indexOf("row.ruasUserId === identity.ruasUserId") > -1
    && planSegment.indexOf("row.ruasUserId === identity.ruasUserId")
      < planSegment.indexOf("foldIdentifier(row.ruasUserId) === foldIdentifier(identity.ruasUserId)"));
  check("folded match syncs WITH heal; fallthrough stays insert",
    planSegment.includes("if (legacy) return { action: \"sync\", user: legacy, heal: true };")
    && planSegment.includes("return { action: \"insert\" };"));

  const upsertSegment = profile.slice(profile.indexOf("export async function upsertSimakProfile"));
  check("candidate query keeps the exact comparisons",
    upsertSegment.includes("eq(users.ruasUserId, identity.ruasUserId)")
    && upsertSegment.includes("eq(users.username, identity.username)"));
  check("candidate query keeps the TRIM comparisons",
    upsertSegment.includes("sql`trim(${users.ruasUserId}) = ${identity.ruasUserId}`")
    && upsertSegment.includes("sql`trim(${users.username}) = ${identity.username}`"));
  check("candidate query adds folded lower(trim(...)) comparisons",
    upsertSegment.includes("sql`lower(trim(${users.ruasUserId})) = ${foldedRuasUserId}`")
    && upsertSegment.includes("sql`lower(trim(${users.username})) = ${foldedUsername}`"));
  check("the sync write stores the identity's canonical identifiers — that write is the heal",
    upsertSegment.includes("ruasUserId: identity.ruasUserId,")
    && upsertSegment.includes("username: identity.username,"));

  const auth = read("../routes/auth.ts");
  check("login route provisions through upsertSimakProfile",
    auth.includes("upsertSimakProfile(identity)"));
  const handoff = read("../routes/serah-terima.ts");
  check("RUAS→SIMAK handoff provisions through the SAME upsertSimakProfile",
    handoff.includes("upsertSimakProfile(identity)"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 24 entries (no migration in this package)", journal.entries.length === 24,
    `got ${journal.entries.length}`);
}

console.log(`\nperbaikan-login-huruf: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
