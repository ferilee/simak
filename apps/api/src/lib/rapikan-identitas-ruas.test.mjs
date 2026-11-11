// Tests for the RUAS identity tidy-up (rapikan identitas): a username that
// arrives from the auth source with a leading space (' raditya_rpl') once
// slipped past the unique constraints and created a duplicate "phantom"
// profile for the same student (production users id 160; a second spaced
// username ' aurel_dkva' id 190 exists too). The fix: normalizeIdentity
// trims both identifiers at ingestion, and upsertSimakProfile heals a
// stored spaced row in place via a trimmed match when no exact match
// exists — an exact match always wins and leaves the spaced twin alone.
// Run with bun from apps/api:
//   bun src/lib/rapikan-identitas-ruas.test.mjs
//
// Same convention as the other suites: no test database, so the pure
// rules (identity normalization, the sync decision) are tested
// behaviorally and the DB wiring is locked statically. No migration:
// the journal stays at 15 entries.
import { readFileSync } from "node:fs";

// The modules under test parse the environment / build the db pool at
// import time; give them harmless dummy values before importing.
process.env.DATABASE_URL = "mysql://uji:uji@localhost:3306/simak_uji";
process.env.SESSION_SECRET = "secret-uji-rapikan-identitas-0123456789";
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// Case 1 — normalizeIdentity, endpoint shape: identifiers arrive as
// strings (ruas_user_id from the response body, username from the login
// form). Spaced input must resolve to the clean identity.
// ---------------------------------------------------------------------------
{
  const clean = normalizeIdentity({
    username: "raditya_rpl",
    role: "participant",
    ruasUserId: "raditya_rpl",
    name: "Raditya Akbar Maulana",
  });
  const spaced = normalizeIdentity({
    username: " raditya_rpl",
    role: "participant",
    ruasUserId: " raditya_rpl",
    name: "Raditya Akbar Maulana",
  });
  check("endpoint: clean input passes through", clean !== null
    && clean.username === "raditya_rpl" && clean.ruasUserId === "raditya_rpl" && clean.role === "murid");
  check("endpoint: leading-space input is trimmed on both identifiers", spaced !== null
    && spaced.username === "raditya_rpl" && spaced.ruasUserId === "raditya_rpl",
    JSON.stringify(spaced));
  check("endpoint: spaced identity resolves to the SAME identity as clean", same(spaced, clean));
  const trailing = normalizeIdentity({
    username: "raditya_rpl ",
    role: "participant",
    ruasUserId: "raditya_rpl ",
    name: "Raditya Akbar Maulana",
  });
  check("endpoint: trailing space is trimmed too", same(trailing, clean));
}

// ---------------------------------------------------------------------------
// Case 2 — normalizeIdentity, shared-db shape: ruasUserId is the numeric
// RUAS row id, username comes from the RUAS row itself and can carry the
// space. Role mapping and fallbacks are unchanged.
// ---------------------------------------------------------------------------
{
  const fromDb = normalizeIdentity({
    username: " raditya_rpl",
    ruasUserId: 160,
    name: "Raditya Akbar Maulana",
    role: "participant",
  });
  check("shared-db: numeric ruas id stringified, username trimmed", fromDb !== null
    && fromDb.ruasUserId === "160" && fromDb.username === "raditya_rpl" && fromDb.role === "murid",
    JSON.stringify(fromDb));
  const guru = normalizeIdentity({ username: " guru_satu ", ruasUserId: 7, name: "Guru Satu", role: "editor" });
  check("shared-db: editor still maps to guru", guru !== null && guru.role === "guru" && guru.username === "guru_satu");
  const fallback = normalizeIdentity({ username: " siswa_baru ", role: "participant" });
  check("fallback: missing ruas id falls back to the TRIMMED username", fallback !== null
    && fallback.ruasUserId === "siswa_baru" && fallback.name === "siswa_baru",
    JSON.stringify(fallback));
  check("role: unmapped role still rejected (admin → null)",
    normalizeIdentity({ username: "admin", role: "admin", ruasUserId: "admin" }) === null);
  check("role: unknown role still rejected",
    normalizeIdentity({ username: "x", role: "superuser", ruasUserId: "x" }) === null);
}

// ---------------------------------------------------------------------------
// Case 3 — an identifier that trimming EMPTIES is invalid, through the
// same null flow as an unmapped role.
// ---------------------------------------------------------------------------
{
  check("whitespace-only username → null",
    normalizeIdentity({ username: "   ", role: "participant", ruasUserId: "abc" }) === null);
  check("whitespace-only ruas id → null",
    normalizeIdentity({ username: "siswa1", role: "participant", ruasUserId: "   " }) === null);
  check("whitespace-only username with fallback ruas id → null",
    normalizeIdentity({ username: "  ", role: "participant" }) === null);
}

