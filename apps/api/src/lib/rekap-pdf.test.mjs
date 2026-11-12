// Tests for perencana PDF Rekap Sesi (lib/rekap-pdf): warna latar sel
// menurut ketuntasan, lebar kolom mengikuti isi, dan wiring generator
// PDF di routes/reports.ts. Run with bun from apps/api:
//   bun src/lib/rekap-pdf.test.mjs
//
// Yang dikunci di sini:
//  - Konstanta warna persis referensi (kuning FFF2CC, merah F4CCCC,
//    kepala CFE2F3) dan konversi operator warna PDF-nya.
//  - planMaterialReadingState: tiga keadaan membaca materi dari dua
//    sinyal activity_logs (completed menang atas opened), teks tampil
//    persisnya, dan warna kolom Materi/Modul yang melekat padanya.
//  - planRekapCellFill untuk semua aturan yang disetujui, termasuk
//    tepi: materi dari keadaan membacanya sendiri, LKPD belum/draf/
//    terkumpul/dinilai, nilai "-" pada tiga keadaan LKPD, exit
//    sudah/belum, RUAS berlaku vs tidak berlaku.
//  - measurePdfText = lebar Helvetica baku atas teks tersanitasi
//    (sama seperti pdfText generator).
//  - planRekapColumnWidths: lebar >= isi terpanjang (kasus nyata
//    "terkumpul" TIDAK lagi terpotong seperti lebar tetap lama),
//    kepala bisa menjadi yang terpanjang, nama dua baris diukur per
//    baris logis, dan saat total melebihi lebar cetak HANYA kolom
//    Murid yang menyusut (lantai kata terpanjang dihormati).
//  - Wiring: createSessionPdf memakai perencana warna + lebar +
//    warna kepala; lebar tetap lama untuk tabel sesi hilang; PDF
//    Rentang (createRangePdf) TIDAK berubah perilakunya.
//  - Kolom Presensi DIGANTI Materi/Modul: PDF sesi + CSV sesi +
//    CSV rentang berkepala "Materi/Modul" dengan nilai keadaan
//    membaca; pembangun baris meneruskan material_opened /
//    material_completed dari activity_logs per module_id; field
//    JSON lama (hadir dkk.) tetap ada dan tak berubah makna.
//  - Paket ini TANPA migrasi: jurnal tetap 18 entri berakhir di 0017.
import { readFileSync } from "node:fs";
import {
  REKAP_FILL_KUNING_HEX,
  REKAP_FILL_MERAH_HEX,
  REKAP_HEADER_HEX,
  REKAP_HEADER_PDF_COLOR,
  hexToPdfColor,
  materialReadingFill,
  materialReadingText,
  measurePdfText,
  planMaterialReadingState,
  planRekapCellFill,
  planRekapColumnWidths,
  planRekapRowFills,
  rekapFillPdfColor,
  rekapNameLines,
  wrapLinesByChars,
} from "./rekap-pdf.ts";

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

const near = (a, b) => Math.abs(a - b) < 0.001;

// --- Konstanta & konversi warna ---------------------------------------------
check("hex kuning persis FFF2CC", REKAP_FILL_KUNING_HEX === "FFF2CC");
check("hex merah persis F4CCCC", REKAP_FILL_MERAH_HEX === "F4CCCC");
check("hex kepala persis CFE2F3", REKAP_HEADER_HEX === "CFE2F3");
check("FFF2CC -> 1.000 0.949 0.800", hexToPdfColor("FFF2CC") === "1.000 0.949 0.800", hexToPdfColor("FFF2CC"));
check("F4CCCC -> 0.957 0.800 0.800", hexToPdfColor("F4CCCC") === "0.957 0.800 0.800", hexToPdfColor("F4CCCC"));
check("CFE2F3 -> 0.812 0.886 0.953", hexToPdfColor("CFE2F3") === "0.812 0.886 0.953", hexToPdfColor("CFE2F3"));
check("warna kepala PDF = konversi CFE2F3", REKAP_HEADER_PDF_COLOR === "0.812 0.886 0.953");
check("rekapFillPdfColor kuning/merah konsisten", rekapFillPdfColor("kuning") === "1.000 0.949 0.800" && rekapFillPdfColor("merah") === "0.957 0.800 0.800");

