// Tests for Live Kelompok presence (versi ringan — polling): the in-memory
// presence store (heartbeat, TTL, per-attempt isolation, prune on read) and
// the static wiring of the two murid endpoints that use it.
// Run with bun from apps/api:  bun src/lib/presence.test.mjs
//
// The lib functions are pure (store + now are parameters) and are exercised
// behaviorally; the HTTP routes have no test database in this repo's
// convention (see groups.test.mjs), so their auth path and response shapes
// are locked statically against the route source.
import { readFileSync } from "node:fs";
import {
  PRESENCE_TTL_MS,
  createPresenceStore,
  presenceSnapshot,
  recordHeartbeat,
} from "./presence.ts";

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

console.log("Case 1: heartbeat tercatat dan terbaca kembali");
{
  const store = createPresenceStore();
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, 5, 1_000);
  const snap = presenceSnapshot(store, 10, 1_500);
  check("satu entri aktif", snap.length === 1, JSON.stringify(snap));
  check(
    "entri memuat studentId, nama, dan butir saat ini",
    snap[0]?.studentId === 1 && snap[0]?.name === "Ani" && snap[0]?.currentItemId === 5,
  );
  check("attempt lain kosong", presenceSnapshot(store, 99, 1_500).length === 0);
}

console.log("Case 2: heartbeat berikutnya menimpa butir dan waktu");
{
  const store = createPresenceStore();
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, 5, 1_000);
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, null, 2_000);
  const snap = presenceSnapshot(store, 10, 2_100);
  check("tetap satu entri untuk murid yang sama", snap.length === 1);
  check("butir mengikuti detak terakhir (null = tinjauan)", snap[0]?.currentItemId === null);
  check("lastSeen mengikuti detak terakhir", snap[0]?.lastSeen === 2_000);
}

console.log("Case 3: isolasi per attempt dan banyak murid");
{
  const store = createPresenceStore();
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, 5, 1_000);
  recordHeartbeat(store, 10, { id: 2, name: "Budi" }, 5, 1_000);
  recordHeartbeat(store, 11, { id: 1, name: "Ani" }, 7, 1_000);
  check("attempt 10 punya dua murid", presenceSnapshot(store, 10, 1_100).length === 2);
  const snap11 = presenceSnapshot(store, 11, 1_100);
  check("attempt 11 hanya memuat detaknya sendiri", snap11.length === 1 && snap11[0]?.currentItemId === 7);
}

console.log("Case 4: TTL — segar sebelum batas, basi tepat di batas");
{
  const store = createPresenceStore();
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, 5, 0);
  check("TTL bawaan 12 detik", PRESENCE_TTL_MS === 12_000);
  check("umur 11.999 ms masih aktif", presenceSnapshot(store, 10, PRESENCE_TTL_MS - 1).length === 1);
  // Snapshot di atas tidak membuang entri yang masih aktif; detak yang sama
  // kini tepat berumur TTL → basi.
  check("umur tepat 12.000 ms sudah basi", presenceSnapshot(store, 10, PRESENCE_TTL_MS).length === 0);
  check("snapshot attempt tak dikenal kosong", presenceSnapshot(store, 42, 0).length === 0);
}

console.log("Case 5: prune on read — entri basi dibuang dari store");
{
  const store = createPresenceStore();
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, 5, 0);
  recordHeartbeat(store, 10, { id: 2, name: "Budi" }, 6, 0);
  presenceSnapshot(store, 10, PRESENCE_TTL_MS + 1);
  check("peta attempt yang kosong ikut terhapus", !store.has(10));
  recordHeartbeat(store, 10, { id: 3, name: "Citra" }, 1, 20_000);
  recordHeartbeat(store, 10, { id: 4, name: "Dodi" }, 2, 20_000);
  const snap = presenceSnapshot(store, 10, 20_000 + PRESENCE_TTL_MS + 1);
  check("semua basi → hasil kosong", snap.length === 0);
  check("store bersih sesudah prune total", !store.has(10));
}

