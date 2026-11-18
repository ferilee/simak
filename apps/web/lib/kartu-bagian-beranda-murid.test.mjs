// Tests for the murid home section cards in the NAVIGATION era
// (v1.0.76): the "Kelas saya" (Dashboard) step carries exactly TWO
// identity cards — Kelas saya and Progres belajar — each with its
// own icon colour so students stop skipping them. Run with bun
// from apps/web:
//   bun lib/kartu-bagian-beranda-murid.test.mjs
//
// Design history locked here:
//  - v1.0.74 gave the step FOUR identity cards (Kelas saya, Progres
//    belajar, Asesmen RUAS, Jurnal belajar).
//  - v1.0.76 (commit 5a13f69, "add student app navigation") REMOVED
//    the Asesmen RUAS and Jurnal belajar cards from the home step:
//    Jurnal belajar became a first-class navigation destination
//    (MuridBottomNav + desktop menu), assessment status/scores live
//    as lines inside the Progres chains, and the RUAS handoff lives
//    on the assignment detail page. Mas Ferilee confirmed the
//    removal was INTENTIONAL (18 Nov 2026) — the old four-card
//    guarantees are therefore retired EXPLICITLY below (labelled
//    PENSIUN), never silently dropped, and each retired guarantee
//    has its replacement locked in the suite that owns the new home
//    (hub-murid for the handoff + chain assessment lines, jurnal
//    for the journal destination, tab-murid for the navigation).
//
// Locked here:
//  - The surviving chip helpers (lib/beranda-murid.ts) are pure:
//    Kelas shows "N kelas", Progres shows the XP total (no chip
//    before XP loads). The retired assessment/journal chip helpers
//    are gone from the lib (cleaned up with the cards).
//  - The murid page wraps exactly the two surviving sections in
//    cards with per-section icon tones, keeps the literal <h3>
//    titles, feeds every chip through the helpers, keeps the
//    surviving section action (Gabung kelas), and does NOT render
//    the retired cards, titles, actions, or empty states anymore.
//  - globals.css defines the card shell (white surface, large
//    radius, card shadow), the two surviving icon colours, and the
//    chip tones — the retired cards' icon colours are gone, and
//    guru markup never uses the card classes.
import { readFileSync } from "node:fs";
import { kelasChip, progresChip } from "./beranda-murid.ts";

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
const beranda = read("./beranda-murid.ts");

// ---------------------------------------------------------------------------
// Case 1 — Chip helpers (pure): the two surviving chips.
// ---------------------------------------------------------------------------
{
  check("kelas chip: 0 kelas", JSON.stringify(kelasChip(0)) === JSON.stringify({ label: "0 kelas", tone: "neutral" }));
  check("kelas chip: N kelas", kelasChip(3).label === "3 kelas");

  check("progres chip: tanpa ringkasan XP → tanpa chip", progresChip(null) === null);
  check("progres chip: 0 XP tetap tampil", JSON.stringify(progresChip(0)) === JSON.stringify({ label: "0 XP", tone: "neutral" }));
  check("progres chip: total XP apa adanya", progresChip(120).label === "120 XP");

  // PENSIUN v1.0.76 — the Asesmen RUAS and Jurnal belajar cards are
  // gone from the home step, so their chip helpers (and the waiting
  // counter that only fed the assessment chip) are retired with
  // them; nothing in the lib may still export them.
  check("PENSIUN v1.0.76: helper chip asesmen/jurnal + penghitung menunggu tidak lagi diekspor lib beranda",
    !beranda.includes("asesmenChip") && !beranda.includes("jurnalChip") && !beranda.includes("countWaitingAssessments"));
}