// --- planMaterialReadingState --------------------------------------------------
check("membaca: belum buka + belum tuntas -> 'belum'", planMaterialReadingState({ opened: false, completed: false }) === "belum");
check("membaca: sudah buka + belum tuntas -> 'belum_tuntas'", planMaterialReadingState({ opened: true, completed: false }) === "belum_tuntas");
check("membaca: tuntas -> 'tuntas'", planMaterialReadingState({ opened: true, completed: true }) === "tuntas");
check("membaca: completed menang atas opened (tuntas tanpa catatan buka tetap tuntas)", planMaterialReadingState({ opened: false, completed: true }) === "tuntas");
check("teks keadaan membaca persis", materialReadingText("tuntas") === "Tuntas" && materialReadingText("belum_tuntas") === "Belum tuntas" && materialReadingText("belum") === "Belum");
check("warna keadaan membaca: tuntas polos, belum_tuntas kuning, belum merah",
  materialReadingFill("tuntas") === null && materialReadingFill("belum_tuntas") === "kuning" && materialReadingFill("belum") === "merah");

// --- planRekapCellFill -------------------------------------------------------
const base = { materiState: "tuntas", lkpdStatus: "dinilai", nilai: 75, exitTicketSubmitted: true, ruasScore: 78, ruasBerlaku: true };
const S = (patch) => ({ ...base, ...patch });

// Materi (dari keadaan membacanya sendiri, bukan proksi presensi)
check("materi tuntas -> tanpa warna", planRekapCellFill("materi", S({})) === null);
check("materi belum_tuntas -> kuning", planRekapCellFill("materi", S({ materiState: "belum_tuntas" })) === "kuning");
check("materi belum -> merah", planRekapCellFill("materi", S({ materiState: "belum" })) === "merah");
// LKPD
check("lkpd belum -> merah", planRekapCellFill("lkpd", S({ lkpdStatus: "belum" })) === "merah");
check("lkpd draf -> kuning", planRekapCellFill("lkpd", S({ lkpdStatus: "draf" })) === "kuning");
check("lkpd terkumpul -> tanpa warna", planRekapCellFill("lkpd", S({ lkpdStatus: "terkumpul" })) === null);
check("lkpd dinilai -> tanpa warna", planRekapCellFill("lkpd", S({ lkpdStatus: "dinilai" })) === null);
// Nilai
check("nilai ada angka -> tanpa warna (status apa pun)", planRekapCellFill("nilai", S({ lkpdStatus: "belum", nilai: 0 })) === null);
check("nilai kosong + draf -> kuning", planRekapCellFill("nilai", S({ lkpdStatus: "draf", nilai: null })) === "kuning");
check("nilai kosong + terkumpul -> kuning", planRekapCellFill("nilai", S({ lkpdStatus: "terkumpul", nilai: null })) === "kuning");
check("nilai kosong + belum -> merah", planRekapCellFill("nilai", S({ lkpdStatus: "belum", nilai: null })) === "merah");
check("nilai kosong + dinilai (tepi tak konsisten) -> kuning", planRekapCellFill("nilai", S({ lkpdStatus: "dinilai", nilai: null })) === "kuning");
// Exit ticket
check("exit sudah -> tanpa warna", planRekapCellFill("exit", S({})) === null);
check("exit belum -> merah", planRekapCellFill("exit", S({ exitTicketSubmitted: false })) === "merah");
// Nilai RUAS
check("ruas ada angka -> tanpa warna", planRekapCellFill("ruas", S({})) === null);
check("ruas kosong + penugasan berkuis -> merah", planRekapCellFill("ruas", S({ ruasScore: null })) === "merah");
check("ruas kosong + kolom tak berlaku -> tanpa warna", planRekapCellFill("ruas", S({ ruasScore: null, ruasBerlaku: false })) === null);

// Baris utuh menyerupai referensi guru
const fillsA = planRekapRowFills(S({ materiState: "belum_tuntas", lkpdStatus: "draf", nilai: null, exitTicketSubmitted: false, ruasScore: 75 }));
check("baris A (draf, belum exit): materi kuning, lkpd kuning, nilai kuning, exit merah, ruas polos",
  fillsA.materi === "kuning" && fillsA.lkpd === "kuning" && fillsA.nilai === "kuning" && fillsA.exit === "merah" && fillsA.ruas === null, JSON.stringify(fillsA));
