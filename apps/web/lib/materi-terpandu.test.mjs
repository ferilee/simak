// Tests for daftar materi murid terpandu (sisi web): perencana murni
// lib/materi-terpandu.ts + wiring render di beranda murid.
// Run with bun from apps/web:  bun lib/materi-terpandu.test.mjs
//
// Yang dikunci di sini:
//  - Hero = modul belum-tuntas + tidak-terkunci PALING AWAL pada
//    urutan server; keadaan hero: next / all-done / all-locked / none.
//  - Pengelompokan per (mapel, kelompok): urutan kemunculan server,
//    "Lainnya" (tanpa kelompok atau kelompok "Lainnya") selalu akhir;
//    kepala menghitung X dari Y termasuk modul terarsip; modul tuntas
//    tidak pernah digambar di bagian kelompoknya; kelompok yang
//    seluruhnya tuntas tidak menggambar bagian.
//  - Arsip: semua modul tuntas; saringan "belum" menyembunyikannya,
//    "tuntas" hanya menampilkan arsip; pencarian berlaku lintas
//    kelompok dan membuka arsip secara bawaan bila berbuah di sana.
//  - Lencana "Giliranmu" menempel pada modul hero juga di kartunya
//    dalam daftar; label ATP dari judul (parseAtpCode).
//  - Wiring beranda: tipe payload membawa topic_group +
//    material_completed; halaman menggambar hero, kepala kelompok +
//    bar progres, chip saringan, kotak cari, dan bagian arsip dari
//    lib ini — dan TIDAK mengarang status "sedang dibaca".
import { readFileSync } from "node:fs";
import { guidedGroupName, planGuidedMaterials, shouldShowHero } from "./materi-terpandu.ts";

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

let seq = 0;
function mod(overrides = {}) {
  seq++;
  return {
    id: seq,
    title: `Materi ${seq}`,
    subject: "Matematika",
    topicGroup: "Eksponen",
    materialCompleted: false,
    locked: false,
    lockedByTitle: null,
    ...overrides,
  };
}

console.log("Kasus A: pemilihan hero");
{
  const done = mod({ materialCompleted: true });
  const locked = mod({ locked: true, lockedByTitle: "Penghambat" });
  const next = mod();
  const later = mod();
  const plan = planGuidedMaterials([done, locked, next, later], "semua", "");
  check("hero = belum-tuntas tak-terkunci terawal (tuntas + terkunci dilewati)", plan.hero?.id === next.id);
  check("keadaan hero next", plan.heroState === "next");
  check("modul hero di bagian kelompoknya berlencana Giliranmu", plan.groups[0].modules.find((m) => m.id === next.id)?.isHero === true);
  check("modul bukan hero tidak berlencana", plan.groups[0].modules.find((m) => m.id === later.id)?.isHero === false);
}
{
  const plan = planGuidedMaterials([], "semua", "");
  check("tanpa materi → hero null + keadaan none", plan.hero === null && plan.heroState === "none" && plan.totalCount === 0);
}
{
  const doneUnlocked = mod({ materialCompleted: true });
  const locked = mod({ locked: true, lockedByTitle: "Penghambat" });
  const plan = planGuidedMaterials([doneUnlocked, locked], "semua", "");
  check("semua yang terbuka tuntas → all-done, hero null", plan.heroState === "all-done" && plan.hero === null);
  check("nextLocked menunjuk modul terkunci terawal untuk baris info", plan.nextLocked?.id === locked.id);
}
{
  const lockedA = mod({ locked: true, lockedByTitle: "A" });
  const lockedB = mod({ locked: true, lockedByTitle: "B" });
  const plan = planGuidedMaterials([lockedA, lockedB], "semua", "");
  check("semua terkunci → all-locked", plan.heroState === "all-locked" && plan.nextLocked?.id === lockedA.id);
}

