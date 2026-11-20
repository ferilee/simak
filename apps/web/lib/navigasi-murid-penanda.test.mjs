// Static source test for the student-nav active marker "Pilihan B"
// (garis penanda atas, calon v1.0.82).
// Run with bun from apps/web:  bun lib/navigasi-murid-penanda.test.mjs
//
// The teacher found the bottom nav's active state hard to read (on
// several student pages it collapsed to a plain bold label, because the
// old style used --wizard-accent* variables that only resolve inside
// .wizard-theme-murid while the bar is also rendered on unthemed pages).
// Approved design B: the active item gets a 3.5px accent line attached
// to the TOP edge of the bar directly above the item (bottom corners
// rounded) plus blue icon + label (#0B64C8), no background fill and no
// filled icon circle; inactive items are untouched. The desktop side
// nav gets the vertical counterpart: a left-edge line + blue label.
// The line is absolutely positioned so layout never shifts: bottom-nav
// items are position: relative and sit 10px below the bar's top edge
// (the bar's padding-top), hence top: -10px on the ::before.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../app/globals.css"), "utf8");
const bottomNav = readFileSync(join(here, "../components/MuridBottomNav.tsx"), "utf8");
const muridPage = readFileSync(join(here, "../app/murid/page.tsx"), "utf8");

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

// Body of the first rule whose selector is exactly `selector` (the
// selector is matched together with its opening brace, so longer
// selectors sharing the prefix do not match).
function ruleBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return open >= 0 && close > open ? css.slice(open + 1, close) : "";
}

console.log("Navigasi murid penanda atas (Pilihan B) — tes statis sumber:");

// --- Bilah bawah: garis penanda atas pada butir aktif ---
const topLine = ruleBlock(".murid-bottom-nav-item.is-active::before");
check("aturan garis penanda atas butir aktif ditemukan", topLine.length > 0);
check(
  "garis terposisi absolut (tata letak tidak bergeser)",
  topLine.includes("position: absolute;"),
);
check(
  "jangkar garis top: -10px (menutup padding-top 10px bilah, menempel tepi atas)",
  topLine.includes("top: -10px;"),
);
check(
  "garis membentang 22%–78% lebar butir (left/right 22%)",
  topLine.includes("left: 22%;") && topLine.includes("right: 22%;"),
);
check("tinggi garis 3,5px", topLine.includes("height: 3.5px;"));
check(
  "ujung bawah garis membulat (border-radius: 0 0 4px 4px)",
  topLine.includes("border-radius: 0 0 4px 4px;"),
);
check("warna garis biru aksen #0B84F3", topLine.includes("background: #0B84F3;"));

// Jangkar hanya benar bila geometri dasarnya tidak berubah: padding-top
// bilah tetap 10px dan butir tetap position: relative setinggi 54px.
const barBase = ruleBlock(".murid-bottom-nav");
check(
  "padding bilah bawah tidak berubah (10px atas, jangkar garis tetap sah)",
  barBase.includes("padding: 10px 12px calc(10px + env(safe-area-inset-bottom));"),
);
const itemBase = ruleBlock(".murid-bottom-nav-item");
check(
  "butir bilah bawah tetap position: relative, min-height 54px",
  itemBase.includes("position: relative;") && itemBase.includes("min-height: 54px;"),
);

// --- Bilah bawah: warna aktif ikon + label ---
const bottomActive = ruleBlock(".murid-bottom-nav-item.is-active");
check(
  "ikon + label aktif biru #0B64C8",
  bottomActive.includes("color: #0B64C8;"),
);
check(
  "butir aktif tanpa isian latar (Pilihan B polos, bukan kapsul)",
  bottomActive.length > 0 && !bottomActive.includes("background"),
);
check(
  "gaya aktif lama berbasis variabel tema sudah hilang dari butir aktif",
  !bottomActive.includes("--wizard-accent"),
);
check(
  "lingkaran ikon terisi gaya lama sudah dihapus",
  !css.includes(".murid-bottom-nav-item.is-active .murid-bottom-nav-icon"),
);

// --- Bilah bawah: butir tak aktif tidak berubah ---
check(
  "butir tak aktif tetap abu-abu redup dan tebal seperti semula",
  itemBase.includes("color: var(--color-muted);") && itemBase.includes("font-weight: 700;"),
);
check(
  "tidak ada garis penanda untuk butir tak aktif",
  !css.includes(".murid-bottom-nav-item::before") &&
    count(css, ".murid-bottom-nav-item.is-active::before") === 1,
);

// --- Menu samping desktop: garis tepi kiri + label biru ---
const deskLink = ruleBlock(".murid-desktop-nav a");
check(
  "tautan samping kini position: relative (jangkar garis kiri)",
  deskLink.includes("position: relative;"),
);
check(
  "geometri tautan samping tidak berubah (padding 10px 12px, radius 10px)",
  deskLink.includes("padding: 10px 12px;") && deskLink.includes("border-radius: 10px;"),
);
const deskHover = ruleBlock(".murid-desktop-nav a:hover");
check(
  "hover samping tidak berubah (isian lembut + aksen gelap)",
  deskHover.includes("background: var(--wizard-accent-soft);") &&
    deskHover.includes("color: var(--wizard-accent-dark);"),
);
check(
  "pemilih gabungan hover/is-active lama sudah dipisah",
  !css.includes(".murid-desktop-nav a:hover,\n.murid-desktop-nav a.is-active"),
);
const deskActive = ruleBlock(".murid-desktop-nav a.is-active");
check("label aktif samping biru #0B64C8", deskActive.includes("color: #0B64C8;"));
check(
  "aktif samping tanpa isian latar (selaras Pilihan B)",
  deskActive.length > 0 && !deskActive.includes("background"),
);
const leftLine = ruleBlock(".murid-desktop-nav a.is-active::before");
check("aturan garis tepi kiri aktif samping ditemukan", leftLine.length > 0);
check(
  "garis kiri terposisi absolut di tepi kiri (left: 0, tata letak tetap)",
  leftLine.includes("position: absolute;") && leftLine.includes("left: 0;"),
);
check("lebar garis kiri 3,5px", leftLine.includes("width: 3.5px;"));
check(
  "garis kiri membentang 22%–78% tinggi tautan (top/bottom 22%)",
  leftLine.includes("top: 22%;") && leftLine.includes("bottom: 22%;"),
);
check(
  "ujung kanan garis kiri membulat (border-radius: 0 4px 4px 0)",
  leftLine.includes("border-radius: 0 4px 4px 0;"),
);
check("warna garis kiri biru aksen #0B84F3", leftLine.includes("background: #0B84F3;"));
check(
  "tidak ada garis tepi kiri untuk tautan tak aktif",
  !css.includes(".murid-desktop-nav a::before") &&
    count(css, ".murid-desktop-nav a.is-active::before") === 1,
);

// --- Semantik keadaan aktif (aksesibilitas) ---
check(
  "bilah bawah menandai aktif dengan aria-current=\"page\"",
  bottomNav.includes('aria-current={active === item.key ? "page" : undefined}'),
);
check(
  "kelas is-active bilah bawah tetap digerakkan prop active",
  bottomNav.includes('active === item.key ? " is-active" : ""'),
);
check(
  "kelima tautan samping menandai aktif dengan aria-current=\"page\"",
  count(muridPage, "aria-current={activeTab ===") === 5,
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