const fillsC = planRekapRowFills(S({ lkpdStatus: "terkumpul", nilai: null, ruasScore: 76 }));
check("baris C (terkumpul belum dinilai): hanya nilai kuning",
  fillsC.materi === null && fillsC.lkpd === null && fillsC.nilai === "kuning" && fillsC.exit === null && fillsC.ruas === null, JSON.stringify(fillsC));
const fillsZ = planRekapRowFills(S({ materiState: "belum", lkpdStatus: "belum", nilai: null, exitTicketSubmitted: false, ruasScore: null }));
check("baris belum menyentuh apa pun + kuis berlaku: kelimanya merah",
  fillsZ.materi === "merah" && fillsZ.lkpd === "merah" && fillsZ.nilai === "merah" && fillsZ.exit === "merah" && fillsZ.ruas === "merah", JSON.stringify(fillsZ));
const fillsZ2 = planRekapRowFills(S({ materiState: "belum", lkpdStatus: "belum", nilai: null, exitTicketSubmitted: false, ruasScore: null, ruasBerlaku: false }));
check("baris belum menyentuh apa pun tanpa kuis: ruas polos, empat lain merah",
  fillsZ2.ruas === null && fillsZ2.materi === "merah" && fillsZ2.lkpd === "merah" && fillsZ2.nilai === "merah" && fillsZ2.exit === "merah", JSON.stringify(fillsZ2));

// --- measurePdfText ----------------------------------------------------------
check("lebar 'terkumpul' Helvetica 7.5pt = 32.925", near(measurePdfText("terkumpul", 7.5), 32.925), String(measurePdfText("terkumpul", 7.5)));
check("diakritik disanitasi sebelum diukur (é = e)", near(measurePdfText("é", 10), measurePdfText("e", 10)));
check("karakter di luar ASCII menjadi '?'", near(measurePdfText("€", 10), measurePdfText("?", 10)));
check("teks kosong lebar 0", measurePdfText("", 8) === 0);

// --- wrapLinesByChars (cermin pembungkus generator) --------------------------
check("wrap 'terkumpul' pada 8 karakter terpecah (akar keluhan lama)", JSON.stringify(wrapLinesByChars("terkumpul", 8)) === JSON.stringify(["terkumpu", "l"]));
check("wrap mematahkan pada batas kata", JSON.stringify(wrapLinesByChars("Budi Santoso (budi)", 12)) === JSON.stringify(["Budi Santoso", "(budi)"]));
check("nama dipecah menjadi dua baris logis", JSON.stringify(rekapNameLines("Muhamad Noval Yan Prayoga (noval_tkja)")) === JSON.stringify(["Muhamad Noval Yan Prayoga", "(noval_tkja)"]));
check("nama tanpa username tetap satu baris", JSON.stringify(rekapNameLines("Nama Saja")) === JSON.stringify(["Nama Saja"]));

// --- planRekapColumnWidths ----------------------------------------------------
const HEADERS = ["No.", "Murid", "Kelas", "Materi/Modul", "LKPD", "Nilai", "Exit", "RUAS"];
const REF_ROWS = [
  ["1", "Muhamad Noval Yan Prayoga (noval_tkja)", "X TKJ A", "Belum tuntas", "draf", "-", "Belum", "75"],
  ["2", "Feli Dwi Wijaya (feli_tkja)", "X TKJ A", "Tuntas", "dinilai", "75", "Sudah", "78"],
  ["3", "Muhamad Evan Ainuridho (evan_tkja)", "X TKJ A", "Tuntas", "terkumpul", "-", "Sudah", "76"],
];
const planRef = planRekapColumnWidths({ headers: HEADERS, rows: REF_ROWS, measure: measurePdfText, headerFontSize: 8, bodyFontSize: 7.5, cellPaddingX: 4, maxTableWidth: 523, wrapColumnIndex: 1 });
check("kolom LKPD muat 'terkumpul' utuh: chars = 9 (lama 8 yang memotong)", planRef.chars[4] === "terkumpul".length && planRef.chars[4] > 8, String(planRef.chars[4]));
check("kolom LKPD selebar isinya + padding", planRef.widths[4] >= measurePdfText("terkumpul", 7.5) + 8 - 0.001, String(planRef.widths[4]));
check("kolom Materi/Modul muat 'Belum tuntas' utuh", planRef.chars[3] >= "Belum tuntas".length && planRef.widths[3] >= measurePdfText("Belum tuntas", 7.5) + 8 - 0.001);
check("kolom Murid diukur per baris logis, bukan string penuh",
  planRef.widths[1] >= Math.max(measurePdfText("Muhamad Noval Yan Prayoga", 7.5), measurePdfText("(noval_tkja)", 7.5)) + 8 - 0.001 &&
  planRef.widths[1] < measurePdfText("Muhamad Noval Yan Prayoga (noval_tkja)", 7.5) + 8, String(planRef.widths[1]));
