// Tests for the Step-5 helpers: integrity filters/order and Rekap search.
// Run with bun from apps/web:  bun lib/hasil-helpers.test.mjs
import {
  distinctIntegrityAssignments,
  filterAssignmentsByQuery,
  filterIntegrityAlerts,
  integrityRiskRank,
  sortIntegrityAlerts,
} from "./hasil-helpers.ts";

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

// Urutan API: menurut kejadian terbaru saja (bukan tingkat risiko).
const alerts = [
  { assignment_id: 2, assignment_title: "Tugas Bunga Majemuk", student_name: "Citra Lestari", username: "citra_xi", total_events: 2, risk: "info", last_event: "2026-11-02T09:00:00Z" },
  { assignment_id: 1, assignment_title: "Tugas Bunga Tunggal", student_name: "Andi Pratama", username: "andi_xi", total_events: 4, risk: "perlu_ditinjau", last_event: "2026-11-02T08:00:00Z" },
  { assignment_id: 1, assignment_title: "Tugas Bunga Tunggal", student_name: "Budi Santoso", username: "budi_xi", total_events: 8, risk: "peringatan", last_event: "2026-11-02T07:00:00Z" },
  { assignment_id: 2, assignment_title: "Tugas Bunga Majemuk", student_name: "Dewi Anggraini", username: "dewi_xi", total_events: 12, risk: "peringatan", last_event: "2026-11-02T06:00:00Z" },
  { assignment_id: 1, assignment_title: "Tugas Bunga Tunggal", student_name: "Eko Wijaya", username: "eko_xi", total_events: 3, risk: "perlu_ditinjau", last_event: "2026-11-02T10:00:00Z" },
];

console.log("Case 1: peringkat dan urutan tingkat risiko");
check("peringatan < perlu_ditinjau < info", integrityRiskRank("peringatan") === 0 && integrityRiskRank("perlu_ditinjau") === 1 && integrityRiskRank("info") === 2);
check("risiko tak dikenal jatuh ke peringkat terbawah", integrityRiskRank("aneh") === 2);
const sortedAlerts = sortIntegrityAlerts(alerts);
check(
  "urutan: peringatan (kejadian terbanyak dulu), lalu perlu ditinjau, lalu info",
  JSON.stringify(sortedAlerts.map((a) => a.username)) === JSON.stringify(["dewi_xi", "budi_xi", "andi_xi", "eko_xi", "citra_xi"]),
  JSON.stringify(sortedAlerts.map((a) => a.username)),
);
check("array asal tidak berubah", alerts[0].username === "citra_xi");

console.log("Case 2: opsi penugasan dari indikasi");
const assignmentOptions = distinctIntegrityAssignments(alerts);
check(
  "penugasan berbeda terurut judul",
  JSON.stringify(assignmentOptions.map((option) => option.id)) === JSON.stringify([2, 1]),
  JSON.stringify(assignmentOptions),
);
check("daftar kosong menghasilkan opsi kosong", distinctIntegrityAssignments([]).length === 0);

console.log("Case 3: saringan indikasi (penugasan, risiko, pencarian)");
const noFilter = { assignmentId: "semua", risk: "semua", query: "" };
check("tanpa saringan semua lolos", filterIntegrityAlerts(alerts, noFilter).length === 5);
check(
  "saring penugasan 1 menyisakan attempt penugasan itu",
  JSON.stringify(filterIntegrityAlerts(alerts, { ...noFilter, assignmentId: 1 }).map((a) => a.username)) === JSON.stringify(["andi_xi", "budi_xi", "eko_xi"]),
);
check(
  "chip peringatan hanya mengambil risiko peringatan",
  JSON.stringify(filterIntegrityAlerts(alerts, { ...noFilter, risk: "peringatan" }).map((a) => a.username)) === JSON.stringify(["budi_xi", "dewi_xi"]),
);
check(
  "chip perlu_ditinjau hanya mengambil risiko itu",
  filterIntegrityAlerts(alerts, { ...noFilter, risk: "perlu_ditinjau" }).every((a) => a.risk === "perlu_ditinjau"),
);
check("pencarian cocok pada nama (abaikan huruf besar/kecil)", filterIntegrityAlerts(alerts, { ...noFilter, query: "SANTOSO" }).map((a) => a.username).join() === "budi_xi");
check("pencarian cocok pada username", filterIntegrityAlerts(alerts, { ...noFilter, query: "dewi_" }).map((a) => a.username).join() === "dewi_xi");
check("pencarian dengan spasi tepi tetap bekerja", filterIntegrityAlerts(alerts, { ...noFilter, query: "  andi  " }).length === 1);
check(
  "gabungan penugasan + risiko + pencarian",
  JSON.stringify(filterIntegrityAlerts(alerts, { assignmentId: 1, risk: "perlu_ditinjau", query: "eko" }).map((a) => a.username)) === JSON.stringify(["eko_xi"]),
);
check("tidak ada yang cocok menghasilkan daftar kosong", filterIntegrityAlerts(alerts, { ...noFilter, query: "zzz" }).length === 0);

console.log("Case 4: pencarian Rekap penugasan (judul dan nama kelas)");
const assignments = [
  { id: 1, title: "Matematika Keuangan · XI DPIB", classes: [{ name: "XI DPIB" }] },
  { id: 2, title: "Tugas SPtLDV", classes: [{ name: "X TKJ A" }, { name: "X TKJ B" }] },
  { id: 3, title: "Latihan KKA", classes: [{ name: "X KKKR" }] },
];
check("pencarian kosong mengembalikan semua (array yang sama)", filterAssignmentsByQuery(assignments, "") === assignments);
check("pencarian spasi saja mengembalikan semua", filterAssignmentsByQuery(assignments, "   ").length === 3);
check("cocok pada judul", JSON.stringify(filterAssignmentsByQuery(assignments, "sptldv").map((a) => a.id)) === JSON.stringify([2]));
check("cocok pada nama kelas", JSON.stringify(filterAssignmentsByQuery(assignments, "KKKR").map((a) => a.id)) === JSON.stringify([3]));
check("cocok pada salah satu dari banyak kelas", JSON.stringify(filterAssignmentsByQuery(assignments, "tkj b").map((a) => a.id)) === JSON.stringify([2]));
check("substring umum menangkap beberapa", JSON.stringify(filterAssignmentsByQuery(assignments, "XI").map((a) => a.id)) === JSON.stringify([1]));
check("tidak cocok menghasilkan daftar kosong", filterAssignmentsByQuery(assignments, "biologi").length === 0);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
