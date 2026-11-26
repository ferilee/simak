// Tests for perender Markdown materi TANPA lookbehind (components/markdown.ts).
// Run with bun from apps/web:  bun components/markdown-tanpa-lookbehind.test.mjs
//
// Yang dikunci di sini:
//  - Sumber markdown.ts TIDAK mengandung lookbehind (?<= / (?<! sama sekali:
//    JavaScriptCore Safari < 16.4 (iOS ≤ 16.3) menolaknya sebagai SyntaxError
//    saat berkas JS dimuat, sehingga halaman materi murid runtuh total
//    ("Application error: a client-side exception has occurred") di iPhone
//    lama — kasus Rafael Vandega, XI RPL, iOS 16.3.1, 26 Nov 2026. Teman
//    sekelasnya (Android/V8 dan iOS ≥ 16.4) tidak pernah terkena.
//  - Semantik penanda miring _..._ TIDAK berubah sesudah penulisan ulang
//    tanpa lookbehind (karakter pembatas ditangkap sebagai grup dan
//    dipancarkan kembali): miring di awal/tepi tanda baca tetap jadi <em>,
//    garis bawah di dalam kata (snake_case, angka Rp100_000) tetap polos.
//    Paritas terhadap implementasi lama juga dibuktikan uji diferensial
//    25 kasus saat perubahan dibuat (0 beda).
import { readFileSync } from "node:fs";
import { markdownToHtml } from "./markdown.ts";

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

// --- Penjaga sumber: tanpa lookbehind -----------------------------------------
const source = readFileSync(new URL("./markdown.ts", import.meta.url), "utf8");
check("markdown.ts bebas lookbehind (?<!", !source.includes("(?<!"));
check("markdown.ts bebas lookbehind (?<=", !source.includes("(?<="));

// --- Semantik miring garis bawah ----------------------------------------------
check(
  "miring di awal teks",
  markdownToHtml("_miring_ di awal") === "<p><em>miring</em> di awal</p>",
  markdownToHtml("_miring_ di awal"),
);
check(
  "miring di tengah kalimat",
  markdownToHtml("kata _miring_ di tengah kalimat") === "<p>kata <em>miring</em> di tengah kalimat</p>",
  markdownToHtml("kata _miring_ di tengah kalimat"),
);
check(
  "miring sesudah kurung buka",
  markdownToHtml("tanda (_miring_) dalam kurung") === "<p>tanda (<em>miring</em>) dalam kurung</p>",
  markdownToHtml("tanda (_miring_) dalam kurung"),
);
check(
  "miring di awal baris kedua",
  markdownToHtml("baris satu\n_miring_ awal baris kedua") === "<p>baris satu<br><em>miring</em> awal baris kedua</p>",
  markdownToHtml("baris satu\n_miring_ awal baris kedua"),
);
check(
  "dua miring berurutan",
  markdownToHtml("_satu_ _dua_ berurutan") === "<p><em>satu</em> <em>dua</em> berurutan</p>",
  markdownToHtml("_satu_ _dua_ berurutan"),
);
check(
  "snake_case tetap polos",
  markdownToHtml("snake_case_name tetap polos") === "<p>snake_case_name tetap polos</p>",
  markdownToHtml("snake_case_name tetap polos"),
);
check(
  "garis bawah di dalam kata & angka tetap polos",
  markdownToHtml("a_b_c dan Rp100_000") === "<p>a_b_c dan Rp100_000</p>",
  markdownToHtml("a_b_c dan Rp100_000"),
);
check(
  "tebal bintang tetap bekerja di samping miring",
  markdownToHtml("**tebal** dan _miring_ bersama") === "<p><strong>tebal</strong> dan <em>miring</em> bersama</p>",
  markdownToHtml("**tebal** dan _miring_ bersama"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
