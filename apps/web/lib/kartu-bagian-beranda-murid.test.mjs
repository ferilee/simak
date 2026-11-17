// Tests for the murid home section cards (calon v1.0.74): the four
// sections of the "Kelas saya" step — Kelas saya, Progres belajar,
// Asesmen RUAS, Jurnal belajar — each becomes an identity card with
// its own icon colour so students stop skipping them. Run with bun
// from apps/web:
//   bun lib/kartu-bagian-beranda-murid.test.mjs
//
// Locked here:
//  - The chip helpers (lib/beranda-murid.ts) are pure: Kelas shows
//    "N kelas", Progres shows the XP total (no chip before XP
//    loads), Asesmen shows an accented "N menunggu" while any
//    mapped assessment is unfinished, "Semua selesai" when all are
//    finished, "0 terpetakan" when none are mapped, and no chip
//    while the bridge is unloaded/inactive; Jurnal shows "N entri"
//    (no chip before the summary loads).
//  - The murid page wraps exactly those four sections in cards with
//    per-section icon tones, keeps the literal <h3> titles, feeds
//    every chip through the helpers, and keeps each section's own
//    action (Gabung kelas / Buka RUAS / Buka jurnal).
//  - globals.css defines the card shell (white surface, large
//    radius, card shadow), the four icon colours, and the chip
//    tones — guru markup never uses the card classes.
import { readFileSync } from "node:fs";
import { asesmenChip, countWaitingAssessments, jurnalChip, kelasChip, progresChip } from "./beranda-murid.ts";

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
const murid = read("../app/murid/page.tsx");
const guru = read("../app/guru/page.tsx");
const css = read("../app/globals.css");

const kartu = (status) => ({ topic_id: 1, subject_id: null, title: "Topik", status, score: null, finished_at: null, assignment_id: 1, assignment_title: "Tugas" });
const hubDengan = (assessments, available = true) => ({ available, assessments, progress: [] });

// ---------------------------------------------------------------------------
// Case 1 — Chip helpers (pure).
// ---------------------------------------------------------------------------
{
  check("kelas chip: 0 kelas", JSON.stringify(kelasChip(0)) === JSON.stringify({ label: "0 kelas", tone: "neutral" }));
  check("kelas chip: N kelas", kelasChip(3).label === "3 kelas");

  check("progres chip: tanpa ringkasan XP → tanpa chip", progresChip(null) === null);
  check("progres chip: 0 XP tetap tampil", JSON.stringify(progresChip(0)) === JSON.stringify({ label: "0 XP", tone: "neutral" }));
  check("progres chip: total XP apa adanya", progresChip(120).label === "120 XP");

  check("hitung menunggu: belum mulai + sedang berjalan",
    countWaitingAssessments([kartu("not_started"), kartu("in_progress"), kartu("finished")]) === 2);
  check("hitung menunggu: semua selesai → 0", countWaitingAssessments([kartu("finished")]) === 0);
  check("hitung menunggu: daftar kosong → 0", countWaitingAssessments([]) === 0);

  check("asesmen chip: hub belum termuat → tanpa chip", asesmenChip(null) === null);
  check("asesmen chip: jembatan belum aktif → tanpa chip", asesmenChip(hubDengan([kartu("not_started")], false)) === null);
  check("asesmen chip: ada yang menunggu → 'N menunggu' beraksen",
    JSON.stringify(asesmenChip(hubDengan([kartu("not_started"), kartu("in_progress"), kartu("finished")])))
    === JSON.stringify({ label: "2 menunggu", tone: "accent" }));
  check("asesmen chip: satu menunggu tetap beraksen",
    asesmenChip(hubDengan([kartu("in_progress")]))?.label === "1 menunggu");
  check("asesmen chip: semua selesai → nada done",
    JSON.stringify(asesmenChip(hubDengan([kartu("finished"), kartu("finished")])))
    === JSON.stringify({ label: "Semua selesai", tone: "done" }));
  check("asesmen chip: belum ada pemetaan → '0 terpetakan' netral",
    JSON.stringify(asesmenChip(hubDengan([]))) === JSON.stringify({ label: "0 terpetakan", tone: "neutral" }));

  check("jurnal chip: ringkasan belum termuat → tanpa chip", jurnalChip(null) === null);
  check("jurnal chip: 0 entri tetap tampil", JSON.stringify(jurnalChip(0)) === JSON.stringify({ label: "0 entri", tone: "neutral" }));
  check("jurnal chip: N entri", jurnalChip(7).label === "7 entri");
}

