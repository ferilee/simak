// Uji statis fitur LKPD Kelompok Tahap 3 mini (v1.0.31): jejak penulis per
// jawaban pada detail penilaian, lencana progres per kelompok di panel
// Kelompok, dan tombol Salin daftar kelompok. Uji unit penata teksnya ada
// di kelompok-copy.test.mjs. Jalankan:
//   bun apps/web/lib/lkpd-kelompok-3.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass += 1;
    console.log(`  PASS ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
  }
}

const guru = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

console.log("Kasus A: guru — jejak penulis per jawaban pada detail penilaian");
check("tipe butir membawa last_editor_name + answer_updated_at", guru.includes("last_editor_name: string | null") && guru.includes("answer_updated_at: string | null"));
check("baris Diubah terakhir oleh dirender", guru.includes("Diubah terakhir oleh {item.last_editor_name}"));
check("baris penulis hanya untuk attempt kelompok", guru.includes("attemptDetail.attempt.is_group && item.last_editor_name"));
check("waktu memakai formatDate aplikasi", guru.includes("formatDate(item.answer_updated_at)"));

console.log("Kasus B: guru — lencana progres per kelompok");
check("pemetaan groupProgressChip tersedia", guru.includes("function groupProgressChip("));
check("status null → Belum mulai", guru.includes('return { label: "Belum mulai", className: "group-progress group-progress-belum" }'));
check("status draf → Sedang dikerjakan", guru.includes('return { label: "Sedang dikerjakan", className: "group-progress group-progress-draf" }'));
check("status terkumpul → Terkumpul", guru.includes('return { label: "Terkumpul", className: "group-progress group-progress-terkumpul" }'));
check("status dinilai → Dinilai", guru.includes('return { label: "Dinilai", className: "group-progress group-progress-dinilai" }'));
check("lencana dirender dari attempt_status kelompok", guru.includes("groupProgressChip(group.attempt_status)"));
for (const cls of ["group-progress-belum", "group-progress-draf", "group-progress-terkumpul", "group-progress-dinilai"]) {
  check(`CSS .${cls} tersedia`, globalsCss.includes(`.${cls} {`));
}
check("palet mengikuti konvensi yang ada (amber terkumpul, hijau dinilai)", globalsCss.includes(".group-progress-terkumpul {\n  background: #fffaeb;\n  color: #b54708;") && globalsCss.includes(".group-progress-dinilai {\n  background: #ecfdf3;\n  color: #087a6f;"));

console.log("Kasus C: guru — Salin daftar kelompok");
check("mengimpor penata teks dari lib", guru.includes('import { groupsCopyText } from "../../lib/kelompok-copy";'));
check("tombol Salin daftar tersedia", guru.includes('"Salin daftar"'));
check("label berhasil Tersalin ✓", guru.includes("Tersalin ✓"));
check("tombol hanya tampil bila kelas punya kelompok", guru.includes("kelas.groups.length > 0 ? (") && guru.includes("copyClassGroupsList("));
check("penyalinan memakai Clipboard API + cadangan execCommand", guru.includes("navigator.clipboard.writeText") && guru.includes('document.execCommand("copy")'));
check("status tersalin diatur per kelas", guru.includes("copiedGroupClassId === kelas.class_id"));

console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
