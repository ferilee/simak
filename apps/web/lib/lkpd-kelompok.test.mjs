// Uji statis fitur LKPD Kelompok (v1.0.29): halaman guru menyediakan mode
// pengerjaan + panel kelompok, halaman murid meneruskan konteks penugasan
// ke endpoint attempt dan menampilkan keadaan kelompok. Jalankan:
//   bun apps/web/lib/lkpd-kelompok.test.mjs
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
const muridWorksheet = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");

console.log("Kasus A: form penugasan guru — mode + ukuran kelompok");
check("label Mode pengerjaan LKPD", guru.includes("Mode pengerjaan LKPD"));
check("opsi Individu", guru.includes("Individu — setiap murid mengerjakan sendiri"));
check("opsi Kelompok", guru.includes("Kelompok — satu LKPD dikerjakan bersama"));
check("input Anggota per kelompok", guru.includes("Anggota per kelompok"));
check("payload create membawa workMode", guru.includes("workMode: assignmentWorkMode"));
check("payload create+edit membawa workMode + groupSize", guru.split('groupSize: assignmentWorkMode === "kelompok" ? Number(assignmentGroupSize) || 4 : undefined').length - 1 === 2);
check("snapshot edit memulihkan mode + ukuran", guru.includes("workMode: assignmentWorkMode,") && guru.includes("setAssignmentGroupSize(snapshot.groupSize)"));
check("catatan kunci mode pada penugasan terbit", guru.includes("Mode pengerjaan dan ukuran kelompok juga terkunci"));

console.log("Kasus B: daftar penugasan + panel kelompok guru");
check("lencana Kelompok pada baris penugasan", guru.includes('👥 Kelompok · {assignment.group_size ?? 4} orang'));
check("tombol Kelompok hanya untuk mode kelompok", guru.includes('assignment.work_mode === "kelompok" ? <button type="button" onClick={() => toggleGroupsPanel(assignment)}'));
check("panel Kelompok penugasan", guru.includes("Kelompok penugasan"));
check("memuat GET groups", guru.includes("/groups`);") || guru.includes("/groups`"));
check("tombol Bentuk kelompok memanggil generate", guru.includes("/groups/generate") && guru.includes("Bentuk kelompok"));
check("tombol Acak ulang memanggil shuffle", guru.includes("/groups/shuffle") && guru.includes("Acak ulang"));
check("keadaan terkunci dijelaskan", guru.includes("Acak ulang terkunci — sudah ada kelompok yang mulai mengerjakan."));
check("daftar belum berkelompok + tombol Tambah", guru.includes("Belum berkelompok") && guru.includes("Tambah"));
check("tambah anggota memanggil endpoint members", guru.includes("/members`"));

console.log("Kasus C: penilaian guru menampilkan pengumpulan kelompok");
check("tipe attempt membawa is_group + member_names", guru.includes("is_group?: boolean") && guru.includes("member_names?: string[]"));
check("baris penilaian kelompok", guru.includes("👥 Kelompok · {attempt.status}"));
check("detail penilaian menyebut anggota", guru.includes("Pengumpulan kelompok") && guru.includes("Anggota:"));

console.log("Kasus D: murid — konteks penugasan diteruskan ke attempt");
check("GET attempt membawa assignmentId", muridWorksheet.includes("/attempt${attemptQuery}"));
check("PUT answers membawa assignmentId", muridWorksheet.includes("/answers${attemptQuery}") || muridWorksheet.includes("/answers${assignmentId ?"));
check("POST submit membawa konteks", muridWorksheet.includes("/submit${attemptQuery}"));
check("keadaan belum berkelompok persis", muridWorksheet.includes("Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu."));
check("kartu kepala kelompok", muridWorksheet.includes("{groupInfo.name} · {groupInfo.class_name}"));
check("penanda diubah terakhir", muridWorksheet.includes("Terakhir diubah oleh"));
check("tombol kumpulkan atas nama kelompok", muridWorksheet.includes("Kumpulkan atas nama kelompok"));
check("kartu nilai kelompok", muridWorksheet.includes("Nilai kelompok:"));

console.log("Kasus E: murid — lencana kelompok di beranda + detail penugasan");
check("beranda: lencana Kelompok + nama kelompok", muridHome.includes("👥 Kelompok{assignment.group ?"));
check("detail: kartu kelompok + anggota", muridAssignment.includes("Penugasan ini dikerjakan berkelompok") && muridAssignment.includes("Anggota:"));
check("detail: keadaan belum berkelompok", muridAssignment.includes("Kamu belum masuk kelompok untuk penugasan ini. Hubungi gurumu."));

console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
