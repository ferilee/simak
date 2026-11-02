// Tests for the student-class resolution rule (Pengumpulan LKPD class filter).
// Run with bun from apps/api:  bun src/lib/student-class.test.mjs
//
// Rule (deterministic, no schema change): among the teacher's non-archived
// classes where the student is a member, prefer the class whose subject
// matches the worksheet's module subject; ties and fallbacks resolve to the
// lowest class id; no membership → null ("Tanpa kelas").
import { resolveStudentClass } from "./student-class.ts";

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

const member = (classId, className, classSubject) => ({ studentId: 1, classId, className, classSubject });

console.log("Case 1: tanpa keanggotaan");
check("daftar kosong menghasilkan null", resolveStudentClass([], "Matematika") === null);
check("daftar kosong + tanpa mapel menghasilkan null", resolveStudentClass([], null) === null);

console.log("Case 2: satu keanggotaan");
const single = [member(7, "XI TKJ A", "Matematika")];
check("satu-satunya kelas dipakai walau mapel cocok", resolveStudentClass(single, "Matematika")?.id === 7);
check("satu-satunya kelas dipakai walau mapel beda", resolveStudentClass(single, "KKA")?.id === 7);
check("satu-satunya kelas dipakai walau tanpa mapel", resolveStudentClass(single, null)?.id === 7);
check("nama kelas ikut terbawa", resolveStudentClass(single, "Matematika")?.name === "XI TKJ A");

console.log("Case 3: preferensi mapel di antara banyak keanggotaan");
const mixed = [
  member(3, "X KKA 1", "KKA"),
  member(9, "XI RPL B", "Matematika"),
  member(5, "XI TKJ A", "Matematika"),
];
check("tepat satu cocok → yang cocok", resolveStudentClass([member(3, "X KKA 1", "KKA"), member(9, "XI RPL B", "Matematika")], "Matematika")?.id === 9);
check("beberapa cocok → id terkecil di antara yang cocok", resolveStudentClass(mixed, "Matematika")?.id === 5, JSON.stringify(resolveStudentClass(mixed, "Matematika")));
check("tidak ada yang cocok → id terkecil keseluruhan", resolveStudentClass(mixed, "Biologi")?.id === 3);
check("tanpa mapel → id terkecil keseluruhan", resolveStudentClass(mixed, null)?.id === 3);
check("urutan masukan tidak memengaruhi hasil", resolveStudentClass([...mixed].reverse(), "Matematika")?.id === 5);
check("array asal tidak berubah", mixed.map((m) => m.classId).join(",") === "3,9,5");

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