console.log("Kasus B: pengelompokan + progres");
{
  const e1 = mod({ title: "Eksponen (ATP 1.1)" });
  const e2done = mod({ title: "Eksponen (ATP 1.2)", materialCompleted: true });
  const e3 = mod({ title: "Eksponen (ATP 1.3)" });
  const geo1 = mod({ topicGroup: "Geometri" });
  const bebas = mod({ topicGroup: null });
  const lainnya = mod({ topicGroup: "Lainnya" });
  const plan = planGuidedMaterials([e1, e2done, e3, geo1, bebas, lainnya], "semua", "");
  check("tiga bagian: Eksponen, Geometri, Lainnya (akhir)", plan.groups.map((g) => g.groupName).join(",") === "Eksponen,Geometri,Lainnya");
  const eksponen = plan.groups[0];
  check("kepala Eksponen menghitung yang terarsip: 1 dari 3", eksponen.completedCount === 1 && eksponen.totalCount === 3);
  check("modul tuntas tidak digambar di bagian kelompoknya", eksponen.modules.map((m) => m.id).join(",") === [e1.id, e3.id].join(","));
  check("label ATP dari judul", eksponen.modules[0].atpLabel === "ATP 1.1");
  check("tanpa kelompok + kelompok 'Lainnya' menyatu di bagian Lainnya", plan.groups[2].modules.length === 2 && plan.groups[2].isLainnya === true);
  check("arsip berisi modul tuntas", plan.archive.map((m) => m.id).join(",") === String(e2done.id) && plan.archiveTotal === 1);
}
{
  const allDone = mod({ materialCompleted: true });
  const plan = planGuidedMaterials([allDone], "semua", "");
  check("kelompok yang seluruhnya tuntas tidak menggambar bagian", plan.groups.length === 0 && plan.archiveTotal === 1);
}
{
  const kka = mod({ subject: "KKA", topicGroup: "Eksponen" });
  const mat = mod({ subject: "Matematika", topicGroup: "Eksponen" });
  const plan = planGuidedMaterials([kka, mat], "semua", "");
  check("kelompok sama di mapel berbeda = dua bagian terpisah", plan.groups.length === 2 && plan.groups[0].subject === "KKA" && plan.groups[1].subject === "Matematika");
}
check("nama kelompok: kosong/spasi/'Lainnya' → Lainnya", guidedGroupName(null) === "Lainnya" && guidedGroupName("  ") === "Lainnya" && guidedGroupName("Lainnya") === "Lainnya" && guidedGroupName(" Eksponen ") === "Eksponen");

console.log("Kasus C: saringan + cari");
{
  const open1 = mod({ title: "Pangkat Nol" });
  const done1 = mod({ title: "Pangkat Pecahan", materialCompleted: true });
  const open2 = mod({ title: "Logaritma Dasar", topicGroup: "Logaritma" });
  const all = [open1, done1, open2];

  const belum = planGuidedMaterials(all, "belum", "");
  check("saringan belum: arsip kosong digambar, kelompok utuh", belum.archive.length === 0 && belum.archiveTotal === 1 && belum.visibleTotal === 2);

  const tuntas = planGuidedMaterials(all, "tuntas", "");
  check("saringan tuntas: hanya arsip, terbuka secara bawaan", tuntas.groups.length === 0 && tuntas.archive.length === 1 && tuntas.archiveOpenByDefault === true && tuntas.visibleTotal === 1);

  const cari = planGuidedMaterials(all, "semua", "pecahan");
  check("cari menemukan modul tuntas → tetap di arsip + arsip terbuka bawaan", cari.archive.length === 1 && cari.archiveOpenByDefault === true && cari.visibleTotal === 1);
  check("cari lintas kelompok menurut judul", planGuidedMaterials(all, "semua", "logaritma").groups.map((g) => g.groupName).join(",") === "Logaritma");
  check("cari token bebas urutan", planGuidedMaterials(all, "semua", "dasar logaritma").visibleTotal === 1);
  const nihil = planGuidedMaterials(all, "semua", "trigonometri");
  check("cari tanpa hasil → visibleTotal 0 (keadaan kosong ramah digambar halaman)", nihil.visibleTotal === 0 && nihil.totalCount === 3);
}

console.log("Kasus D: keterlihatan hero");
{
  const plan = planGuidedMaterials([mod()], "semua", "");
  check("hero tampil pada jelajah biasa", shouldShowHero(plan, "semua", "") === true);
  check("hero tampil pada saringan belum", shouldShowHero(plan, "belum", "") === true);
  check("hero sembunyi pada saringan tuntas", shouldShowHero(plan, "tuntas", "") === false);
  check("hero sembunyi saat mencari", shouldShowHero(plan, "semua", "pangkat") === false);
  check("hero sembunyi bila tak ada materi", shouldShowHero(planGuidedMaterials([], "semua", ""), "semua", "") === false);
}

console.log("Kasus E: wiring beranda murid");
{
  const page = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
  check("tipe payload membawa field materi terpandu", page.includes("topic_group: string | null") && page.includes("material_completed: boolean"));
  check("halaman memakai perencana materi terpandu", page.includes("planGuidedMaterials(") && page.includes("shouldShowHero("));
  check("hero 'Materi berikutnya untukmu' + tombol Lanjutkan", page.includes("Materi berikutnya untukmu") && page.includes("Lanjutkan"));
  check("kepala kelompok + progres ter gambar", page.includes("dari") && page.includes("tuntas") && page.includes("material-progress-fill"));
  check("chip saringan + kotak cari ter gambar", page.includes("MATERIAL_FILTERS") && page.includes("Cari judul materi"));
  check("bagian arsip 'Sudah tuntas' ter gambar", page.includes("Sudah tuntas"));
  check("lencana Giliranmu ter gambar", page.includes("Giliranmu"));
  check("halaman TIDAK mengarang status sedang dibaca", !page.includes("Sedang dibaca"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
