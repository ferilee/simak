// Uji statis fitur Sasaran Siswa Tertentu (v1.0.32): form penugasan guru
// menyediakan pemilih sasaran (kelas / siswa tertentu) dengan pemilih murid
// berkelompok per kelas, dan daftar penugasan menampilkan lencana + garis
// sasaran siswa. Halaman murid TIDAK berubah tampilannya. Jalankan:
//   bun apps/web/lib/sasaran-siswa.test.mjs
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
const muridHome = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
const muridAssignment = readFileSync(new URL("../app/murid/assignments/[id]/page.tsx", import.meta.url), "utf8");

console.log("Kasus A: form penugasan guru — pemilih sasaran");
check("label Sasaran penugasan", guru.includes("Sasaran penugasan"));
check("opsi Kelas", guru.includes("Kelas — semua anggota kelas tujuan"));
check("opsi Siswa tertentu", guru.includes("Siswa tertentu — pilih murid satu per satu (remedial/pengayaan)"));
check("catatan mode individu untuk sasaran siswa", guru.includes("Sasaran siswa tertentu hanya tersedia untuk mode individu."));
check("opsi Kelompok nonaktif saat sasaran siswa", guru.includes('disabled={assignmentTargetType === "siswa"}'));
check("beralih sasaran mengosongkan daftar lain + memaksa individu", guru.includes("function changeAssignmentTargetType") && guru.includes('setAssignmentWorkMode("individu")') && guru.includes("setAssignmentClassIds([])") && guru.includes("setAssignmentStudentIds([])"));

console.log("Kasus B: pemilih murid sasaran");
check("label Murid sasaran", guru.includes("Murid sasaran"));
check("kotak cari nama/username", guru.includes('placeholder="Cari nama atau username murid"'));
check("baris jumlah murid dipilih", guru.includes("{assignmentStudentIds.length} murid dipilih"));
check("tombol pilih semua per kelas", guru.includes("— pilih semua"));
check("anggota dirender dari data kelas", guru.includes("kelas.members ?? []") && guru.includes("{member.name} · @{member.username}"));
check("chip murid terpilih dapat dihapus", guru.includes("dari sasaran") && guru.includes("assignmentStudentInfoById.get(studentId)"));
check("payload buat+edit + snapshot membawa targetType", guru.split("targetType: assignmentTargetType,").length - 1 === 3);
check("payload buat+bawa studentIds bersyarat", guru.split('studentIds: assignmentTargetType === "siswa" ? assignmentStudentIds : undefined').length - 1 === 2);
check("payload buat+bawa classIds bersyarat", guru.split('classIds: assignmentTargetType === "kelas" ? assignmentClassIds : undefined').length - 1 === 2);
check("validasi formulir per jenis sasaran", guru.includes('"Pilih modul, LKPD, dan minimal satu murid sasaran."'));
check("edit memulihkan jenis sasaran + murid", guru.includes("setAssignmentTargetType(assignment.target_type)") && guru.includes("setAssignmentStudentIds(assignment.students.map((student) => student.id))"));
check("snapshot edit memulihkan sasaran", guru.includes("targetType: assignmentTargetType,") && guru.includes("setAssignmentTargetType(snapshot.targetType)") && guru.includes("setAssignmentStudentIds(snapshot.studentIds)"));

console.log("Kasus C: daftar penugasan (Langkah 4) + rekap (Langkah 5)");
check("garis sasaran siswa di kedua daftar", guru.split('`${assignment.students.length} siswa tertentu`').length - 1 === 2);
check("lencana Siswa tertentu di kedua daftar", guru.split('<span className="group-mode-badge">Siswa tertentu</span>').length - 1 === 2);
check("garis kelas lama dipertahankan", guru.includes('assignment.classes.map((kelas) => kelas.name).join(", ") || "Tanpa kelas"'));
check("tipe penugasan memuat target_type + students", guru.includes('target_type: "kelas" | "siswa"') && guru.includes("students: { id: number; name: string; username: string; class_name: string }[]"));
check("tipe kelas memuat members", guru.includes("members: ClassMemberSummary[]"));

console.log("Kasus D: murid — tanpa label/visual baru");
check("beranda murid tanpa label Sasaran/Siswa tertentu", !muridHome.includes("Siswa tertentu"));
check("detail penugasan murid tanpa label Sasaran/Siswa tertentu", !muridAssignment.includes("Siswa tertentu"));

console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
