// Uji statis fitur LKPD Kelompok Tahap 2 (v1.0.30): salin kelompok,
// keluarkan anggota, penilaian kontribusi antarteman, dan penyesuaian
// nilai individu. Jalankan:
//   bun apps/web/lib/lkpd-kelompok-2.test.mjs
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
const muridWorksheet = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
const muridAssignment = readFileSync(new URL("../app/murid/assignments/[id]/page.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

console.log("Kasus A: guru — salin kelompok dari penugasan lain");
check("tipe kelas membawa copy_sources", guru.includes("copy_sources: { assignment_id: number; title: string }[]"));
check("label Salin dari penugasan lain", guru.includes("Salin dari penugasan lain:"));
check("tombol Salin kelompok", guru.includes("Salin kelompok"));
check("memanggil endpoint copy", guru.includes("/groups/copy"));
check("konfirmasi ganti susunan saat menyalin di atas kelompok yang ada", guru.includes("Susunan kelompok saat ini akan diganti seluruhnya."));
check("salinan disembunyikan saat terkunci", guru.includes("kelas.groups.length === 0 || !kelas.shuffle_locked"));

console.log("Kasus B: guru — keluarkan anggota");
check("tipe kelompok membawa attempt_status", guru.includes('attempt_status: "draf" | "terkumpul" | "dinilai" | null'));
check("tombol × pada chip anggota", guru.includes('className="member-chip-remove"'));
check("CSS tombol keluarkan tersedia", globalsCss.includes(".member-chip-remove"));
check("pengeluaran memakai method DELETE ke endpoint members", guru.includes("method: \"DELETE\"") && guru.includes("/members/${member.id}"));
check("penjelasan kunci saat kelompok sudah mengumpulkan", guru.includes("Anggota tidak dapat dikeluarkan karena kelompoknya sudah mengumpulkan."));
check("konfirmasi menyebut jawaban tetap milik kelompok", guru.includes("Jawaban yang sudah ia buat tetap tersimpan sebagai milik kelompok."));

console.log("Kasus C: guru — kontribusi & penyesuaian nilai pada detail penilaian");
check("tipe anggota detail membawa ringkasan kontribusi + nilai", guru.includes("contribution_average?: number | null") && guru.includes("member_score?: number | null") && guru.includes("effective_score?: number | null"));
check("judul bagian Kontribusi & nilai anggota", guru.includes("Kontribusi & nilai anggota"));
check("kontribusi dinyatakan hanya informasi", guru.includes("tidak diterapkan otomatis ke nilai"));
check("anggota tanpa penilaian teman", guru.includes("Kontribusi: belum dinilai teman"));
check("format rata-rata kontribusi dari N penilai", guru.includes("penilai`"));
check("label Nilai akhir anggota", guru.includes("Nilai akhir:"));
check("tombol Sesuaikan", guru.includes("Sesuaikan"));
check("tombol Kembalikan ke nilai kelompok", guru.includes("Kembalikan ke nilai kelompok"));
check("menyimpan lewat endpoint member-scores", guru.includes("/grading/attempts/${attemptId}/member-scores"));

console.log("Kasus D: murid — kartu penilaian kontribusi");
check("judul kartu Nilai kontribusi teman", muridWorksheet.includes("Nilai kontribusi teman"));
check("catatan penilaian hanya dilihat guru", muridWorksheet.includes("Penilaianmu hanya dilihat guru."));
check("label skala lengkap", muridWorksheet.includes("\"Sangat kurang\"") && muridWorksheet.includes("\"Sangat baik\"") && muridWorksheet.includes("3 Cukup"));
check("memuat keadaan dari endpoint contribution-ratings", muridWorksheet.includes("contribution-ratings?assignmentId="));
check("menyimpan dengan PUT", muridWorksheet.includes("{ method: \"PUT\", body: JSON.stringify({ ratings }) }"));
check("kartu hanya tampil saat terkumpul", muridWorksheet.includes('status === "terkumpul" && contributionTeammates'));
check("tombol Simpan penilaian kontribusi", muridWorksheet.includes("Simpan penilaian"));

console.log("Kasus E: murid — nilai yang disesuaikan tampil terpisah dari nilai kelompok");
check("halaman LKPD: Nilai kelompok tetap tampil", muridWorksheet.includes("Nilai kelompok: {groupScore"));
check("halaman LKPD: baris Nilaimu (disesuaikan guru)", muridWorksheet.includes("Nilaimu (disesuaikan guru): {memberScore}"));
check("detail penugasan: Nilai kelompok + Nilaimu", muridAssignment.includes("Nilai kelompok:") && muridAssignment.includes("Nilaimu (disesuaikan guru):"));
check("tipe attempt detail membawa group_total_score + member_score", muridAssignment.includes("group_total_score?: number | null; member_score?: number | null"));

console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
