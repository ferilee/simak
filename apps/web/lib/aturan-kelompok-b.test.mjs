// Uji statis "Aturan B" pada panel Kelompok guru: lencana Terkunci per
// kelompok, garis petunjuk pembentukan ulang sebagian, keadaan tombol
// Acak ulang mengikuti shuffle_locked definisi baru, dan konfirmasi
// hasil shuffle dari shuffle_result. Jalankan:
//   bun apps/web/lib/aturan-kelompok-b.test.mjs
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

console.log("Kasus A: tipe data panel membawa kunci per kelompok + hasil shuffle");
check("tipe kelompok membawa locked: boolean", guru.includes("attempt_status: \"draf\" | \"terkumpul\" | \"dinilai\" | null; locked: boolean"));
check("tipe data panel membawa shuffle_result opsional", guru.includes("shuffle_result?: { preserved: number; formed: number; pooled_students: number }"));

console.log("Kasus B: kartu kelompok menampilkan lencana Terkunci");
check("lencana dirender hanya untuk kelompok terkunci", guru.includes("{group.locked ? <span className=\"group-locked-chip\">🔒 Terkunci</span> : null}"));
check("CSS lencana Terkunci tersedia", globalsCss.includes(".group-locked-chip"));

console.log("Kasus C: tombol Acak ulang + penjelasan keadaan");
check("tombol diganti teks bila shuffle_locked (definisi baru: pembentukan ulang noop)", guru.includes("kelas.shuffle_locked ? (") && guru.includes("Semua kelompok sudah terkunci dan tidak ada murid yang belum berkelompok."));
check("teks kunci lama tidak lagi dipakai", !guru.includes("Acak ulang terkunci — sudah ada kelompok yang mulai mengerjakan."));
check("garis petunjuk tampil bila ada kelompok terkunci tetapi shuffle masih mungkin", guru.includes("!kelas.shuffle_locked && kelas.groups.some((group) => group.locked)"));
check("isi garis petunjuk persis", guru.includes("Kelompok yang sudah penuh atau sudah mulai mengerjakan tidak ikut diacak ulang."));

console.log("Kasus D: konfirmasi hasil shuffle dari shuffle_result");
check("pesan sukses memakai ringkasan preserved/formed", guru.includes("${shuffleResult.preserved} kelompok dipertahankan, ${shuffleResult.formed} kelompok dibentuk."));
check("pesan lama tetap menjadi cadangan bila shuffle_result absen", guru.includes("Kelompok kelas ${className} diacak ulang."));

console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
