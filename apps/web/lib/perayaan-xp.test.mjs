// Tests for panel perayaan perolehan XP (Fitur Kilau Murid 2).
// Run with bun from apps/web:  bun lib/perayaan-xp.test.mjs
//
// Yang dikunci di sini:
//  - Komponen XpCelebration memakai rangka Modal bersama, memuat
//    avatar besar, angka "+N XP", batang progres level, varian
//    "Naik Level!", dan tepat satu tombol tutup "Lanjut belajar".
//  - Deteksi naik level murni: level dari total sebelum perolehan
//    (total sesudah − poin) dibandingkan dengan level sesudahnya
//    lewat helper levelProgress yang sama dengan beranda.
//  - Angka sesudah perolehan dibaca dari payload kanonis
//    GET /murid/today; kegagalannya tidak membatalkan panel.
//  - Dua momen pemicu, masing-masing tepat sekali: submit LKPD
//    dengan xp_awarded > 0 dari respons API, dan transisi tuntas
//    materi di ReadingProgress (panggilan balik onCompleted yang
//    dijaga ref) dengan poin baku materi dari konstanta bersama.
//  - Animasi hanya CSS ringan dan hormat prefers-reduced-motion.
import { readFileSync } from "node:fs";
import { xpPointsFor } from "./xp.ts";

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

// --- Konstanta bersama untuk momen tanpa angka di respons -------------------
check(
  "xpPointsFor membaca besaran baku dari cerminan server (materi 10, LKPD 25, exit ticket 15)",
  xpPointsFor("materi_tuntas") === 10 && xpPointsFor("lkpd_terkumpul") === 25 && xpPointsFor("exit_ticket") === 15,
);
check("xpPointsFor kejadian asing → null", xpPointsFor("tidak_ada") === null);

// --- Komponen panel ----------------------------------------------------------
const celebration = readFileSync(new URL("../components/XpCelebration.tsx", import.meta.url), "utf8");
check(
  "panel memakai rangka Modal bersama dengan footer satu tombol 'Lanjut belajar'",
  celebration.includes('import { Modal } from "./Modal";') &&
    celebration.includes("Lanjut belajar") &&
    celebration.includes('className="button xp-celebration-button"'),
);
check(
  "angka perolehan tampil mencolok sebagai '+{points} XP'",
  celebration.includes('<strong className="xp-celebration-points">+{points} XP</strong>'),
);
check(
  "avatar murid besar dari payload (avatarImagePath), bintang sebagai cadangan",
  celebration.includes("avatarImagePath(avatarSlug)") &&
    celebration.includes('className="xp-celebration-avatar"') &&
    celebration.includes('className="xp-celebration-star"'),
);
check(
  "angka sesudah perolehan dibaca dari GET /murid/today (xp + avatar_slug)",
  celebration.includes('apiRequest<TodayXpResponse>("/murid/today")') &&
    celebration.includes("setSummary(response.data.xp)") &&
    celebration.includes("setAvatarSlug(response.data.avatar_slug)"),
);
check(
  "deteksi naik level: level sebelum (total − poin) < level sesudah, lewat levelProgress",
  celebration.includes("levelProgress(Math.max(0, summary.total - points))") &&
    celebration.includes("after.levelIndex > before.levelIndex") &&
    celebration.includes('title={leveledUp ? "Naik Level! 🎉" : "XP Bertambah ⭐"}') &&
    celebration.includes("Kamu naik ke level {after.levelName}!"),
);
check(
  "batang progres di panel memakai pecahan helper; level tertinggi tanpa batang",
  celebration.includes("width: `${after.fraction * 100}%`") &&
    celebration.includes("after.isTopLevel ? (") &&
    celebration.includes("{after.label}"),
);

// --- Momen 1: submit LKPD ------------------------------------------------------
const worksheetPage = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
check(
  "halaman LKPD merender panel dari state xpCelebration dengan judul momennya",
  worksheetPage.includes('import { XpCelebration } from "../../../../components/XpCelebration";') &&
    worksheetPage.includes("const [xpCelebration, setXpCelebration] = useState<number | null>(null);") &&
    worksheetPage.includes('<XpCelebration points={xpCelebration} headline="LKPD berhasil dikumpulkan." onClose={() => setXpCelebration(null)} />'),
);

// --- Momen 2: materi tuntas ----------------------------------------------------
const readingProgress = readFileSync(new URL("../components/ReadingProgress.tsx", import.meta.url), "utf8");
check(
  "ReadingProgress menerima onCompleted dan memanggilnya tepat sekali (penjaga ref)",
  readingProgress.includes("onCompleted?: () => void;") &&
    readingProgress.includes("const celebratedRef = useRef(false);") &&
    readingProgress.includes("if (!celebratedRef.current) {") &&
    readingProgress.includes("onCompletedRef.current?.();"),
);
const modulePage = readFileSync(new URL("../app/murid/modules/[id]/page.tsx", import.meta.url), "utf8");
check(
  "halaman materi membuka panel dari onCompleted dengan poin baku materi_tuntas",
  modulePage.includes("onCompleted={() => setCelebrationOpen(true)}") &&
    modulePage.includes('points={xpPointsFor("materi_tuntas") ?? 10}') &&
    modulePage.includes('headline="Materi selesai dibaca sampai tuntas."'),
);

// --- Gaya + gerak yang dihormati ------------------------------------------------
const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check(
  "gaya panel perayaan ada di globals.css (avatar, angka, batang)",
  globalsCss.includes(".xp-celebration {") &&
    globalsCss.includes(".xp-celebration-points") &&
    globalsCss.includes("@keyframes xp-celebration-pop"),
);
check(
  "animasi dimatikan untuk prefers-reduced-motion",
  globalsCss.includes("@media (prefers-reduced-motion: reduce)") &&
    /\.xp-celebration \{\s*animation: none;/.test(globalsCss),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
