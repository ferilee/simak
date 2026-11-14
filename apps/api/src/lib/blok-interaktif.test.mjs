// Tests for blok Media Interaktif (H5P v1, calon v1.0.62): jenis blok
// "interaktif" dengan dua sumber — berkas HTML mandiri ekspor Lumi yang
// diunggah guru, atau tautan embed https pemain H5P/Moodle. Run with
// bun from apps/api:  bun src/lib/blok-interaktif.test.mjs
//
// Yang dikunci di sini:
//  - Skema bersama: MODULE_BLOCK_TYPES memuat "interaktif"; validasi
//    content kedua mode + penolakan (http, tanpa fileKey, tanpa url,
//    sumber asing, title kepanjangan).
//  - Skema presign khusus interaktif: batas NYATA 25 MB (di atas batas
//    presign umum 10 MB), contentType hanya text/html, nama berkas
//    hanya .html/.htm.
//  - Pemeriksa isi ringan looksLikeHtmlHead: menerima doctype/<html
//    (BOM, spasi awal, huruf besar), menolak PDF/JSON/teks/kosong.
//  - Penghitung kata gerbang baca: blok interaktif HANYA menyumbang
//    kata keterangannya (title); nama berkas/URL tidak dihitung.
//  - Wiring penyajian aman di routes/uploads: route /presign-interaktif
//    dan /interaktif, awalan kunci interaktif/, header CSP
//    "sandbox allow-scripts" + nosniff + content-type text/html,
//    pemeriksaan isi saat sajian, dan penjaga /download yang menolak
//    kunci interaktif (jalan memintas URL bertanda tangan ditutup).
//  - Wiring modules: kunci lampiran blok interaktif diturunkan dari
//    fileKey isi pada create + patch.
//  - Migrasi 0018: tipe module_blocks adalah enum MySQL sehingga nilai
//    "interaktif" ditambahkan lewat SATU pernyataan MODIFY; jurnal 19.
import { readFileSync } from "node:fs";
import {
  MODULE_BLOCK_TYPES,
  moduleBlockContentSchema,
  presignInteraktifUploadSchema,
  presignUploadSchema,
} from "@simak/shared";
import { INTERAKTIF_MAX_SIZE_BYTES, isInteraktifKey, looksLikeHtmlHead } from "./interaktif.ts";
import { countMaterialWords } from "./baca-wajar.ts";

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

const parse = (value) => moduleBlockContentSchema.safeParse(value);

// --- Skema content -----------------------------------------------------------
check("MODULE_BLOCK_TYPES memuat interaktif sebagai tipe keenam", MODULE_BLOCK_TYPES.includes("interaktif") && MODULE_BLOCK_TYPES.length === 6);
check(
  "mode unggah sah: fileKey + fileName + title",
  parse({ type: "interaktif", source: "unggah", fileKey: "interaktif/7/3/abc.html", fileName: "kuis.html", title: "Latihan pecahan" }).success,
);
check("mode unggah tanpa fileName tetap sah", parse({ type: "interaktif", source: "unggah", fileKey: "interaktif/7/3/abc.html" }).success);
check("mode unggah TANPA fileKey ditolak", !parse({ type: "interaktif", source: "unggah", fileName: "kuis.html" }).success);
check("mode embed sah: url https", parse({ type: "interaktif", source: "embed", url: "https://moodle.sekolah.id/mod/hvp/view.php?id=12" }).success);
check("mode embed TANPA url ditolak", !parse({ type: "interaktif", source: "embed" }).success);
check("mode embed url http DITOLAK", !parse({ type: "interaktif", source: "embed", url: "http://h5p.org/content/1" }).success);
check("mode embed url bukan URL ditolak", !parse({ type: "interaktif", source: "embed", url: "bukan-url" }).success);
check("sumber asing ditolak", !parse({ type: "interaktif", source: "tautan", url: "https://h5p.org/x" }).success);
check("title tepat 500 huruf sah", parse({ type: "interaktif", source: "embed", url: "https://h5p.org/x", title: "a".repeat(500) }).success);
check("title 501 huruf ditolak", !parse({ type: "interaktif", source: "embed", url: "https://h5p.org/x", title: "a".repeat(501) }).success);
check("blok lain tidak ikut aturan interaktif (teks tetap sah)", parse({ type: "teks", html: "<p>Halo</p>" }).success);

