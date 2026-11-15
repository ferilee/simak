// Tests for the "Nilai Saya" page (v1.0.35): the pure "Baru" marker
// decision (client-side last-visit baseline in localStorage) plus the
// static wiring of the page and the murid home dot.
// Run with bun from apps/web:  bun lib/nilai-saya.test.mjs
import { readFileSync } from "node:fs";
import { decideBaruMarkers, gradeScoreTone, NILAI_SAYA_LAST_VISIT_KEY, summarizeGrades } from "./nilai-saya.ts";

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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const NOW = new Date("2026-11-03T05:00:00.000Z");
const BASELINE = "2026-11-02T05:00:00.000Z";

function gradeRow(assignmentId, gradedAt) {
  return { assignment_id: assignmentId, graded_at: gradedAt };
}

// ---------------------------------------------------------------------------
console.log("Case 1: kunjungan pertama (baseline belum ada) — tanpa chip, baseline ditetapkan");
{
  const rows = [gradeRow(1, "2026-11-03T04:00:00.000Z"), gradeRow(2, "2026-10-01T04:00:00.000Z")];
  const decision = decideBaruMarkers(rows, null, NOW);
  check("tidak ada baris yang ditandai", decision.baruIds.size === 0);
  check("nextBaseline = waktu kunjungan ini", decision.nextBaseline === NOW.toISOString());
  check("kunci localStorage sesuai kesepakatan", NILAI_SAYA_LAST_VISIT_KEY === "simak:nilai-saya:last-visit");
}

// ---------------------------------------------------------------------------
console.log("Case 2: baris yang terbit sesudah baseline ditandai");
{
  const rows = [
    gradeRow(1, "2026-11-03T04:00:00.000Z"), // sesudah baseline
    gradeRow(2, "2026-11-01T04:00:00.000Z"), // sebelum baseline
    gradeRow(3, BASELINE),                    // tepat sama dengan baseline
    gradeRow(4, "bukan-tanggal"),             // rusak → diabaikan
  ];
  const decision = decideBaruMarkers(rows, BASELINE, NOW);
  check("hanya baris sesudah baseline yang ditandai", decision.baruIds.size === 1 && decision.baruIds.has(1));
  check("tepat sama dengan baseline TIDAK ditandai", !decision.baruIds.has(3));
  check("baseline dimajukan ke sekarang", decision.nextBaseline === NOW.toISOString());
}

// ---------------------------------------------------------------------------
console.log("Case 3: baseline rusak diperlakukan sebagai kunjungan pertama");
{
  const decision = decideBaruMarkers([gradeRow(1, "2026-11-03T04:00:00.000Z")], "rusak", NOW);
  check("tanpa tanda", decision.baruIds.size === 0);
  check("nextBaseline tetap sekarang", decision.nextBaseline === NOW.toISOString());
  const empty = decideBaruMarkers([], BASELINE, NOW);
  check("daftar kosong → tanpa tanda", empty.baruIds.size === 0);
}

// ---------------------------------------------------------------------------
console.log("Case 4: kabel halaman Nilai Saya");
{
  const page = read("../app/murid/nilai/page.tsx");
  check("mengambil endpoint /murid/nilai", page.includes('"/murid/nilai"'));
  check("judul halaman Nilai Saya", page.includes("Nilai Saya"));
  check("keadaan kosong dengan kata-kata yang disepakati", page.includes("Belum ada nilai yang terbit. Nilai LKPD-mu akan muncul di sini sesudah dinilai guru."));
  check("kartu tertaut ke detail penugasan", page.includes("/murid/assignments/${row.assignment_id}"));
  check("label individu persis detail", page.includes("Nilai LKPD: {row.score}"));
  check("label kelompok persis detail", page.includes("Nilai kelompok: {row.group_score}"));
  check("label penyesuaian persis detail", page.includes("Nilaimu (disesuaikan guru): {row.score}"));
  check("penyesuaian hanya bila score_adjusted", page.includes("row.score_adjusted"));
  check("chip Baru dirender dari keputusan helper", page.includes("baruIds.has(row.assignment_id)") && page.includes(">Baru<"));
  check("baseline dibaca lalu dimajukan sesudah keputusan", page.includes("readNilaiSayaBaseline()") && page.includes("writeNilaiSayaBaseline(decision.nextBaseline)") && page.indexOf("decideBaruMarkers(") < page.indexOf("writeNilaiSayaBaseline(decision.nextBaseline)"));
  check("belum masuk → ke halaman login", page.includes('router.replace("/login")'));
}