// ---------------------------------------------------------------------------
// Case 2 — Page wiring: four identity cards, literal titles, chips, actions.
// ---------------------------------------------------------------------------
{
  check("page derives every chip through the pure helpers",
    murid.includes('from "../../lib/beranda-murid"')
    && murid.includes("kelasChip(data.classes.length)")
    && murid.includes("progresChip(data.xp?.total ?? null)")
    && murid.includes("asesmenChip(hub)")
    && murid.includes("jurnalChip(journal?.total ?? null)"));
  check("chips render through the shared pill (null renders nothing)",
    murid.includes("function MuridSectionChipPill") && murid.includes("if (!chip) return null")
    && (murid.match(/<MuridSectionChipPill chip=\{/g) ?? []).length === 4);

  check("exactly four murid home cards wrap the step-0 sections",
    (murid.match(/className="murid-home-card murid-home-card--/g) ?? []).length === 4,
    `found ${(murid.match(/className="murid-home-card murid-home-card--/g) ?? []).length}`);
  check("each card carries its identity modifier",
    murid.includes('className="murid-home-card murid-home-card--kelas"')
    && murid.includes('className="murid-home-card murid-home-card--progres"')
    && murid.includes('className="murid-home-card murid-home-card--asesmen"')
    && murid.includes('className="murid-home-card murid-home-card--jurnal"'));
  check("each card head carries its coloured icon circle",
    murid.includes('murid-home-card-icon murid-home-card-icon--kelas')
    && murid.includes('murid-home-card-icon murid-home-card-icon--progres')
    && murid.includes('murid-home-card-icon murid-home-card-icon--asesmen')
    && murid.includes('murid-home-card-icon murid-home-card-icon--jurnal'));
  check("icons are decorative (aria-hidden) inline SVGs in the app icon style",
    (murid.match(/murid-home-card-icon murid-home-card-icon--[a-z]+" aria-hidden="true"/g) ?? []).length === 4
    && murid.includes('stroke="currentColor" strokeWidth="2"'));

  check("literal section titles stay as <h3> inside the cards",
    murid.includes("<h3>Kelas saya</h3>") && murid.includes("<h3>Progres belajar</h3>")
    && murid.includes("<h3>Asesmen RUAS</h3>") && murid.includes("<h3>Jurnal belajar</h3>"));
  check("section actions stay in the card heads",
    murid.includes("+ Gabung kelas") && murid.includes("Buka RUAS") && murid.includes("Buka jurnal"));
  check("empty states stay inside their cards (unchanged copy)",
    murid.includes("Belum ada kelas. Masukkan kode kelas dari guru untuk bergabung.")
    && murid.includes("Belum ada rangkaian materi yang berjalan.")
    && murid.includes("Belum ada asesmen RUAS yang terpetakan ke penugasanmu.")
    && murid.includes("Tulis refleksi belajarmu:"));
  check("no old flat section shell remains on the murid home step 0",
    !murid.includes('className="dashboard-section wizard-inner-section"'));
}

// ---------------------------------------------------------------------------
// Case 3 — CSS: card shell, icon colours, chip tones; guru untouched.
// ---------------------------------------------------------------------------
{
  const cardAt = css.indexOf(".murid-home-card {");
  const cardRule = css.slice(cardAt, cardAt + 320);
  check("card shell: white surface, large radius, card shadow",
    cardAt !== -1 && cardRule.includes("background: var(--color-surface)")
    && cardRule.includes("border-radius: var(--radius-lg)")
    && cardRule.includes("box-shadow: var(--shadow-card)"));

  check("icon colours: biru kelas, kuning emas progres, ungu asesmen, hijau jurnal",
    css.includes(".murid-home-card-icon--kelas {\n  background: var(--color-brand-50);\n  color: var(--color-brand-700);\n}")
    && css.includes(".murid-home-card-icon--progres {\n  background: #fff3d6;\n  color: #9a6200;\n}")
    && css.includes(".murid-home-card-icon--asesmen {\n  background: #f4f3ff;\n  color: #6941c6;\n}")
    && css.includes(".murid-home-card-icon--jurnal {\n  background: var(--color-success-surface);\n  color: var(--color-success);\n}"));
  check("card titles are larger than the old inner-section h3 (1.35rem)",
    css.includes(".murid-home-card-titles h3 {\n  margin: 0;\n  font-size: 1.35rem;"));
  check("chip tones: accent menunggu (amber) + done (hijau)",
    css.includes(".murid-home-chip--accent {\n  border-color: #fedf89;\n  background: #fffaeb;\n  color: #b54708;\n}")
    && css.includes(".murid-home-chip--done {\n  border-color: #a6f4c5;\n  background: #ecfdf3;\n  color: #027a48;\n}"));
  check("guru markup never uses the murid home cards",
    !guru.includes("murid-home-card") && !guru.includes("MuridSectionChipPill"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