// --- Skema presign khusus -----------------------------------------------------
const presign = (value) => presignInteraktifUploadSchema.safeParse(value);
check("batas unggahan interaktif NYATA 25 MB", INTERAKTIF_MAX_SIZE_BYTES === 25 * 1024 * 1024);
check(
  "batas presign umum tetap 10 MB (kontras: khusus interaktif lebih longgar)",
  !presignUploadSchema.safeParse({ moduleId: 1, filename: "a.html", contentType: "text/html", size: 11 * 1024 * 1024 }).success,
);
check("presign interaktif: tepat 25 MB diterima", presign({ moduleId: 3, filename: "kuis.html", contentType: "text/html", size: 25 * 1024 * 1024 }).success);
check("presign interaktif: 25 MB + 1 byte ditolak", !presign({ moduleId: 3, filename: "kuis.html", contentType: "text/html", size: 25 * 1024 * 1024 + 1 }).success);
check("presign interaktif: ekstensi .htm diterima", presign({ moduleId: 3, filename: "kuis.htm", contentType: "text/html", size: 10 }).success);
check("presign interaktif: ekstensi .HTML huruf besar diterima", presign({ moduleId: 3, filename: "KUIS.HTML", contentType: "text/html", size: 10 }).success);
check("presign interaktif: berkas .txt ditolak", !presign({ moduleId: 3, filename: "kuis.txt", contentType: "text/html", size: 10 }).success);
check("presign interaktif: berkas .pdf ditolak", !presign({ moduleId: 3, filename: "kuis.pdf", contentType: "text/html", size: 10 }).success);
check("presign interaktif: contentType bukan text/html ditolak", !presign({ moduleId: 3, filename: "kuis.html", contentType: "application/pdf", size: 10 }).success);
check("presign interaktif: ukuran 0 ditolak", !presign({ moduleId: 3, filename: "kuis.html", contentType: "text/html", size: 0 }).success);

// --- Pemeriksa isi ringan -------------------------------------------------------
const enc = new TextEncoder();
check("doctype html diterima", looksLikeHtmlHead(enc.encode("<!DOCTYPE html><html><body>x</body></html>")));
check("doctype huruf besar diterima", looksLikeHtmlHead(enc.encode("<!DOCTYPE HTML><html>")));
check("<html langsung diterima", looksLikeHtmlHead(enc.encode("<html lang=\"id\"><head></head>")));
check("BOM UTF-8 + spasi awal diterima", looksLikeHtmlHead(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode("  \n<html>")])));
check("berkas PDF ditolak", !looksLikeHtmlHead(enc.encode("%PDF-1.7 bukan html")));
check("berkas JSON ditolak", !looksLikeHtmlHead(enc.encode("{\"bukan\": \"html\"}")));
check("teks biasa ditolak", !looksLikeHtmlHead(enc.encode("halo dunia, ini bukan html")));
check("berkas kosong ditolak", !looksLikeHtmlHead(new Uint8Array(0)));

// --- Awalan kunci -----------------------------------------------------------------
check("kunci di bawah awalan interaktif dikenali", isInteraktifKey("interaktif/7/3/abc.html"));
check("kunci lampiran biasa BUKAN interaktif", !isInteraktifKey("modules/7/3/abc.pdf"));
check("kunci mirip awalan tanpa garis miring ditolak", !isInteraktifKey("interaktifx/7/3/abc.html"));

