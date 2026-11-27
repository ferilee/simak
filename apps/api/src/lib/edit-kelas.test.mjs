// Tests for "Edit Kelas" (PATCH kelas diperluas + regenerate kode gabung).
// Run with bun from apps/api:  bun src/lib/edit-kelas.test.mjs
//
// There is no test database in this repo's convention, so: the pure patch
// planner (lib/edit-kelas.ts) is tested behaviorally, and the route wiring
// (ownership guard, planner use, regenerate endpoint, payload shape) is
// locked statically against the route source.
import { readFileSync } from "node:fs";
import { planClassPatch } from "./edit-kelas.ts";

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
console.log("Case 1: perilaku lama — badan kosong berarti alihkan arsip (toggle)");
{
  for (const [label, body] of [["null", null], ["undefined", undefined], ["objek kosong", {}]]) {
    const plan = planClassPatch(body);
    check(`${label} → toggle`, plan.ok === true && plan.toggleArchived === true && Object.keys(plan.updates).length === 0 && plan.isArchived === undefined);
  }
}

// ---------------------------------------------------------------------------
console.log("Case 2: edit label — trim, dan hanya bidang terkirim yang berubah");
{
  const plan = planClassPatch({ name: "  XI TKJ B  " });
  check("nama di-trim", plan.ok === true && plan.updates.name === "XI TKJ B");
  check("bidang lain tidak ikut", plan.ok === true && plan.updates.subject === undefined && plan.updates.academicYear === undefined);
  check("edit label tidak menyentuh arsip", plan.ok === true && plan.toggleArchived === false && plan.isArchived === undefined);

  const combo = planClassPatch({ name: "X RPL", subject: "Informatika", academic_year: "2026/2027" });
  check("kombinasi tiga bidang", combo.ok === true && combo.updates.name === "X RPL" && combo.updates.subject === "Informatika" && combo.updates.academicYear === "2026/2027");

  const camel = planClassPatch({ academicYear: "2025/2026" });
  check("alias academicYear diterima", camel.ok === true && camel.updates.academicYear === "2025/2026");
}

// ---------------------------------------------------------------------------
console.log("Case 3: validasi menolak nilai buruk");
{
  const cases = [
    ["nama kosong", { name: "   " }],
    ["nama bukan string", { name: 12 }],
    ["nama 101 karakter", { name: "A".repeat(101) }],
    ["mapel kosong", { subject: "" }],
    ["mapel 101 karakter", { subject: "B".repeat(101) }],
    ["tahun kosong", { academic_year: " " }],
    ["tahun 21 karakter", { academic_year: "T".repeat(21) }],
    ["is_archived bukan boolean", { is_archived: "ya" }],
    ["hanya bidang tak dikenal", { warna: "biru" }],
    ["badan array", [1, 2]],
    ["badan string", "halo"],
    ["badan angka", 7],
  ];
  for (const [label, body] of cases) {
    const plan = planClassPatch(body);
    check(`${label} → ditolak`, plan.ok === false && typeof plan.message === "string" && plan.message.length > 0);
  }
  const batas = planClassPatch({ name: "A".repeat(100), academic_year: "12345678901234567890" });
  check("batas atas persis (100 / 20) diterima", batas.ok === true);
}

// ---------------------------------------------------------------------------
console.log("Case 4: is_archived eksplisit menetapkan nilai, bukan toggle");
{
  const on = planClassPatch({ is_archived: true });
  check("arsipkan eksplisit", on.ok === true && on.isArchived === true && on.toggleArchived === false);
  const off = planClassPatch({ is_archived: false });
  check("aktifkan eksplisit", off.ok === true && off.isArchived === false && off.toggleArchived === false);
  const mixed = planClassPatch({ name: "XI DPIB", is_archived: true });
  check("label + arsip sekaligus", mixed.ok === true && mixed.updates.name === "XI DPIB" && mixed.isArchived === true);
}

// ---------------------------------------------------------------------------
console.log("Case 5: penjaga sumber bebas lookbehind");
{
  const lib = read("./edit-kelas.ts");
  const routes = read("../routes/classes.ts");
  check("lib edit-kelas bebas lookbehind", !lib.includes("(?<"));
  check("rute classes bebas lookbehind", !routes.includes("(?<"));
}

// ---------------------------------------------------------------------------
console.log("Case 6: pengkabelan rute PATCH + regenerate");
{
  const routes = read("../routes/classes.ts");
  check("PATCH memakai perencana murni", routes.includes('planClassPatch(body)'));
  check("PATCH menjaga kepemilikan lewat findOwnedClass", routes.includes("findOwnedClass(classId, user.userId)"));
  check("PATCH menetapkan is_archived eksplisit", routes.includes("updates.isArchived = plan.isArchived"));
  check("PATCH mempertahankan toggle warisan", routes.includes("updates.isArchived = !kelas.isArchived"));
  check("PATCH mengembalikan payload kelas penuh", routes.includes("singleClassPayload(updated!)"));
  check("endpoint regenerate-code terdaftar", routes.includes('"/:id/regenerate-code"'));
  check("regenerate memakai generator yang sama dengan buat kelas", routes.includes("createJoinCode()"));
  check("regenerate memeriksa tabrakan kode", routes.includes("eq(classes.joinCode, candidate)"));
  check("regenerate menolak kode yang sama dengan kode lama", routes.includes("candidate === kelas.joinCode"));
  check("payload tunggal menyertakan anggota", routes.includes("members: memberRows.map"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