// ---------------------------------------------------------------------------
// Case 4 — planProfileSync: the priority decision over stored candidates.
// Rows mirror production: id 16 is the live profile, id 160 the spaced
// phantom twin.
// ---------------------------------------------------------------------------
{
  const identity = { ruasUserId: "raditya_rpl", username: "raditya_rpl" };
  const live = { id: 16, ruasUserId: "raditya_rpl", username: "raditya_rpl" };
  const phantom = { id: 160, ruasUserId: " raditya_rpl", username: " raditya_rpl" };

  const exactOnly = planProfileSync(identity, [live]);
  check("exact match → sync, no heal", exactOnly.action === "sync"
    && exactOnly.user.id === 16 && exactOnly.heal === false);

  const collision = planProfileSync(identity, [phantom, live]);
  check("collision: exact row wins even when the phantom is listed first",
    collision.action === "sync" && collision.user.id === 16 && collision.heal === false);

  const heal = planProfileSync(identity, [phantom]);
  check("trimmed-only match → sync the phantom row WITH heal", heal.action === "sync"
    && heal.user.id === 160 && heal.heal === true);

  const byUsername = planProfileSync(identity, [{ id: 7, ruasUserId: "id-lain", username: "raditya_rpl" }]);
  check("exact match via username alone counts", byUsername.action === "sync" && byUsername.heal === false);
  const byRuasId = planProfileSync(identity, [{ id: 8, ruasUserId: "raditya_rpl", username: "nama-lain" }]);
  check("exact match via ruas_user_id alone counts", byRuasId.action === "sync" && byRuasId.heal === false);

  const trailingPhantom = { id: 170, ruasUserId: "raditya_rpl ", username: "raditya_rpl " };
  const healTrailing = planProfileSync(identity, [trailingPhantom]);
  check("trailing-space stored row also heals", healTrailing.action === "sync"
    && healTrailing.user.id === 170 && healTrailing.heal === true);

  const twoPhantoms = planProfileSync(identity, [phantom, trailingPhantom]);
  check("two trimmed candidates → the first (lowest id; the route orders by id) is healed",
    twoPhantoms.action === "sync" && twoPhantoms.user.id === 160 && twoPhantoms.heal === true);

  check("no candidates → insert", planProfileSync(identity, []).action === "insert");
  const stranger = { id: 99, ruasUserId: "raditya_kkkr", username: "raditya_kkkr" };
  check("unrelated candidate (a different student) → insert",
    planProfileSync(identity, [stranger]).action === "insert");

  // End-to-end composition of the incident: a spaced login identity is
  // normalized first, then decides against the stored phantom — the row
  // chosen for sync is the phantom, and the values the sync writes are
  // the identity's (trimmed) identifiers.
  const healedIdentity = normalizeIdentity({
    username: " raditya_rpl",
    role: "participant",
    ruasUserId: " raditya_rpl",
    name: "Raditya Akbar Maulana",
  });
  const plan = planProfileSync(healedIdentity, [phantom]);
  check("incident replay: spaced login heals the stored phantom with trimmed values",
    healedIdentity !== null && plan.action === "sync" && plan.user.id === 160 && plan.heal === true
    && healedIdentity.ruasUserId === "raditya_rpl" && healedIdentity.username === "raditya_rpl");
}

// ---------------------------------------------------------------------------
// Case 5 — wiring locks: both auth paths construct identities ONLY via
// normalizeIdentity (which trims), and upsertSimakProfile asks
// planProfileSync over a candidate query that includes TRIM comparisons,
// then writes the identity's values on sync (that write is the heal).
// ---------------------------------------------------------------------------
{
  const ruasAuth = read("./ruas-auth.ts");
  const normalizeSegment = ruasAuth.slice(
    ruasAuth.indexOf("export function normalizeIdentity"),
    ruasAuth.indexOf("async function authenticateWithEndpoint"),
  );
  check("normalizeIdentity trims the username", normalizeSegment.includes("input.username.trim()"));
  check("normalizeIdentity trims the resolved ruas id",
    normalizeSegment.includes("String(input.ruasUserId ?? input.username).trim()"));
  check("normalizeIdentity rejects identifiers emptied by trimming",
    normalizeSegment.includes("if (!username || !ruasUserId) return null;"));
  check("incident comment recorded at the normalization point",
    normalizeSegment.includes("profil hantu") && normalizeSegment.includes("berawalan spasi"));
  check("both auth paths go through normalizeIdentity (endpoint + shared-db)",
    (ruasAuth.match(/return normalizeIdentity\(\{/g) ?? []).length === 2);

  const profile = read("../services/user-profile.ts");
  const planSegment = profile.slice(
    profile.indexOf("export function planProfileSync"),
    profile.indexOf("export async function upsertSimakProfile"),
  );
  check("decision checks exact equality before trimmed equality",
    planSegment.indexOf("row.ruasUserId === identity.ruasUserId") > -1
    && planSegment.indexOf("row.ruasUserId === identity.ruasUserId")
      < planSegment.indexOf("row.ruasUserId.trim() === identity.ruasUserId"));
  const upsertSegment = profile.slice(profile.indexOf("export async function upsertSimakProfile"));
  check("candidate query keeps the exact comparisons",
    upsertSegment.includes("eq(users.ruasUserId, identity.ruasUserId)")
    && upsertSegment.includes("eq(users.username, identity.username)"));
  check("candidate query adds TRIM comparisons for stored spaced identifiers",
    upsertSegment.includes("sql`trim(${users.ruasUserId}) = ${identity.ruasUserId}`")
    && upsertSegment.includes("sql`trim(${users.username}) = ${identity.username}`"));
  check("candidates are deterministically ordered and decided by planProfileSync",
    upsertSegment.includes(".orderBy(asc(users.id))")
    && upsertSegment.includes("planProfileSync(identity, candidates)"));
  check("the sync write stores the identity's (trimmed) identifiers — that write is the heal",
    upsertSegment.includes("ruasUserId: identity.ruasUserId,")
    && upsertSegment.includes("username: identity.username,"));

  const journal = JSON.parse(readRepo("packages/db/migrations/meta/_journal.json"));
  check("journal has exactly 15 entries (no migration in this package)", journal.entries.length === 15,
    `got ${journal.entries.length}`);
}

console.log(`\nrapikan-identitas-ruas: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
