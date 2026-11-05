// Static source test for the guru-room action-button icons.
// Run with bun from apps/web:  bun lib/ikon-tombol-guru.test.mjs
//
// Every action button in the teacher room (guru page + LibraryPanel) now
// carries a small glyph in front of its label, reusing the house pattern
// from the content-row editor bar: <span className="action-icon"
// aria-hidden="true">{glyph}</span>{Label}. Only the span was prepended —
// labels, handlers, classes, titles and disabled logic are untouched.
// Pure navigation/selection controls (wizard steps, hasil-tabs, filter
// chips, prev/next footer), icon-only buttons, buttons that already carry
// an SVG icon, and the editor rows that already had icons stay as they were.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const lib = readFileSync(join(here, "../components/LibraryPanel.tsx"), "utf8");
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

const pair = (glyph, label) => `aria-hidden="true">${glyph}</span>${label}`;

console.log("Ikon tombol guru — tes statis sumber:");

// Kartu modul + kartu LKPD (Langkah 1/2): empat tombol aksi per kartu.
check("Pratinjau 👁 di kartu modul + LKPD", count(page, pair("👁", "Pratinjau")) === 2);
check(
  "tombol status: 📦 Arsipkan / 🚀 Terbitkan (modul)",
  page.includes('{module.status === "terbit" ? <><span className="action-icon" aria-hidden="true">📦</span>Arsipkan</> : <><span className="action-icon" aria-hidden="true">🚀</span>Terbitkan</>}'),
);
check(
  "tombol status: 📦 Arsipkan / 🚀 Terbitkan (LKPD)",
  page.includes('{worksheet.status === "terbit" ? <><span className="action-icon" aria-hidden="true">📦</span>Arsipkan</> : <><span className="action-icon" aria-hidden="true">🚀</span>Terbitkan</>}'),
);
check(
  "saklar bagikan: ✓ Dibagikan / 🔗 Bagikan (modul + LKPD)",
  page.includes('{moduleShareOn ? <><span className="action-icon" aria-hidden="true">✓</span>Dibagikan</> : <><span className="action-icon" aria-hidden="true">🔗</span>Bagikan</>}') &&
    page.includes('{worksheetShareOn ? <><span className="action-icon" aria-hidden="true">✓</span>Dibagikan</> : <><span className="action-icon" aria-hidden="true">🔗</span>Bagikan</>}'),
);
check(
  "Hapus 🗑 di kartu modul + LKPD",
  count(page, 'className="module-row-action is-danger">') === 2 && // kedua kartu (atribut kelas menutup tombolnya)
    count(page, pair("🗑", "Hapus")) === 5, // 2 kartu + 2 baris editor (blok + butir) + awalan "Hapus sampul"
);

// Kepala editor + formulir Langkah 1/2.
check("Edit modul ✎", page.includes(pair("✎", "Edit modul</button>")));
check("Edit LKPD ✎", page.includes(pair("✎", "Edit LKPD</button>")));
check("Simpan data modul 💾", page.includes(pair("💾", "Simpan data modul</button>")));
check("Simpan data LKPD 💾", page.includes(pair("💾", "Simpan data LKPD</button>")));
check("Buat draf +", page.includes(pair("+", "Buat draf</button>")));
check("Buat kelas +", page.includes(pair("+", "Buat kelas</button>")));
check("Buat LKPD dari modul terpilih +", page.includes(pair("+", "Buat LKPD dari modul terpilih</button>")));
check("Batal ✕ di kelima formulir/editor", count(page, pair("✕", "Batal</button>")) === 5);
check(
  "kirim blok: ikon mengikuti keadaan (💾 simpan / 📥 lampiran / + tambah)",
  page.includes('editingBlock ? <span className="action-icon" aria-hidden="true">💾</span> : blockType === "lampiran" ? <span className="action-icon" aria-hidden="true">📥</span> : <span className="action-icon" aria-hidden="true">+</span>') &&
    page.includes('"Tambahkan blok"') && page.includes('"Unggah lampiran"'),
);
check(
  "kirim butir: 💾 Simpan perubahan / + Tambahkan soal",
  page.includes('{editingItem ? <><span className="action-icon" aria-hidden="true">💾</span>Simpan perubahan</> : <><span className="action-icon" aria-hidden="true">+</span>Tambahkan soal</>}'),
);
check("Hapus sampul 🗑", page.includes(pair("🗑", "Hapus sampul</button>")));