check("total rencana referensi muat lebar cetak 523 -> nama tidak menyusut",
  planRef.widths.reduce((a, b) => a + b, 0) <= 523 && planRef.namaMembungkus === false,
  `total=${planRef.widths.reduce((a, b) => a + b, 0)}`);
check("semua kolom non-bungkus: chars >= teks terpanjangnya",
  HEADERS.every((_, i) => i === 1 || planRef.chars[i] >= Math.max(HEADERS[i].length, ...REF_ROWS.map((r) => r[i].length))));

// Kepala sebagai teks terpanjang
const planHeader = planRekapColumnWidths({ headers: ["Nilai RUAS"], rows: [["5"], ["100"]], measure: measurePdfText, headerFontSize: 8, bodyFontSize: 7.5, cellPaddingX: 4, maxTableWidth: 523, wrapColumnIndex: -1 });
check("kepala terpanjang menentukan lebar ('Nilai RUAS')", planHeader.widths[0] >= measurePdfText("Nilai RUAS", 8) + 8 - 0.001 && planHeader.widths[0] < measurePdfText("Nilai RUAS", 8) + 8 + 1, String(planHeader.widths[0]));

// Skenario menyusut: ukur suntikan seragam 10pt/karakter
const flatMeasure = (text) => text.length * 10;
const LONG_ROWS = [
  ["1", "Budi Santoso (budi_tkja)", "X TKJ A", "Tuntas", "terkumpul", "80", "Sudah", "75"],
  ["2", "Alexander Christopher Wijaya (alexander_tkj)", "X TKJ A", "Belum tuntas", "draf", "-", "Belum", "-"],
];
const planNatural = planRekapColumnWidths({ headers: HEADERS, rows: LONG_ROWS, measure: flatMeasure, headerFontSize: 8, bodyFontSize: 7.5, cellPaddingX: 4, maxTableWidth: 100000, wrapColumnIndex: 1 });
const planShrunk = planRekapColumnWidths({ headers: HEADERS, rows: LONG_ROWS, measure: flatMeasure, headerFontSize: 8, bodyFontSize: 7.5, cellPaddingX: 4, maxTableWidth: 700, wrapColumnIndex: 1 });
check("rencana alami: total 794, Murid 288", near(planNatural.widths.reduce((a, b) => a + b, 0), 794) && near(planNatural.widths[1], 288), JSON.stringify(planNatural.widths));
check("menyusut: hanya kolom Murid yang berubah", planShrunk.widths.every((w, i) => i === 1 || near(w, planNatural.widths[i])), JSON.stringify(planShrunk.widths));
check("menyusut: total tepat muat 700 dan namaMembungkus true", near(planShrunk.widths.reduce((a, b) => a + b, 0), 700) && planShrunk.namaMembungkus === true);
check("menyusut: chars Murid 20 (baris simulasi muat lebar dalam)",
  planShrunk.chars[1] === 20 && LONG_ROWS.every((r) => wrapLinesByChars(r[1], planShrunk.chars[1]).every((line) => flatMeasure(line) <= planShrunk.widths[1] - 8 + 0.001)),
  `chars=${planShrunk.chars[1]} width=${planShrunk.widths[1]}`);
