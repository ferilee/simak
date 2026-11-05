// Static source test for the tidy Step-5 hub + class filter (v1.0.28).
// Run with bun from apps/web:  bun lib/pantau-hasil-rapi.test.mjs
//
// Two approved changes on the teacher page's Step 5 ("Pantau hasil"):
// (A) Pengumpulan LKPD gains a class filter — the API attaches class_id /
//     class_name to every attempt in BOTH list sources, the panel filters
//     source → class → status, counts are computed after the class filter,
//     and each attempt card shows its class name.
// (B) The five stacked Step-5 sections become a tabbed hub: a sticky tab
//     bar (Nilai · Rekap · Rentang · Impor · Integritas) with count badges
//     on Nilai (ungraded queue) and Integritas (alerts); exactly one
//     section is visible per tab via data-active.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");
const apiRoot = join(here, "../../../apps/api/src");
const gradingApi = readFileSync(join(apiRoot, "routes/grading.ts"), "utf8");
const worksheetsApi = readFileSync(join(apiRoot, "routes/worksheets.ts"), "utf8");
const studentClass = readFileSync(join(apiRoot, "lib/student-class.ts"), "utf8");

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

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

console.log("Pantau hasil rapi — tes statis sumber:");

console.log("A. API: kelas menempel pada kedua sumber daftar");
check(
  "endpoint gabungan /grading/attempts memuat class_id + class_name",
  gradingApi.includes("class_id: studentClass?.id ?? null") && gradingApi.includes("class_name: studentClass?.name ?? null"),
);
check(
  "endpoint per-LKPD /worksheets/:id/attempts memuat class_id + class_name",
  worksheetsApi.includes("class_id: studentClass?.id ?? null") && worksheetsApi.includes("class_name: studentClass?.name ?? null"),
);
check(
  "kedua endpoint memakai helper bersama lib/student-class",
  gradingApi.includes('from "../lib/student-class"') && worksheetsApi.includes('from "../lib/student-class"'),
);
check(
  "helper memuat keanggotaan sekali (tanpa N+1) dan mengecualikan kelas arsip",
  studentClass.includes("loadTeacherClassMemberships") && studentClass.includes("eq(classes.isArchived, false)") &&
    count(studentClass, "classMembers") >= 1 && studentClass.includes("resolveStudentClass"),
);
check(
  "mapel LKPD berasal dari modul induk (gabungan: leftJoin modules; per-LKPD: muat modul)",
  gradingApi.includes(".leftJoin(modules, eq(modules.id, worksheets.moduleId))") && worksheetsApi.includes("modules.subject"),
);

console.log("B. Panel: saringan kelas (sumber → kelas → status)");
check(
  "tipe attempt web membawa class_id + class_name",
  page.includes("class_id: number | null;") && page.includes("class_name: string | null;"),
);
check(
  "pemilih kelas ada dengan label aksesibel dan opsi dari sumber aktif",
  page.includes('aria-label="Saring kelas pengumpulan"') && page.includes("gradingClassOptions.map((option)") &&
    page.includes('<option value="semua">Semua kelas</option>'),
);
check(
  "hitungan dihitung sesudah saringan kelas",
  page.includes("const gradingCounts = countGradingAttempts(classFilteredAttempts);") &&
    page.includes("filterGradingAttemptsByClass(gradingAttempts, gradingClassFilterActive)"),
);
check(
  "pilihan kelas kedaluwarsa berlaku sebagai semua (tanpa menghapus pilihan tersimpan)",
  page.includes('? gradingClassFilter\n    : "semua";') || page.includes(': "semua";'),
);
check(
  "lompat otomatis penilaian juga melewati saringan kelas",
  page.includes(".filter((attempt) => matchesGradingClassFilter(attempt, gradingClassFilterActive))"),
);
check(
  "kartu attempt menampilkan nama kelas / Tanpa kelas pada baris meta",
  page.includes('{attempt.username} · {attempt.status} · {attempt.class_name ?? "Tanpa kelas"}'),
);

console.log("C. Hub bertab Langkah 5");
check(
  "state tab bawaan nilai",
  page.includes('const [hasilTab, setHasilTab] = useState<HasilTab>("nilai");') &&
    page.includes('type HasilTab = "nilai" | "rekap" | "rentang" | "impor" | "integritas";'),
);
check(
  "bilah tab hanya dirender pada Langkah 5",
  page.includes('{langkahTampil && guruStep === 4 ? (') && page.includes('<nav className="hasil-tabs" aria-label="Bagian pantau hasil">'),
);
const tabOrder = ['{ key: "nilai"', '{ key: "rekap"', '{ key: "rentang"', '{ key: "impor"', '{ key: "integritas"']
  .map((needle) => page.indexOf(needle));