// --- Penghitung kata: keterangan saja ----------------------------------------------
const words = (contents) => countMaterialWords(contents.map((content) => ({ type: "interaktif", content })));
check(
  "interaktif menyumbang HANYA kata title (3), bukan fileName/url",
  words([{ type: "interaktif", source: "unggah", title: "Latihan pecahan seru", fileKey: "interaktif/1/2/kata kunci panjang sekali.html", fileName: "nama berkas dengan banyak kata sekali.html" }]) === 3,
);
check(
  "interaktif embed tanpa title menyumbang 0 walau URL panjang",
  words([{ type: "interaktif", source: "embed", url: "https://moodle.sekolah.id/mod/hvp/view.php?id=12&banyak=sekali" }]) === 0,
);
check("interaktif isi rusak tidak melempar dan 0", words([null, { type: "interaktif" }]) === 0);

// --- Wiring route penyajian (routes/uploads.ts) --------------------------------------
const uploads = readFileSync(new URL("../routes/uploads.ts", import.meta.url), "utf8");
check("route presign khusus terdaftar", uploads.includes('"/presign-interaktif"'));
check("presign khusus berpenjaga guru + skema khusus", uploads.includes('requireRole("guru")') && uploads.includes("presignInteraktifUploadSchema"));
check("kunci presign khusus memakai awalan interaktif/", uploads.includes("INTERAKTIF_KEY_PREFIX"));
check("route penyajian interaktif terdaftar", uploads.includes('"/interaktif"'));
check("route penyajian memeriksa awalan kunci", uploads.includes("isInteraktifKey(key)"));
check("route penyajian memeriksa isi HTML sebelum menyajikan", uploads.includes("looksLikeHtmlHead(bytes)"));
const interaktifLib = readFileSync(new URL("./interaktif.ts", import.meta.url), "utf8");
check(
  "header CSP sandbox persis (konstanta dipakai route, nilainya sandbox allow-scripts)",
  uploads.includes('"Content-Security-Policy": INTERAKTIF_CSP_HEADER') && interaktifLib.includes('INTERAKTIF_CSP_HEADER = "sandbox allow-scripts"'),
);
check("header nosniff terpasang di penyajian", uploads.includes('"X-Content-Type-Options": "nosniff"'));
check("content-type penyajian text/html", uploads.includes('"Content-Type": "text/html; charset=utf-8"'));
check("penyajian tidak memakai URL bertanda tangan (mengambil objek internal)", uploads.includes("internalStorage.send(new GetObjectCommand"));
check("penjaga /download menolak kunci interaktif", uploads.includes('if (isInteraktifKey(key))'));

// --- Wiring modules: kunci lampiran dari fileKey --------------------------------------
const modulesRoute = readFileSync(new URL("../routes/modules.ts", import.meta.url), "utf8");
check("create blok menurunkan attachmentKey dari fileKey interaktif", modulesRoute.includes("blockContentAttachmentKey(input.content)"));
check("helper kunci membaca fileKey khusus interaktif", modulesRoute.includes('record.type === "interaktif"'));

// --- Migrasi 0018 -----------------------------------------------------------------------
const journal = JSON.parse(readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"));
check("jurnal migrasi 19 entri", journal.entries.length === 19, `got ${journal.entries.length}`);
check("entri terakhir jurnal adalah 0018_blok_interaktif (idx 18)", journal.entries[18]?.tag === "0018_blok_interaktif" && journal.entries[18]?.idx === 18);
const migration = readFileSync(new URL("../../../../packages/db/migrations/0018_blok_interaktif.sql", import.meta.url), "utf8");
check(
  "migrasi 0018 SATU pernyataan MODIFY enum module_blocks.type",
  (migration.match(/ALTER TABLE/g) ?? []).length === 1 && migration.includes("MODIFY") && migration.includes("`type`"),
);
check(
  "enum migrasi memuat keenam nilai persis",
  migration.includes("enum('teks','gambar','video','berkas','sub_bab','interaktif')"),
  migration.trim(),
);
const dbSchema = readFileSync(new URL("../../../../packages/db/src/schema/modules.ts", import.meta.url), "utf8");
check("skema drizzle module_blocks.type memuat interaktif", dbSchema.includes('"interaktif"'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