// Lantai kata terpanjang: lebar cetak mustahil kecil -> Murid berhenti di lantai
const planFloor = planRekapColumnWidths({ headers: HEADERS, rows: LONG_ROWS, measure: flatMeasure, headerFontSize: 8, bodyFontSize: 7.5, cellPaddingX: 4, maxTableWidth: 100, wrapColumnIndex: 1 });
check("lantai: Murid berhenti pada kata terpanjang '(alexander_tkj)' = 158", near(planFloor.widths[1], 158) && planFloor.chars[1] >= "(alexander_tkj)".length, `width=${planFloor.widths[1]} chars=${planFloor.chars[1]}`);

// --- Wiring generator (routes/reports.ts) --------------------------------------
const reports = readFileSync(new URL("../routes/reports.ts", import.meta.url), "utf8");
const sessionFn = reports.slice(reports.indexOf("function createSessionPdf"), reports.indexOf("function createRangePdf"));
check("createSessionPdf memakai perencana lebar", sessionFn.includes("planRekapColumnWidths") && sessionFn.includes("measure: measurePdfText"));
check("createSessionPdf memakai perencana warna per baris", sessionFn.includes("planRekapRowFills") && sessionFn.includes("cellFills"));
check("createSessionPdf memakai warna kepala referensi", sessionFn.includes("headerColor: REKAP_HEADER_PDF_COLOR"));
check("berlaku RUAS diturunkan dari bukti impor", sessionFn.includes("data.summary.ruas_scored > 0 || data.ruas_unmatched.length > 0"));
check("kolom keempat PDF sesi = Materi/Modul berisi keadaan membaca", sessionFn.includes('"Materi/Modul"') && sessionFn.includes("readingTextOf(student)") && !sessionFn.includes('"Presensi"') && !sessionFn.includes("Belum hadir"));
check("warna materi PDF sesi dari keadaan membaca baris", sessionFn.includes("materiState: readingStateOf(student)"));
check("sinyal membaca dibangun dari activity_logs per module_id penugasan", reports.includes("eq(activityLogs.moduleId, assignment.moduleId)") && reports.includes('inArray(activityLogs.event, ["buka_materi", "baca_materi_tuntas"])'));
check("baris laporan meneruskan material_opened/material_completed", reports.includes("material_opened: materialOpenedStudents.has(student.id)") && reports.includes("material_completed: materialCompletedStudents.has(student.id)"));
check("JSON tetap aditif: field hadir lama utuh + field materi baru terdeklarasi", reports.includes("hadir: Boolean(openedAt && submitted)") && reports.includes("material_opened: boolean; material_completed: boolean;"));
check("kedua CSV berkepala Materi/Modul dengan nilai keadaan membaca", reports.includes('"Kelas", "Materi/Modul", "Status LKPD"') && reports.includes("readingTextOf(row)") && !reports.includes('"Presensi"'));
check("lebar tetap lama tabel sesi hilang", !reports.includes('width: 150, chars: 24') && !reports.includes('{ title: "LKPD", width: 55, chars: 8 }'));
check("judul & subjudul sesi tidak berubah", sessionFn.includes("`SIMAK - Rekap Sesi: ${data.assignment.title}`") && sessionFn.includes("Batas: ${pdfDate(data.assignment.due_at)}"));
check("isi sel sesi lain tidak berubah", sessionFn.includes('student.exit_ticket_submitted ? "Sudah" : "Belum"') && sessionFn.includes('student.submission_status'));
const rangeFn = reports.slice(reports.indexOf("function createRangePdf"), reports.indexOf("type TabularPdfOptions"));
check("PDF Rentang tidak disentuh: kolom tetap lama + tanpa opsi warna", rangeFn.includes('{ title: "Penugasan", width: 190, chars: 30 }') && !rangeFn.includes("cellFills") && !rangeFn.includes("headerColor"));
check("renderer menggambar isian sel dari perencana", reports.includes("pdfCellFill") && reports.includes("rekapFillPdfColor(fill)"));
check("warna kepala lama tetap bawaan pdfRect (PDF lain tak berubah)", reports.includes('fillColor = "0.93 0.95 0.98"'));

// --- Tanpa migrasi --------------------------------------------------------------
const journal = JSON.parse(readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"));
check("paket tanpa migrasi: jurnal tetap 18 entri berakhir di 0017_avatar_murid", journal.entries.length === 18 && journal.entries[17].tag === "0017_avatar_murid");

console.log(`\nAPI rekap-pdf: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