console.log("Case 6: TTL kustom dihormati");
{
  const store = createPresenceStore();
  recordHeartbeat(store, 10, { id: 1, name: "Ani" }, 5, 1_000);
  check("ttl 500: umur 400 aktif", presenceSnapshot(store, 10, 1_400, 500).length === 1);
  check("ttl 500: umur 500 basi", presenceSnapshot(store, 10, 1_500, 500).length === 0);
}

console.log("Case 7: store murni memori — tanpa akses basis data");
{
  const lib = readFileSync(new URL("./presence.ts", import.meta.url), "utf8");
  check("lib tidak mengimpor @simak/db", !lib.includes("@simak/db"));
  check("lib tidak menulis db apa pun", !lib.includes("db.insert") && !lib.includes("db.update"));
  check("asumsi satu instans API dinyatakan di komentar", lib.includes("TEPAT SATU kontainer/proses API"));
}

console.log("Case 8: wiring endpoint di routes/murid.ts");
{
  const murid = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../../../../packages/shared/src/schemas.ts", import.meta.url), "utf8");
  check("skema presenceHeartbeatSchema ada di @simak/shared", shared.includes("export const presenceHeartbeatSchema"));
  check(
    "POST presence memakai zValidator skema itu",
    murid.includes('muridRoutes.post("/worksheets/:id/presence", zValidator("json", presenceHeartbeatSchema)'),
  );
  check("GET live terdaftar", murid.includes('muridRoutes.get("/worksheets/:id/live"'));

  const presenceRoute = murid.slice(murid.indexOf('muridRoutes.post("/worksheets/:id/presence"'), murid.indexOf('muridRoutes.get("/worksheets/:id/live"'));
  const liveRoute = murid.slice(murid.indexOf('muridRoutes.get("/worksheets/:id/live"'), murid.indexOf('muridRoutes.put("/worksheets/:id/answers"'));
  check("kedua rute ditemukan", presenceRoute.length > 0 && liveRoute.length > 0);
  check("POST memakai accessibleWorksheet (gerbang halaman)", presenceRoute.includes("accessibleWorksheet(user.userId, worksheetId)"));
  check("GET memakai accessibleWorksheet (gerbang halaman)", liveRoute.includes("accessibleWorksheet(user.userId, worksheetId)"));
  check("POST memakai resolveAttemptContext (jalur yang sama dengan halaman)", presenceRoute.includes("resolveAttemptContext(user.userId, worksheetId"));
  check("GET memakai resolveAttemptContext (jalur yang sama dengan halaman)", liveRoute.includes("resolveAttemptContext(user.userId, worksheetId"));
  check("POST mencatat heartbeat ke store bersama", presenceRoute.includes("recordHeartbeat(presenceStore, context.attempt.id"));
  check(
    "POST menjawab live:false untuk individu/belum berkelompok",
    presenceRoute.includes('if (context.kind === "ungrouped" || !context.group) return c.json({ ok: true, data: { live: false } });'),
  );
  check("POST menjawab live:true untuk anggota kelompok", presenceRoute.includes("return c.json({ ok: true, data: { live: true } });"));
  check("GET membaca snapshot presensi", liveRoute.includes("presenceSnapshot(presenceStore, attempt.id, Date.now())"));
  check("GET menyaring diri sendiri dari presensi", liveRoute.includes("entry.studentId !== user.userId"));
  check(
    "GET mengirim bentuk jawaban halaman + penulis + waktu",
    liveRoute.includes("item_id: row.itemId")
      && liveRoute.includes("answer_text: row.answerText")
      && liveRoute.includes("attachment_key: row.attachmentKey")
      && liveRoute.includes("last_edited_by_name:")
      && liveRoute.includes("updated_at: row.updatedAt"),
  );
  check("GET mengirim attempt_status", liveRoute.includes("attempt_status: attempt.status"));
  check(
    "GET untuk belum berkelompok tidak membocorkan data",
    liveRoute.includes("ungrouped: true, attempt_status: null, answers: [], presence: []"),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