// ---------------------------------------------------------------------------
// Case 2 — Page wiring: exactly two identity cards, literal titles,
// chips, surviving actions; the retired cards stay retired.
// ---------------------------------------------------------------------------
{
  check("page derives the surviving chips through the pure helpers",
    murid.includes('from "../../lib/beranda-murid"')
    && murid.includes("kelasChip(data.classes.length)")
    && murid.includes("progresChip(data.xp?.total ?? null)"));
  check("PENSIUN v1.0.76: page no longer derives asesmen/jurnal chips",
    !murid.includes("asesmenChip(") && !murid.includes("jurnalChip("));
  check("chips render through the shared pill (null renders nothing)",
    murid.includes("function MuridSectionChipPill") && murid.includes("if (!chip) return null")
    && (murid.match(/<MuridSectionChipPill chip=\{/g) ?? []).length === 2);

  check("exactly two murid home cards wrap the step-0 sections",
    (murid.match(/className="murid-home-card murid-home-card--/g) ?? []).length === 2,
    `found ${(murid.match(/className="murid-home-card murid-home-card--/g) ?? []).length}`);
  check("each surviving card carries its identity modifier",
    murid.includes('className="murid-home-card murid-home-card--kelas"')
    && murid.includes('className="murid-home-card murid-home-card--progres"'));
  check("PENSIUN v1.0.76: kartu Asesmen RUAS + Jurnal belajar tidak dirender lagi di beranda",
    !murid.includes('murid-home-card--asesmen') && !murid.includes('murid-home-card--jurnal'));
  check("each card head carries its coloured icon circle",
    murid.includes('murid-home-card-icon murid-home-card-icon--kelas')
    && murid.includes('murid-home-card-icon murid-home-card-icon--progres'));
  check("icons are decorative (aria-hidden) inline SVGs in the app icon style",
    (murid.match(/murid-home-card-icon murid-home-card-icon--[a-z]+" aria-hidden="true"/g) ?? []).length === 2
    && murid.includes('stroke="currentColor" strokeWidth="2"'));

  check("literal section titles stay as <h3> inside the cards",
    murid.includes("<h3>Kelas saya</h3>") && murid.includes("<h3>Progres belajar</h3>"));
  check("PENSIUN v1.0.76: judul kartu Asesmen/Jurnal tidak lagi tampil sebagai <h3> di beranda",
    !murid.includes("<h3>Asesmen RUAS</h3>") && !murid.includes("<h3>Jurnal belajar</h3>"));
  check("surviving section action stays in the card head (Gabung kelas)",
    murid.includes("+ Gabung kelas"));
  check("PENSIUN v1.0.76: aksi kartu lama (Buka RUAS / Buka jurnal) tidak lagi ada di beranda",
    !murid.includes("Buka RUAS") && !murid.includes("Buka jurnal"));
  check("empty states stay inside their cards (unchanged copy)",
    murid.includes("Belum ada kelas. Masukkan kode kelas dari guru untuk bergabung.")
    && murid.includes("Belum ada rangkaian materi yang berjalan."));
  check("PENSIUN v1.0.76: keadaan kosong kartu Asesmen/Jurnal tidak lagi ada di beranda",
    !murid.includes("Belum ada asesmen RUAS yang terpetakan ke penugasanmu.")
    && !murid.includes("Tulis refleksi belajarmu:"));
  check("no old flat section shell remains on the murid home step 0",
    !murid.includes('className="dashboard-section wizard-inner-section"'));
}

// ---------------------------------------------------------------------------
// Case 3 — CSS: card shell, surviving icon colours, chip tones;
// guru untouched; the retired cards' colours are gone.
// ---------------------------------------------------------------------------
{
  const cardAt = css.indexOf(".murid-home-card {");
  const cardRule = css.slice(cardAt, cardAt + 320);
  check("card shell: white surface, large radius, card shadow",
    cardAt !== -1 && cardRule.includes("background: var(--color-surface)")
    && cardRule.includes("border-radius: var(--radius-lg)")
    && cardRule.includes("box-shadow: var(--shadow-card)"));

  check("icon colours: biru kelas, kuning emas progres",
    css.includes(".murid-home-card-icon--kelas {\n  background: var(--color-brand-50);\n  color: var(--color-brand-700);\n}")
    && css.includes(".murid-home-card-icon--progres {\n  background: #fff3d6;\n  color: #9a6200;\n}"));
  check("PENSIUN v1.0.76: warna ikon kartu Asesmen (ungu) + Jurnal (hijau) tidak lagi didefinisikan",
    !css.includes(".murid-home-card-icon--asesmen") && !css.includes(".murid-home-card-icon--jurnal"));
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
