// Tests for blok Media Interaktif (H5P v1, calon v1.0.62) di sisi web:
// editor guru (jenis blok terdaftar + dua mode + unggahan lewat presign
// khusus), render murid (iframe sandbox benar per mode, tombol layar
// penuh, caption), dan daftar isi yang tidak menyumbang entri.
// Run with bun from apps/web:  bun lib/blok-interaktif.test.mjs
import { readFileSync } from "node:fs";
import { planTableOfContents } from "./daftar-isi.ts";

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

// --- Perencana daftar isi: interaktif tidak menyumbang entri --------------------
const toc = planTableOfContents([
  { id: 1, type: "sub_bab", content: { title: "Bab Satu" }, sortOrder: 0 },
  { id: 2, type: "interaktif", content: { type: "interaktif", source: "unggah", title: "Judul tidak boleh jadi entri", fileKey: "interaktif/1/2/a.html" }, sortOrder: 1 },
  { id: 3, type: "interaktif", content: { type: "interaktif", source: "embed", url: "https://h5p.org/x" }, sortOrder: 2 },
]);
check("daftar isi hanya memuat sub_bab (interaktif dilewati)", toc.length === 1 && toc[0].label === "Bab Satu", `got ${JSON.stringify(toc.map((entry) => entry.label))}`);

// --- Komponen bingkai bersama ------------------------------------------------------
const component = readFileSync(new URL("../components/InteractiveBlock.tsx", import.meta.url), "utf8");
// Atribut unggahan persis sandbox="allow-scripts" (dengan tanda kutip
// penutup) — bentuk panjang allow-same-origin hanya milik mode embed.
check("mode unggah: sandbox iframe TANPA allow-same-origin", component.includes('sandbox="allow-scripts"'));
check("mode unggah menunjuk route penyajian API", component.includes("/uploads/interaktif?moduleId="));
check("kunci mode unggah diambil dari fileKey isi (dengan cadangan attachment_key)", component.includes("content.fileKey") && component.includes("block.attachment_key"));
check("mode embed: sandbox allow-scripts + allow-same-origin", component.includes('sandbox="allow-scripts allow-same-origin"'));
check("mode embed: loading lazy + allowFullScreen", component.includes('loading="lazy"') && component.includes("allowFullScreen"));
check("bingkai responsif: lebar penuh + aspect-ratio 16/10 + tinggi minimum", component.includes('aspectRatio: "16 / 10"') && component.includes("minHeight: 280"));
check("tombol Layar penuh memakai requestFullscreen pada pembungkus", component.includes("Layar penuh") && component.includes("requestFullscreen"));
check("caption (title isi) dirender di bawah bingkai", component.includes("content.title") && component.includes("<figcaption>"));
check("judul aksesibel iframe terpasang", component.includes("title={frameTitle}"));
check("keadaan kosong menampilkan pemberitahuan, bukan bingkai rusak", component.includes("Media interaktif belum tersedia."));

const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check("mode layar penuh: bingkai mengisi layar (CSS :fullscreen)", globalsCss.includes(".interactive-frame:fullscreen iframe"));

// --- Render murid + pratinjau ---------------------------------------------------------
const muridPage = readFileSync(new URL("../app/murid/modules/[id]/page.tsx", import.meta.url), "utf8");
check("halaman murid mengenali tipe interaktif", muridPage.includes('"interaktif"'));
check("halaman murid merender InteractiveBlock dengan moduleId", muridPage.includes("<InteractiveBlock block={block} moduleId={moduleId} />"));
const preview = readFileSync(new URL("../components/ModuleBlockPreview.tsx", import.meta.url), "utf8");
check("pratinjau guru merender InteractiveBlock yang sama", preview.includes("InteractiveBlock") && preview.includes('block.type === "interaktif"'));

// --- Editor guru ------------------------------------------------------------------------
const guru = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");
check("pemilih jenis blok memuat label persis 'Media Interaktif'", guru.includes('{ value: "interaktif", label: "Media Interaktif" }'));
check("label jenis blok untuk daftar blok = Media Interaktif", guru.includes('interaktif: "Media Interaktif"'));
check("segmen mode: 'Unggah HTML Lumi'", guru.includes('{ value: "unggah", label: "Unggah HTML Lumi" }'));
check("segmen mode: 'Tautan embed'", guru.includes('{ value: "embed", label: "Tautan embed" }'));
check("pemilih berkas menerima .html/.htm saja", guru.includes('accept=".html,.htm,text/html"'));
check("unggahan memakai presign khusus interaktif", guru.includes('"/uploads/presign-interaktif"'));
check("unggahan TIDAK melewati konversi gambar", guru.includes("uploadInteraktifFile") && !guru.slice(guru.indexOf("async function uploadInteraktifFile"), guru.indexOf("async function uploadInteraktifFile") + 900).includes("prepareImageForUpload"));
check("batas klien 25 MB dinyatakan", guru.includes("25 * 1024 * 1024"));
check("mode embed menolak non-https di klien", guru.includes('!url.startsWith("https://")'));
check("petunjuk sumber embed tampil (Moodle/h5p.com)", guru.includes("Moodle atau h5p.com"));
check("kolom keterangan opsional ada", guru.includes('placeholder="Keterangan (opsional)"'));
check("dispatch tambah memakai addInteraktifBlock", guru.includes("addInteraktifBlock(event)"));
check("dispatch sunting memakai updateInteraktifBlock", guru.includes("updateInteraktifBlock()"));
check("sunting blok unggahan mengingat berkas tersimpan (ganti berkas opsional)", guru.includes("interaktifExisting") && guru.includes("setInteraktifExisting"));
check("tombol kirim mode tambah berlabel media interaktif", guru.includes('"Tambahkan media interaktif"'));
check("ringkasan blok interaktif di daftar blok (title/fileName/url)", guru.includes('block.type === "interaktif"'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