// ---------------------------------------------------------------------------
console.log("Case 4b: rombak tampilan v1.0.64 — perona rentang + ringkasan + kabel halaman");
{
  check("rentang: 100 dan 80 hijau", gradeScoreTone(100) === "hijau" && gradeScoreTone(80) === "hijau");
  check("rentang: 79 dan 60 kuning", gradeScoreTone(79) === "kuning" && gradeScoreTone(60) === "kuning");
  check("rentang: 59 dan 0 merah", gradeScoreTone(59) === "merah" && gradeScoreTone(0) === "merah");

  const summary = summarizeGrades([{ score: 80 }, { score: 60 }, { score: 100 }]);
  check("ringkasan: hitungan = baris berskor", summary.count === 3);
  check("ringkasan: rata-rata nilai akhir", summary.average === 80);
  const decimal = summarizeGrades([{ score: 85 }, { score: 82 }]);
  check("ringkasan: rata-rata dibulatkan 1 desimal", decimal.average === 83.5);
  const withNull = summarizeGrades([{ score: 90 }, { score: null }]);
  check("ringkasan: baris tanpa skor dilewati", withNull.count === 1 && withNull.average === 90);
  const empty = summarizeGrades([]);
  check("ringkasan: kosong → count 0 + rata-rata null", empty.count === 0 && empty.average === null);

  const page = read("../app/murid/nilai/page.tsx");
  check("kepala hero memakai avatar terpasang (gagal-aman dari /murid/avatars)",
    page.includes('"/murid/avatars"') && page.includes("avatarImagePath(avatarSlug)") && page.includes("equipped_slug"));
  check("ringkasan hero dari helper murni", page.includes("summarizeGrades(rows)") && page.includes("summary.count") && page.includes("summary.average"));
  check("angka nilai akhir besar berona menurut rentang",
    page.includes("gradeScoreTone(row.score)") && page.includes("scoreToneStyles[tone]") && page.includes("Nilai akhir"));
  check("label ATP diturunkan dari judul modul via parseAtpCode (dihilangkan bila tak ada)",
    page.includes("parseAtpCode(row.module_title)") && page.includes("ATP {atpCode}"));
  check("komentar guru tampil sebagai gelembung kutipan",
    page.includes("row.teacher_comment") && page.includes("Komentar guru") && page.includes("commentBubble"));
  check("keadaan kosong bergaya pemberitahuan: ilustrasi besar + tombol kembali ke beranda",
    page.includes("NilaiIllustration") && page.includes("emptyPrimaryLink") && page.includes("Kembali ke beranda"));
}

// ---------------------------------------------------------------------------
console.log("Case 5: kabel titik penanda di beranda murid");
{
  const home = read("../app/murid/page.tsx");
  check("tautan Nilai Saya ada di beranda", home.includes('href="/murid/nilai"') && home.includes("Nilai Saya"));
  check("beranda mengambil endpoint nilai secara ringan", home.includes('apiRequest<NilaiDotResponse>("/murid/nilai")'));
  check("keputusan titik memakai helper + baseline tersimpan", home.includes("decideBaruMarkers(response.data.grades, readNilaiSayaBaseline(), new Date())"));
  check("titik dirender dari hasNewGrades", home.includes("hasNewGrades ?") && home.includes("Ada nilai baru"));
  check("beranda TIDAK memajukan baseline", !home.includes("writeNilaiSayaBaseline"));
  check("kegagalan ambil ditelan diam-diam (tautan tetap tanpa titik)", home.includes(".catch(() => undefined)"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
