// Tests for the "Salin daftar kelompok" plain-text formatter (Tahap 3 mini).
// Run with bun from apps/web:  bun lib/kelompok-copy.test.mjs
import { groupsCopyText } from "./kelompok-copy.ts";

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

console.log("Case 1: susunan lengkap dengan murid belum berkelompok");
{
  const text = groupsCopyText({
    assignmentTitle: "Matematika Keuangan · XI DPIB",
    className: "XI DPIB",
    groups: [
      { name: "Kelompok 1", members: ["Ani", "Budi", "Citra"] },
      { name: "Kelompok 2", members: ["Dodi", "Eka"] },
    ],
    ungrouped: ["Fajar"],
  });
  const expected = [
    "Kelompok Matematika Keuangan · XI DPIB — XI DPIB",
    "",
    "Kelompok 1: Ani, Budi, Citra",
    "Kelompok 2: Dodi, Eka",
    "",
    "Belum berkelompok: Fajar",
  ].join("\n");
  check("teks persis seperti format yang disepakati", text === expected, JSON.stringify(text));
}

console.log("Case 2: tanpa murid belum berkelompok — bagian itu hilang seluruhnya");
{
  const text = groupsCopyText({
    assignmentTitle: "Tugas A",
    className: "X TKJ A",
    groups: [{ name: "Kelompok 1", members: ["Ani", "Budi"] }],
    ungrouped: [],
  });
  check("tidak ada baris Belum berkelompok", !text.includes("Belum berkelompok"));
  check("tidak ada baris kosong menggantung di akhir", !text.endsWith("\n") && !text.endsWith("\n\n"));
  check("isi tetap lengkap", text === "Kelompok Tugas A — X TKJ A\n\nKelompok 1: Ani, Budi", JSON.stringify(text));
}

console.log("Case 3: kelas tanpa kelompok sama sekali");
{
  const onlyUngrouped = groupsCopyText({
    assignmentTitle: "Tugas B",
    className: "X TKJ B",
    groups: [],
    ungrouped: ["Ani", "Budi"],
  });
  check(
    "tanpa kelompok → judul + daftar belum berkelompok saja (satu baris kosong pemisah)",
    onlyUngrouped === "Kelompok Tugas B — X TKJ B\n\nBelum berkelompok: Ani, Budi",
    JSON.stringify(onlyUngrouped),
  );
  const empty = groupsCopyText({ assignmentTitle: "Tugas B", className: "X TKJ B", groups: [], ungrouped: [] });
  check("tanpa kelompok dan tanpa murid → hanya judul", empty === "Kelompok Tugas B — X TKJ B", JSON.stringify(empty));
}

console.log("Case 4: nama kelompok memakai nama tersimpan apa adanya");
{
  const text = groupsCopyText({
    assignmentTitle: "Proyek",
    className: "XI RPL",
    groups: [{ name: "Kelompok Melati", members: ["Sari"] }],
    ungrouped: [],
  });
  check("nama kelompok tidak dinomori ulang", text.includes("Kelompok Melati: Sari"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
