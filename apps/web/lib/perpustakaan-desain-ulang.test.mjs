// Tests for the Perpustakaan Bersama visual redesign (bookstore-style):
// violet hero with universe stats, cover-first card grid, the "Populer"
// shelf derived from copy counts, typographic pastel covers, and the
// top-contributors sidebar. Run with bun from apps/web:
//   bun lib/perpustakaan-desain-ulang.test.mjs
//
// The redesign is presentation-only: every handler, endpoint, and label
// of the earlier phases must survive. The pure decisions (popular
// picking, cover determinism, stats chips, sidebar bars) are tested
// behaviorally; the page wiring is locked statically.
import { readFileSync } from "node:fs";
import {
  COVER_GRADIENTS,
  contributorBarPercent,
  coverGradient,
  coverGradientIndex,
  coverInitial,
  libraryStatsChips,
  pickPopular,
  salinanCountLabel,
  topContributors,
} from "./perpustakaan.ts";

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

const entry = (overrides) => ({
  kind: "module",
  id: 1,
  title: "Materi",
  subject: "Matematika",
  owner_name: "Feri Lee",
  shared_at: "2026-11-01T00:00:00.000Z",
  salinan_count: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Case 1 — pickPopular: threshold, ordering, limit, no input mutation.
// ---------------------------------------------------------------------------
{
  const entries = [
    entry({ id: 1, salinan_count: 0, shared_at: "2026-11-05T00:00:00.000Z" }),
    entry({ id: 2, salinan_count: 3, shared_at: "2026-11-02T00:00:00.000Z" }),
    entry({ id: 3, salinan_count: 7, shared_at: "2026-11-01T00:00:00.000Z" }),
    entry({ id: 4, salinan_count: 3, shared_at: "2026-11-04T00:00:00.000Z" }),
    entry({ id: 5, salinan_count: undefined, shared_at: "2026-11-05T00:00:00.000Z" }),
  ];
  const popular = pickPopular(entries);
  check("only entries copied at least once qualify (0 and missing excluded)",
    popular.map((item) => item.id).join(",") === "3,4,2", popular.map((item) => item.id).join(","));
  check("ordering: copy count DESC, ties by newest shared_at",
    popular[0].id === 3 && popular[1].id === 4 && popular[2].id === 2);
  check("input array is not mutated",
    entries.map((item) => item.id).join(",") === "1,2,3,4,5");
  const many = Array.from({ length: 12 }, (_, index) =>
    entry({ id: index + 1, salinan_count: 12 - index, shared_at: "2026-11-01T00:00:00.000Z" }));
  check("default limit is 8", pickPopular(many).length === 8);
  check("custom limit is honored", pickPopular(many, 3).length === 3);
  check("empty input → empty shelf", pickPopular([]).length === 0);
  check("nothing copied yet → empty shelf",
    pickPopular([entry({ id: 9, salinan_count: 0 })]).length === 0);
}

// ---------------------------------------------------------------------------
// Case 2 — Typographic covers: deterministic palette by (subject ?? title),
// big initial from the title.
// ---------------------------------------------------------------------------
{
  check("palette has at least 6 gradients", COVER_GRADIENTS.length >= 6, `got ${COVER_GRADIENTS.length}`);
  check("gradient index stays inside the palette",
    COVER_GRADIENTS[coverGradientIndex("Matematika")] !== undefined
    && COVER_GRADIENTS[coverGradientIndex("Koding dan Kecerdasan Artifisial (KKA)")] !== undefined
    && COVER_GRADIENTS[coverGradientIndex("")] !== undefined);
  check("same subject → same gradient even with different titles",
    coverGradient(entry({ subject: "Matematika", title: "Bunga Tunggal" }))
    === coverGradient(entry({ subject: "Matematika", title: "Limit Fungsi" })));
  check("null subject falls back to the title as the seed",
    coverGradient(entry({ subject: null, title: "LKPD Mandiri" }))
    === COVER_GRADIENTS[coverGradientIndex("LKPD Mandiri")]);
  check("different subjects can land on different gradients (palette actually varies)",
    new Set(["Matematika", "KKA", "Bahasa Inggris", "Fisika", "Kimia", "Biologi", "Sejarah", "Informatika"]
      .map((subject) => coverGradientIndex(subject))).size >= 3);
  check("initial is the first title letter, uppercased", coverInitial("bunga tunggal") === "B");
  check("initial trims leading spaces", coverInitial("  lkpd 1.1") === "L");
  check("empty title falls back to '?'", coverInitial("") === "?" && coverInitial("   ") === "?");
}

// ---------------------------------------------------------------------------
// Case 3 — Hero stats chips + salinan label + sidebar helpers.
// ---------------------------------------------------------------------------
{
  check("hero chips carry the three universe stats in order",
    JSON.stringify(libraryStatsChips({ total_items: 12, total_kontributor: 4, sudah_disalin_count: 3 }))
    === JSON.stringify(["12 materi dibagikan", "4 kontributor", "3 sudah kamu salin"]));
  check("salinan label appears only when copies exist",
    salinanCountLabel(entry({ salinan_count: 2 })) === "Disalin 2 kali"
    && salinanCountLabel(entry({ salinan_count: 0 })) === null
    && salinanCountLabel(entry({ salinan_count: undefined })) === null);

  const contributors = [
    { teacher_id: 7, name: "Feri Lee", modul_count: 3, lkpd_count: 2, total: 5 },
    { teacher_id: 9, name: "Ani", modul_count: 0, lkpd_count: 3, total: 3 },
    { teacher_id: 2, name: "Budi", modul_count: 1, lkpd_count: 1, total: 2 },
    { teacher_id: 3, name: "Citra", modul_count: 1, lkpd_count: 0, total: 1 },
    { teacher_id: 4, name: "Dedi", modul_count: 0, lkpd_count: 1, total: 1 },
    { teacher_id: 5, name: "Eka", modul_count: 1, lkpd_count: 0, total: 1 },
  ];
  check("sidebar takes the top 5 contributors", topContributors(contributors).length === 5
    && topContributors(contributors)[4].teacher_id === 4);
  check("bar width is relative to the top contributor",
    contributorBarPercent(contributors[0], 5) === 100 && contributorBarPercent(contributors[1], 5) === 60);
  check("bar width guards a zero top total", contributorBarPercent(contributors[0], 0) === 0);
}

// ---------------------------------------------------------------------------
// Case 4 — Page wiring (static locks): hero, shell, shelf, covers,
// sidebar — and every pre-existing handler/label intact.
// ---------------------------------------------------------------------------
{
  const page = read("../app/guru/perpustakaan/page.tsx");
  const css = read("../app/globals.css");
  const lib = read("./perpustakaan.ts");

  check("lib types carry the redesign fields",
    lib.includes("salinan_count?: number") && lib.includes("cover_key?: string | null")
    && lib.includes("type LibraryStats"));

  check("hero renders with the illustration and the greeting from /auth/me",
    page.includes("styles.hero") && page.includes("function BooksIllustration")
    && page.includes("Halo, {teacherName}")
    && page.includes('setTeacherName(me.user.display_name ?? me.user.name ?? "")'));
  check("hero illustration is decorative and asset-free",
    page.includes('aria-hidden="true"') && page.includes("viewBox=\"0 0 220 150\""));
  check("hero stat chips come from the response stats meta",
    page.includes("setStats(response.stats ?? null)") && page.includes("libraryStatsChips(stats)")
    && page.includes("stats?: LibraryStats"));

  check("two-column shell wraps content + sidebar",
    page.includes('className="library-shell"') && page.includes("styles.sidebar")
    && css.includes(".library-shell") && css.includes("minmax(0, 1fr) 300px")
    && css.includes("@media (min-width: 1024px)"));
  check("card grid is a responsive stylesheet grid",
    page.includes('className="library-card-grid"') && css.includes(".library-card-grid")
    && css.includes("repeat(2, minmax(0, 1fr))") && css.includes("repeat(3, minmax(0, 1fr))")
    && css.includes("repeat(4, minmax(0, 1fr))") && css.includes(".library-clamp-2"));

  check("Populer shelf derives from the current entries and hides during search",
    page.includes("Populer — paling sering disalin")
    && page.includes('entries !== null && query.trim() === "" ? pickPopular(entries) : []')
    && page.includes("popularEntries.length >= 2")
    && page.includes('className="library-shelf"') && css.includes(".library-shelf"));
  check("shelf cards open the same preview and show the copy count",
    page.includes("disalin {entry.salinan_count ?? 0} kali")
    && page.includes("key={`populer-${entry.kind}:${entry.id}`}"));

  check("covers resolve module images through the shared download mechanism",
    page.includes("function LibraryCoverArt")
    && page.includes("/uploads/download?moduleId=${entry.id}&key=${encodeURIComponent(coverKey)}")
    && page.includes("background: coverGradient(entry)")
    && page.includes("coverInitial(entry.title)"));
  check("shelf reuses the compact cover", page.includes("<LibraryCoverArt entry={entry} compact />"));

  check("sidebar lists top contributors with bars that select the filter",
    page.includes("Kontributor teratas") && page.includes("topContributors(contributors)")
    && page.includes("contributorBarPercent(contributor, topTotal)")
    && page.includes("{contributor.total} dibagikan"));
  check("approver sidebar card anchors to the untouched queue section",
    page.includes("Lihat antrean") && page.includes('href="#antrean-persetujuan"')
    && page.includes('id="antrean-persetujuan"'));

  check("card meta appends the salinan count beside the shared date",
    page.includes("salinanCountLabel(entry)")
    && page.includes('[sharedLabel, salinanLabel].filter(Boolean).join(" · ")'));

  check("all pre-existing handlers survive the redesign",
    page.includes("async function openPreview(entry: LibraryEntry)")
    && page.includes("async function copyEntry(entry: LibraryEntry)")
    && page.includes("async function decideApproval(entry: ApprovalEntry")
    && page.includes("async function tarikEntry(entry: LibraryEntry)")
    && page.includes("confirmDialog(copyConfirmText(entry)")
    && page.includes("`/library/modules/${entry.id}/copy`")
    && page.includes("`/library/worksheets/${entry.id}/copy`"));
  check("empty states are unchanged",
    page.includes("Belum ada materi yang dibagikan guru lain.")
    && page.includes("Tidak ada materi atau LKPD yang cocok dengan pencarian ini."));
}

console.log(`\nperpustakaan-desain-ulang (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