// Kartu penugasan + formulirnya (Langkah 3/4 guruStep).
check("Kelompok 👥 pada kartu penugasan", page.includes(pair("👥", "Kelompok</button>")));
check(
  "Terbitkan 🚀 pada kartu penugasan (keadaan Tutup tetap ikon SVG bawaannya)",
  page.includes(': <><span className="action-icon" aria-hidden="true">🚀</span>Terbitkan</>}</button>') &&
    page.includes("</svg>Tutup</>"),
);
const editAssignmentAt = page.indexOf("onClick={() => startEditAssignment(assignment)}");
const editAssignmentSeg = editAssignmentAt >= 0 ? page.slice(editAssignmentAt, editAssignmentAt + 400) : "";
check(
  "Edit penugasan tetap ikon SVG pensil (tidak digandakan rentang ikon)",
  editAssignmentSeg.includes('<svg className="row-action-icon"') &&
    editAssignmentSeg.includes("Edit</button>") &&
    !editAssignmentSeg.includes('className="action-icon"'),
);
check(
  "kirim penugasan: 💾 Simpan perubahan / + Buat draf penugasan",
  page.includes('{editingAssignment ? <><span className="action-icon" aria-hidden="true">💾</span>Simpan perubahan</> : <><span className="action-icon" aria-hidden="true">+</span>Buat draf penugasan</>}'),
);

// Panel kelompok.
check("Salin daftar 📋", page.includes(pair("📋", "Salin daftar</>")));
check("Tersalin ✓ tetap teksnya, didahului 📋", page.includes(pair("📋", "Tersalin ✓</>")));
check("Salin kelompok 📋", page.includes(pair("📋", "Salin kelompok")));
check("Bentuk kelompok 👥", page.includes(pair("👥", "Bentuk kelompok</button>")));
check("Acak ulang 🎲", page.includes(pair("🎲", "Acak ulang</button>")));
check("Tambah anggota +", page.includes(pair("+", "Tambah")));

// Pantau hasil (Langkah 5): kirim formulir, impor, penilaian.
check("Lihat rekap rentang →", page.includes(pair("→", "Lihat rekap rentang</button>")));
check(
  "Impor nilai RUAS 📥 (termasuk keadaan Mengimpor...)",
  page.includes('{ruasImportLoading ? <><span className="action-icon" aria-hidden="true">📥</span>Mengimpor...</> : <><span className="action-icon" aria-hidden="true">📥</span>Impor nilai RUAS</>}'),
);
check("Lihat foto jawaban 👁", page.includes(pair("👁", "Lihat foto jawaban")));
check("Simpan penilaian 💾", page.includes(pair("💾", "Simpan penilaian</button>")));
check("Sesuaikan nilai anggota 📝", page.includes(pair("📝", "Sesuaikan")));
check("Kembalikan ke nilai kelompok ↩", page.includes(pair("↩", "Kembalikan ke nilai kelompok</button>")));
// Tombol unduh sudah berikon SVG unduh: tidak ditambah rentang ikon.
check(
  "tombol Unduh tetap ikon SVG (tanpa rentang .action-icon)",
  page.includes("</svg>Unduh Excel (CSV)</button>") &&
    page.includes("</svg>Unduh PDF</button>") &&
    !page.includes('download-button-csv"><span className="action-icon"') &&
    !page.includes('download-button-pdf"><span className="action-icon"'),
);

