// Tests for the browser-side WebP conversion helper (v1.0.21).
// Run with bun from apps/web:  bun lib/prepare-image.test.mjs
//
// Canvas cannot run under bun (no document/createImageBitmap pipeline), so
// these tests cover only the PURE logic: the conversion gate, the result
// acceptance predicate, the converted file name, and the never-throws
// passthrough guarantee of prepareImageForUpload outside a browser.
import {
  acceptConvertedImage,
  prepareImageForUpload,
  shouldConvertImage,
  webpFileName,
} from "./prepare-image.ts";

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

// Case 1: gerbang konversi shouldConvertImage.
console.log("Case 1: shouldConvertImage");
check("jpeg dikonversi", shouldConvertImage({ type: "image/jpeg" }) === true);
check("png dikonversi", shouldConvertImage({ type: "image/png" }) === true);
check("webp tidak dikonversi ulang", shouldConvertImage({ type: "image/webp" }) === false);
check("pdf tidak dikonversi", shouldConvertImage({ type: "application/pdf" }) === false);
check("gif tidak dikonversi", shouldConvertImage({ type: "image/gif" }) === false);
check("tipe kosong tidak dikonversi", shouldConvertImage({ type: "" }) === false);

// Case 2: predikat penerimaan hasil encode.
console.log("Case 2: acceptConvertedImage");
check("blob null ditolak", acceptConvertedImage(null, 1000) === false);
check("tipe bukan webp ditolak", acceptConvertedImage({ type: "image/png", size: 500 }, 1000) === false);
check("ukuran 0 ditolak", acceptConvertedImage({ type: "image/webp", size: 0 }, 1000) === false);
check("lebih besar dari asal ditolak", acceptConvertedImage({ type: "image/webp", size: 1500 }, 1000) === false);
check("sama besar dengan asal ditolak", acceptConvertedImage({ type: "image/webp", size: 1000 }, 1000) === false);
check("webp lebih kecil diterima", acceptConvertedImage({ type: "image/webp", size: 400 }, 1000) === true);

// Case 3: nama berkas hasil konversi.
console.log("Case 3: webpFileName");
check("foto.jpg → foto.webp", webpFileName("foto.jpg") === "foto.webp");
check("gambar.akhir.png → gambar.akhir.webp", webpFileName("gambar.akhir.png") === "gambar.akhir.webp");
check("tanpa ekstensi → +.webp", webpFileName("foto-kamera") === "foto-kamera.webp");

// Case 4: prepareImageForUpload — passthrough dan jaminan tidak pernah throw.
// Di luar browser jalur canvas tidak tersedia, jadi JPG pun harus kembali
// sebagai berkas asal (bukan error) di lingkungan ini.
console.log("Case 4: prepareImageForUpload passthrough");
const pdf = new File(["%PDF-1.4 contoh"], "lampiran.pdf", { type: "application/pdf" });
check("pdf dikembalikan apa adanya", (await prepareImageForUpload(pdf)) === pdf);
const webp = new File([new Uint8Array([1, 2, 3])], "sudah.webp", { type: "image/webp" });
check("webp dikembalikan apa adanya", (await prepareImageForUpload(webp)) === webp);
const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "foto.jpg", { type: "image/jpeg" });
let jpegResult = null;
let jpegThrew = false;
try {
  jpegResult = await prepareImageForUpload(jpeg);
} catch {
  jpegThrew = true;
}
check("jpeg tidak pernah throw", !jpegThrew);
check(
  "jpeg menghasilkan File (asal di luar browser, atau webp hasil konversi)",
  jpegResult instanceof File && (jpegResult === jpeg || jpegResult.type === "image/webp"),
  jpegResult ? `${jpegResult.name}/${jpegResult.type}` : "null",
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
