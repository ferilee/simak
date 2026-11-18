// Tests for penentuan tab beranda murid dari parameter URL
// (perbaikan navigasi murid, calon v1.0.77): bilah bawah dan menu
// samping menautkan Materi/Penugasan sebagai /murid?tab=..., dan
// navigasi lunak Next ke pathname yang sama tidak memasang ulang
// halaman — membaca ?tab= hanya saat mount membuat ketukan tab
// tampak mati total. Tab harus fungsi murni dari URL saat ini dan
// halaman harus menyinkronkan SETIAP perubahan parameter.
// Run with bun from apps/web:  bun lib/tab-murid.test.mjs
//
// Yang dikunci di sini:
//  - muridTabFromSearch (lib/tab-murid.ts) murni: "materi" dan
//    "penugasan" diakui persis; parameter hilang/kosong/nilai lain
//    (termasuk "nilai"/"jurnal" yang rute sungguhan) → "dashboard".
//  - Pengkabelan beranda murid: tab disinkronkan komponen kecil
//    MuridTabUrlSync yang membaca useSearchParams dan menjalankan
//    sinkronisasi dalam effect yang bergantung pada string
//    pencarian (BUKAN effect mount berdependensi kosong, BUKAN
//    pembacaan window.location.search), dirender di dalam batas
//    Suspense, dan hasilnya mengalir ke state activeTab yang sama
//    yang memberi makan sorotan bilah bawah + menu samping.
import { readFileSync } from "node:fs";
import { muridTabFromSearch } from "./tab-murid.ts";

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

console.log("Kasus A: pemetaan parameter tab");
check("?tab=materi → materi", muridTabFromSearch("?tab=materi") === "materi");
check("?tab=penugasan → penugasan", muridTabFromSearch("?tab=penugasan") === "penugasan");
check("tanpa tanda tanya: tab=materi → materi", muridTabFromSearch("tab=materi") === "materi");
check("parameter lain ikut: ?x=1&tab=penugasan → penugasan", muridTabFromSearch("?x=1&tab=penugasan") === "penugasan");

console.log("Kasus B: bawaan dashboard");
check("string kosong → dashboard", muridTabFromSearch("") === "dashboard");
check("tanpa parameter tab → dashboard", muridTabFromSearch("?x=1") === "dashboard");
check("tab kosong → dashboard", muridTabFromSearch("?tab=") === "dashboard");
check("nilai asing → dashboard", muridTabFromSearch("?tab=asing") === "dashboard");
check("tab=nilai (rute sungguhan) → dashboard", muridTabFromSearch("?tab=nilai") === "dashboard");
check("tab=jurnal (rute sungguhan) → dashboard", muridTabFromSearch("?tab=jurnal") === "dashboard");
check("peka huruf: ?tab=Materi → dashboard", muridTabFromSearch("?tab=Materi") === "dashboard");

console.log("Kasus C: pengkabelan beranda murid");
const page = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check(
  "halaman mengimpor pemetaan murni lib/tab-murid",
  page.includes('import { muridTabFromSearch, type MuridHomeTab } from "../../lib/tab-murid";'),
);
check(
  "penyinkron membaca parameter lewat useSearchParams",
  page.includes("function MuridTabUrlSync(") && page.includes("const searchParams = useSearchParams();"),
);
check(
  "sinkronisasi berjalan dalam effect yang bergantung pada string pencarian (bukan mount saja)",
  page.includes("onSync(muridTabFromSearch(search));") && page.includes("}, [search, onSync]);"),
);
check(
  "tidak ada lagi pembacaan ?tab= dari window.location.search",
  !page.includes("window.location.search"),
);
check(
  "penyinkron dirender di dalam batas Suspense dan mengalir ke setActiveTab",
  page.includes("<Suspense fallback={null}>") && page.includes("<MuridTabUrlSync onSync={setActiveTab} />"),
);
check(
  "sorotan bilah bawah tetap diberi makan state tab yang sama",
  page.includes("<MuridBottomNav active={activeTab}"),
);
check(
  "sorotan menu samping tetap mengikuti state tab yang sama",
  page.includes('activeTab === "materi" ? "is-active" : ""') && page.includes('activeTab === "penugasan" ? "is-active" : ""'),
);

console.log("Kasus D: bilah bawah di halaman anak murid");
const modulePage = readFileSync(new URL("../app/murid/modules/[id]/page.tsx", import.meta.url), "utf8");
const worksheetPage = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
const assignmentPage = readFileSync(new URL("../app/murid/assignments/[id]/page.tsx", import.meta.url), "utf8");
check(
  "detail materi merender bilah bawah dengan tab materi aktif",
  modulePage.includes('import { MuridBottomNav } from "../../../../components/MuridBottomNav";')
    && modulePage.includes('<MuridBottomNav active="materi" />'),
);
check(
  "LKPD merender bilah bawah dengan tab penugasan aktif",
  worksheetPage.includes('import { MuridBottomNav } from "../../../../components/MuridBottomNav";')
    && worksheetPage.includes('<MuridBottomNav active="penugasan" />'),
);
check(
  "detail penugasan merender bilah bawah dengan tab penugasan aktif",
  assignmentPage.includes('import { MuridBottomNav } from "../../../../components/MuridBottomNav";')
    && assignmentPage.includes('<MuridBottomNav active="penugasan" />'),
);
check(
  "ketiga halaman anak memakai wadah murid-page-container (bantalan bawah anti tertutup bilah)",
  modulePage.includes('className="murid-page-container"')
    && worksheetPage.includes('className="murid-page-container"')
    && assignmentPage.includes('className="murid-page-container"'),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
