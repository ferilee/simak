// Static source test for the tidy content-row action bar (v1.0.26).
// Run with bun from apps/web:  bun lib/baris-aksi-rapi.test.mjs
//
// On phones the four text buttons of a content row (module blocks and
// worksheet items) squeezed the text column until the block label
// truncated and the snippet hid behind the buttons. The approved fix:
// desktop markup gains an icon span per button (hidden on desktop) and a
// soft danger tint on Hapus; inside the existing max-width: 760px block
// the row becomes one column and the buttons turn into a 4-column bar
// (icon above a mini label) under the full-width text. Handlers and all
// other .module-row-action usages must stay untouched.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");

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

console.log("Baris aksi rapi — tes statis sumber:");

// Markup: both lists (blocks + worksheet items) get the four icon spans.
// Panah Naik/Turun hanya dipakai kedua daftar ini, jadi hitungan mentahnya
// tetap 2x. Ikon Edit/Hapus kini juga dipakai tombol lain di luar bar aksi
// isi (paket ikon-tombol-guru: Edit modul/LKPD, Hapus kartu, Hapus sampul),
// jadi untuk kedua glif itu hitungannya dilingkupkan ke tombol editor
// blok + butir yang memang dilindungi suite ini — maksud aslinya utuh.
for (const [glyph, name] of [["↑", "Naik"], ["↓", "Turun"]]) {
  check(
    `ikon ${name} (${glyph}) muncul 2x (daftar blok + daftar soal)`,
    count(page, `<span className="action-icon" aria-hidden="true">${glyph}</span>${name}`) === 2,
  );
}
check(
  "ikon Edit (✎) tetap terpasang di tombol editor blok + butir",
  count(page, 'onClick={() => startEditBlock(block)}><span className="action-icon" aria-hidden="true">✎</span>Edit</button>') === 1 &&
    count(page, 'onClick={() => startEditItem(item)}><span className="action-icon" aria-hidden="true">✎</span>Edit</button>') === 1,
);
check(
  "ikon Hapus (🗑) tetap terpasang di tombol editor blok + butir",
  count(page, 'onClick={() => void deleteBlock(block)}><span className="action-icon" aria-hidden="true">🗑</span>Hapus</button>') === 1 &&
    count(page, 'onClick={() => void deleteItem(item)}><span className="action-icon" aria-hidden="true">🗑</span>Hapus</button>') === 1,
);
// Dulu pemeriksaan ini menghitung SEMUA pemakaian kelas is-danger
// (=== 2) karena hanya tombol editor yang memakainya. Fitur hapus
// permanen materi/LKPD memakai ulang kelas bahaya yang sama pada kartu
// Langkah 1/2, jadi hitungannya dilingkupkan ke dua tombol editor yang
// memang dilindungi suite ini (blok + butir) — maksud aslinya utuh.
check(
  "tombol Hapus memakai kelas is-danger di kedua daftar",
  count(page, 'className="module-row-action is-danger" onClick={() => void deleteBlock(block)}') === 1 &&
    count(page, 'className="module-row-action is-danger" onClick={() => void deleteItem(item)}') === 1,
);
// Dulu pemeriksaan ini menuntut pemakaian .module-row-action lain TIDAK
// diberi ikon. Paket ikon-tombol-guru sengaja memperluas ikon ke semua
// tombol aksi ruang guru, jadi tuntutan itu dibalik: Edit modul kini ikut
// memakai ikon ✎ yang sama dengan tombol Edit di bar aksi isi.
check(
  "Edit modul kini memakai ikon ✎ yang sama (paket ikon-tombol-guru)",
  page.includes('className="module-row-action" onClick={startEditModuleMeta}><span className="action-icon" aria-hidden="true">✎</span>Edit modul</button>'),
);
check(
  "handler tidak berubah (moveBlock/moveItem tetap terpasang)",
  page.includes("onClick={() => void moveBlock(block.id, -1)}") &&
    page.includes("onClick={() => void moveItem(item.id, -1)}"),
);

// Base CSS: icons hidden on desktop; danger tint present in all viewports.
check(
  "ikon disembunyikan di luar media query mobile",
  /\.content-row-actions \.action-icon \{\s*display: none;/.test(css),
);
check(
  "nuansa bahaya Hapus (#b42318 di atas #fef3f2, garis #fecdca)",
  /\.module-row-action\.is-danger \{\s*border-color: #fecdca;\s*background: #fef3f2;\s*color: #b42318;/.test(css),
);
check(
  "hover Hapus lebih dalam (#fee4e2)",
  css.includes(".module-row-action.is-danger:hover") && css.includes("background: #fee4e2;"),
);

// Mobile CSS: slice the LAST max-width: 760px block (the one holding the
// .module-row mobile rules) and assert the scoped rules live inside it.
const mediaStart = css.lastIndexOf("@media (max-width: 760px)");
const media = mediaStart >= 0 ? css.slice(mediaStart) : "";
check("blok @media (max-width: 760px) ditemukan", mediaStart >= 0);
check(
  ".content-row menjadi satu kolom di mobile",
  /\.content-row \{\s*grid-template-columns: 1fr;/.test(media),
);
check(
  "cuplikan boleh dua baris (line-clamp 2)",
  /\.content-row-main span \{[^}]*-webkit-line-clamp: 2;/.test(media),
);
check(
  "bar aksi 4 kolom selebar penuh di bawah teks",
  /\.content-row-actions \{\s*display: grid;\s*grid-template-columns: repeat\(4, 1fr\);[^}]*width: 100%;/.test(media),
);
check(
  "tombol di bar aksi: ikon di atas label mini, tinggi minimal 48px",
  /\.content-row-actions \.module-row-action \{[^}]*flex-direction: column;[^}]*min-height: 48px;[^}]*font-size: 11px;/.test(media),
);
check(
  "ikon tampil di dalam bar aksi mobile",
  /\.content-row-actions \.action-icon \{\s*display: block;\s*font-size: 15px;/.test(media),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