// Perpustakaan Bersama (LibraryPanel): kartu, pratinjau, antrean.
check("Pratinjau 👁 di antrean + kartu perpustakaan", count(lib, pair("👁", "Pratinjau")) === 2);
check("Setujui ✓", lib.includes(pair("✓", "Setujui")));
check("Tolak ✕", lib.includes(pair("✕", "Tolak")));
check("Tarik ⬇", lib.includes(pair("⬇", "Tarik")));
check(
  "Salin ke punya saya 📋 di kartu + dua permukaan pratinjau",
  count(lib, pair("📋", "Salin ke punya saya</>")) === 3 &&
    count(lib, pair("📋", "Menyalin...</>")) === 3,
);
check(
  "Buka draf salinan tidak digandakan ikonnya (label sudah berakhiran →)",
  lib.includes("Buka draf salinan →") && !lib.includes(pair("→", "Buka draf salinan")),
);
check(
  "lencana ✓ Sudah disalin tidak berubah",
  lib.includes("{SUDAH_DISALIN_LABEL}"),
);

// Baris editor blok/butir: ikon aslinya persis seperti semula.
check("ikon ↑ Naik baris editor utuh 2x", count(page, pair("↑", "Naik")) === 2);
check("ikon ↓ Turun baris editor utuh 2x", count(page, pair("↓", "Turun")) === 2);
check(
  "ikon ✎ Edit baris editor utuh (blok + butir)",
  count(page, 'onClick={() => startEditBlock(block)}><span className="action-icon" aria-hidden="true">✎</span>Edit</button>') === 1 &&
    count(page, 'onClick={() => startEditItem(item)}><span className="action-icon" aria-hidden="true">✎</span>Edit</button>') === 1,
);
check(
  "ikon 🗑 Hapus baris editor utuh (blok + butir)",
  count(page, 'onClick={() => void deleteBlock(block)}><span className="action-icon" aria-hidden="true">🗑</span>Hapus</button>') === 1 &&
    count(page, 'onClick={() => void deleteItem(item)}><span className="action-icon" aria-hidden="true">🗑</span>Hapus</button>') === 1,
);

// Navigasi murni tidak disentuh: langkah wizard, footer, tab hasil.
// Total rentang ikon dikunci persis — tambahan ikon di luar daftar paket
// ini (termasuk di navigasi) akan mengubah hitungannya dan harus disengaja.
check(
  "total rentang .action-icon terkunci (halaman guru 55, panel perpustakaan 11)",
  count(page, 'className="action-icon"') === 55 && count(lib, 'className="action-icon"') === 11,
  `guru=${count(page, 'className="action-icon"')} lib=${count(lib, 'className="action-icon"')}`,
);
check(
  "tombol langkah wizard + footer sebelumnya/berikutnya utuh tanpa rentang ikon",
  page.includes('className={`wizard-step ${langkahTampil && guruStep === index ? "is-active" : ""}') &&
    page.includes("← Sebelumnya</button>") &&
    page.includes("Langkah berikutnya →</button>"),
);
check(
  "tab hasil utuh (label dirender dari {tab.label}, tanpa rentang ikon)",
  page.includes('className={`hasil-tab${hasilTab === tab.key ? " is-active" : ""}`}') &&
    page.includes("{tab.label}"),
);

// Teks label lama yang polos tidak boleh tersisa pada tombol yang dikonversi.
check(
  "tidak ada sisa label polos pada tombol terkonversi",
  !page.includes('{moduleShareOn ? "Dibagikan" : "Bagikan"}') &&
    !page.includes('{worksheetShareOn ? "Dibagikan" : "Bagikan"}') &&
    !page.includes('style={styles.secondaryButton}>Batal</button>') &&
    !lib.includes('"Salin ke punya saya"'),
);

// CSS: jarak kecil ikon-label untuk permukaan baru; bar aksi isi dan
// tombol fleksibel bergap sendiri dikecualikan; aturan sembunyi desktop
// untuk bar aksi isi tetap ada.
check(
  "CSS memberi margin kanan 6px pada .action-icon",
  /\.action-icon \{\s*margin-right: 6px;/.test(css),
);
check(
  "CSS mengecualikan bar aksi isi + tombol bergap dari margin itu",
  css.includes(".content-row-actions .action-icon,") &&
    css.includes(".row-action-button .action-icon,") &&
    css.includes(".download-button .action-icon {"),
);
check(
  "aturan sembunyi ikon bar aksi isi di desktop tetap ada",
  /\.content-row-actions \.action-icon \{\s*display: none;/.test(css),
);

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
if (failed > 0) process.exit(1);
