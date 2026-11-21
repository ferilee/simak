// Tests for the instruction-text block parser (calon v1.0.86). Teacher
// instructions written as numbered lines must render as one real <ol>
// instead of a single run-on paragraph; plain text keeps its old shape.
// Run with bun from apps/web:  bun lib/petunjuk.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInstructionBlocks } from "./petunjuk.ts";

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Poin bernomor seperti petunjuk pada tangkapan layar guru --------------
const screenshotText = [
  "1. Baca materi dari awal sampai tuntas dengan sungguh-sungguh.",
  "2. Di tengah materi ada pertanyaan Cek Baca.",
  "3. Selesaikan membaca sampai akhir materi, lalu isi exit ticket-nya.",
  "4. Kerjakan LKPD sebelum batas waktu.",
].join("\n");
const screenshotBlocks = parseInstructionBlocks(screenshotText);
check("empat baris bernomor menjadi tepat satu blok daftar", screenshotBlocks.length === 1 && screenshotBlocks[0].type === "list", JSON.stringify(screenshotBlocks));
check(
  "daftar berisi 4 butir tanpa awalan nomor ganda",
  screenshotBlocks[0]?.items.length === 4
    && screenshotBlocks[0].items.every((item) => !/^\d+[.)]/.test(item))
    && screenshotBlocks[0].items[0].startsWith("Baca materi"),
  JSON.stringify(screenshotBlocks[0]),
);
check("daftar mulai dari nomor 1", screenshotBlocks[0]?.start === 1);

// --- Campuran paragraf + daftar ----------------------------------------------
const mixed = parseInstructionBlocks("Perhatikan baik-baik petunjuk berikut.\n1. Langkah pertama.\n2. Langkah kedua.\nSelamat mengerjakan.");
check(
  "campuran menjadi paragraf–daftar–paragraf",
  same(mixed.map((block) => block.type), ["paragraph", "list", "paragraph"]),
  JSON.stringify(mixed),
);
check("paragraf pembuka utuh satu baris", same(mixed[0]?.lines, ["Perhatikan baik-baik petunjuk berikut."]));
check("paragraf penutup sesudah daftar tidak tertelan daftar", same(mixed[2]?.lines, ["Selamat mengerjakan."]));

// --- Varian penomoran ----------------------------------------------------------
const paren = parseInstructionBlocks("1) Pertama.\n2) Kedua.");
check("varian '1)' menjadi daftar", paren.length === 1 && paren[0].type === "list" && paren[0].items.length === 2, JSON.stringify(paren));

const manyLines = Array.from({ length: 10 }, (_, i) => `${i + 1}. Butir ${i + 1}.`).join("\n");
const manyBlocks = parseInstructionBlocks(manyLines);
check("nomor dua digit '10.' tetap satu daftar 10 butir", manyBlocks.length === 1 && manyBlocks[0].items.length === 10 && manyBlocks[0].items[9] === "Butir 10.", JSON.stringify(manyBlocks));

const resumed = parseInstructionBlocks("3. Lanjutan ketiga.\n4. Lanjutan keempat.");
check("daftar yang mulai dari 3 menyimpan start 3", resumed.length === 1 && resumed[0].start === 3, JSON.stringify(resumed));

// --- Baris kosong sebagai pemisah blok -----------------------------------------
const separated = parseInstructionBlocks("1. Satu.\n2. Dua.\n\nCatatan penutup.");
check("baris kosong memisahkan daftar dari paragraf", same(separated.map((block) => block.type), ["list", "paragraph"]), JSON.stringify(separated));
const twoLists = parseInstructionBlocks("1. Satu.\n\n1. Ulang dari awal.");
check("baris kosong di tengah daftar membelah jadi dua daftar", twoLists.length === 2 && twoLists.every((block) => block.type === "list"), JSON.stringify(twoLists));

// --- Teks polos & baris-baris paragraf ------------------------------------------
const plain = parseInstructionBlocks("Kerjakan berurutan. Draf tersimpan otomatis; kumpulkan sebelum batas waktu.");
check("teks polos satu baris tetap satu paragraf satu baris", same(plain, [{ type: "paragraph", lines: ["Kerjakan berurutan. Draf tersimpan otomatis; kumpulkan sebelum batas waktu."] }]), JSON.stringify(plain));

const twoPlainLines = parseInstructionBlocks("Baris pertama.\nBaris kedua.");
check("dua baris polos berurutan menjadi satu paragraf dua baris (jeda dihormati)", same(twoPlainLines, [{ type: "paragraph", lines: ["Baris pertama.", "Baris kedua."] }]), JSON.stringify(twoPlainLines));

// --- Bukan nomor poin -------------------------------------------------------------
const decimal = parseInstructionBlocks("3.5 adalah contoh bilangan desimal.\nKerjakan dengan teliti.");
check("angka desimal di awal baris bukan poin daftar", decimal.length === 1 && decimal[0].type === "paragraph" && decimal[0].lines.length === 2, JSON.stringify(decimal));

// --- Teks kosong / aman -------------------------------------------------------------
check("null aman menjadi tanpa blok", same(parseInstructionBlocks(null), []));
check("undefined aman menjadi tanpa blok", same(parseInstructionBlocks(undefined), []));
check("string kosong aman menjadi tanpa blok", same(parseInstructionBlocks(""), []));
check("hanya spasi/baris kosong aman menjadi tanpa blok", same(parseInstructionBlocks("  \n\n  "), []));
check("CRLF dinormalisasi", parseInstructionBlocks("1. Satu.\r\n2. Dua.")[0]?.items.length === 2);

// --- Kunci wiring statis --------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, "../components/InstructionText.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");
const assignmentPage = readFileSync(join(here, "../app/murid/assignments/[id]/page.tsx"), "utf8");
const worksheetPage = readFileSync(join(here, "../app/murid/worksheets/[id]/page.tsx"), "utf8");
const guruPage = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const libraryPanel = readFileSync(join(here, "../components/LibraryPanel.tsx"), "utf8");

check("komponen memakai pengurai + MathText per butir", component.includes("parseInstructionBlocks") && component.includes("MathText"));
check("komponen merender <ol> untuk blok daftar", component.includes("<ol"));
check("CSS .instruction-text ol tersedia", css.includes(".instruction-text ol"));
check("CSS penanda daftar .instruction-text li::marker tersedia", css.includes(".instruction-text li::marker"));
check(
  "halaman detail penugasan murid memakai InstructionText untuk petunjuk penugasan",
  assignmentPage.includes("<InstructionText text={data.assignment.instructions}"),
);
check(
  "halaman detail penugasan murid tidak lagi merender petunjuk dalam satu <p>",
  !assignmentPage.includes("<MathText text={data.assignment.instructions} />"),
);
check(
  "halaman LKPD murid memakai InstructionText untuk petunjuk LKPD",
  worksheetPage.includes("<InstructionText text={data.worksheet.instructions}"),
);
check(
  "pratinjau LKPD guru memakai InstructionText (tampilan sama seperti murid)",
  guruPage.includes("<InstructionText text={previewWorksheet.instructions}"),
);
check(
  "pratinjau Perpustakaan Bersama memakai InstructionText",
  libraryPanel.includes("<InstructionText text={data.instructions}"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