check(
  "urutan tab: Nilai, Rekap, Rentang, Impor, Integritas",
  tabOrder.every((pos) => pos >= 0) && tabOrder.every((pos, i) => i === 0 || pos > tabOrder[i - 1]),
  JSON.stringify(tabOrder),
);
check(
  "lencana Nilai dari antrean belum dinilai data gabungan; Integritas dari jumlah peringatan",
  page.includes('{ key: "nilai", label: "Nilai", badge: ungradedBadgeCount }') &&
    page.includes('{ key: "integritas", label: "Integritas", badge: integrityAlerts.length }') &&
    page.includes("const ungradedBadgeCount = allAttempts.filter(isUngradedAttempt).length;") &&
    page.includes("{tab.badge > 0 ? <span className=\"hasil-tab-badge\">{tab.badge}</span> : null}"),
);
check(
  "tab aktif tertandai aria-pressed + kelas is-active",
  page.includes('aria-pressed={hasilTab === tab.key}') && page.includes('className={`hasil-tab${hasilTab === tab.key ? " is-active" : ""}`}'),
);
check(
  "setiap seksi Langkah 5 terikat tabnya (integritas/rentang/impor 1x, rekap 3x, nilai 1x)",
  count(page, 'data-active={langkahTampil && guruStep === 4 && hasilTab === "integritas"}') === 1 &&
    count(page, 'data-active={langkahTampil && guruStep === 4 && hasilTab === "rentang"}') === 1 &&
    count(page, 'data-active={langkahTampil && guruStep === 4 && hasilTab === "impor"}') === 1 &&
    count(page, 'data-active={langkahTampil && guruStep === 4 && hasilTab === "rekap"}') === 3 &&
    count(page, 'data-active={langkahTampil && guruStep === 4 && hasilTab === "nilai"}') === 1,
);
check(
  "tidak ada lagi seksi Langkah 5 tanpa syarat tab",
  !page.includes('data-active={guruStep === 4}'),
);
check(
  "pemicu Rekap sesi / exit ticket tidak berubah (tetap di seksi Rekap)",
  page.includes("onClick={() => void loadSessionReport(assignment.id)}") && page.includes("onClick={() => void loadAssignmentSummary(assignment.id)}"),
);

console.log("D2. Saringan indikasi integritas (semua di klien)");
check(
  "pemilih penugasan + pencarian murid + hitungan tampil",
  page.includes('aria-label="Saring penugasan indikasi integritas"') &&
    page.includes('aria-label="Cari murid pada indikasi integritas"') &&
    page.includes("Menampilkan {visibleIntegrityAlerts.length} dari {integrityAlerts.length} siswa"),
);
check(
  "chip risiko memakai nilai risiko API (perlu_ditinjau / peringatan)",
  page.includes('{ value: "perlu_ditinjau", label: "Perlu ditinjau" }') &&
    page.includes('{ value: "peringatan", label: "Peringatan" }') &&
    page.includes("integrityRiskFilter === option.value"),
);
check(
  "daftar indikasi dirender dari hasil saring + urut tingkat (bukan urutan API)",
  page.includes("const visibleIntegrityAlerts = sortIntegrityAlerts(filterIntegrityAlerts(integrityAlerts, {") &&
    page.includes("{visibleIntegrityAlerts.map((alert) => (") &&
    !page.includes("{integrityAlerts.map((alert) => ("),
);
check(
  "keadaan kosong hasil saringan indikasi punya pesan sendiri",
  page.includes("Tidak ada siswa yang cocok dengan saringan ini."),
);

console.log("D3. Pencarian Rekap penugasan");
check(
  "kotak pencarian rekap + daftar dari hasil pencarian",
  page.includes('aria-label="Cari penugasan pada rekap"') &&
    page.includes("const visibleRekapAssignments = filterAssignmentsByQuery(assignments, rekapQuery);") &&
    page.includes("{visibleRekapAssignments.map((assignment) =>"),
);
check(
  "keadaan kosong pencarian rekap persis seperti disetujui",
  page.includes("Tidak ada penugasan yang cocok dengan pencarian."),
);
check(
  "ringkasan menampilkan hitungan hasil saat mencari",
  page.includes("`${visibleRekapAssignments.length} dari ${assignments.length} penugasan"),
);

console.log("D4. Tampilkan bertahap Pengumpulan + baris saringan lengket");
check(
  "daftar dirender sebanyak jumlah yang dibuka (slice)",
  page.includes("{visibleGradingAttempts.slice(0, gradingRevealedCount).map((attempt) => ("),
);
check(
  "kaki daftar: hitungan tampil + tombol Tampilkan lebih banyak",
  page.includes("Menampilkan {revealedSliceCount(visibleGradingAttempts.length, gradingRevealedCount)} dari {visibleGradingAttempts.length} pengumpulan") &&
    page.includes(">Tampilkan lebih banyak</button>"),
);
check(
  "jumlah dibuka diatur ulang saat sumber/kelas/status berubah",
  page.includes("}, [gradingSource, gradingClassFilterActive, gradingStatusFilter]);") &&
    page.includes("const [gradingRevealedCount, setGradingRevealedCount] = useState(GRADING_PAGE_SIZE);"),
);
check(
  "lompat otomatis memperluas tampilan sampai target terlihat",
  page.includes("if (nextIndex >= gradingRevealedCount) {") && page.includes("setGradingRevealedCount(revealedCountForIndex(nextIndex));"),
);
check(
  "baris saringan dibungkus wadah lengket; CSS-nya lengket di bawah bilah tab",
  page.includes('<div className="grading-sticky-controls">') &&
    /\.grading-sticky-controls \{\s*position: sticky;\s*top: 78px;/.test(css),
);

console.log("D. CSS bilah tab");
check(
  ".hasil-tabs lengket, bisa digeser menyamping, tanpa scrollbar tampak",
  /\.hasil-tabs \{\s*position: sticky;\s*top: 12px;[^}]*overflow-x: auto;/.test(css) && css.includes(".hasil-tabs::-webkit-scrollbar"),
);
check(
  ".hasil-tab memakai aksen wizard; aktif terisi #175cd3 teks putih",
  /\.hasil-tab \{[^}]*background: var\(--wizard-accent-soft\);[^}]*color: var\(--wizard-accent-dark\);/.test(css) &&
    /\.hasil-tab\.is-active \{\s*border-color: #175cd3;\s*background: #175cd3;\s*color: #ffffff;/.test(css),
);
check(
  "lencana tab berupa pil merah kecil",
  /\.hasil-tab-badge \{[^}]*border-radius: 999px;[^}]*background: #b42318;/.test(css),
);
check(
  "panel Langkah 5 punya scroll-margin agar tak tertutup bilah lengket",
  css.includes(".guru-content > .hasil-tabs ~ section"),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
