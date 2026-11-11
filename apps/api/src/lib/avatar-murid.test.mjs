// Tests for avatar murid (gamifikasi): katalog avatar statis, perencana
// penukaran murni, migrasi 0017 (users.avatar_slug), dan wiring routes
// avatar + penyesuaian /murid/today (level dari XP seumur, saldo tukar,
// avatar terpasang). Run with bun from apps/api:
//   bun src/lib/avatar-murid.test.mjs
//
// Yang dikunci di sini:
//  - Katalog: tepat 8 avatar dengan id/slug/nama/emoji/harga/warna
//    sesuai rancangan yang disetujui — dua gratis (kancil, katak),
//    sisanya bertingkat 100..1000 XP.
//  - planRedemption murni: boleh (termasuk saldo pas-pasan dan avatar
//    gratis bersaldo nol), sudah_dimiliki didahulukan, saldo_kurang
//    membawa angka kekurangan yang tepat.
//  - Semantik saldo: summarizeXp menghitung level dari XP seumur dan
//    melaporkan saldo tukar terpisah — penukaran tidak menurunkan level.
//  - Wiring: routes /murid/avatars (GET/redeem/equip/unequip) khusus
//    murid dengan pesan-pesan bakunya; redeem menulis baris negatif
//    buku besar; equip hanya untuk yang dimiliki; /today membawa
//    avatar_slug tervalidasi + agregasi seumur/saldo.
import { readFileSync } from "node:fs";
import { AVATAR_CATALOG, avatarById, avatarBySlug, avatarImagePath, planRedemption } from "./avatar.ts";
import { summarizeXp } from "./xp.ts";

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

// --- Katalog ---------------------------------------------------------------
const EXPECTED = [
  [1, "kancil", "Kancil Cerdik", "🦌", 0, "#FDE68A"],
  [2, "katak", "Katak Ceria", "🐸", 0, "#BBF7D0"],
  [3, "panda", "Panda Santai", "🐼", 100, "#E5E7EB"],
  [4, "rubah", "Rubah Cerdik", "🦊", 150, "#FED7AA"],
  [5, "harimau", "Harimau Berani", "🐯", 250, "#FCD34D"],
  [6, "hantu", "Burung Hantu Bijak", "🦉", 400, "#DDD6FE"],
  [7, "garuda", "Garuda Perkasa", "🦅", 600, "#FECACA"],
  [8, "naga", "Naga Legenda", "🐉", 1000, "#A7F3D0"],
];
check("katalog berisi tepat 8 avatar", AVATAR_CATALOG.length === 8);
check(
  "isi katalog persis rancangan (id, slug, nama, emoji, harga, warna)",
  EXPECTED.every(([id, slug, name, emoji, price, bg]) => {
    const entry = AVATAR_CATALOG.find((avatar) => avatar.id === id);
    return entry && entry.slug === slug && entry.name === name &&
      entry.emoji === emoji && entry.price === price && entry.bg === bg;
  }),
);
check(
  "id dan slug katalog unik",
  new Set(AVATAR_CATALOG.map((avatar) => avatar.id)).size === 8 &&
    new Set(AVATAR_CATALOG.map((avatar) => avatar.slug)).size === 8,
);
check(
  "tepat dua avatar gratis (kancil + katak), harga lain tak negatif",
  AVATAR_CATALOG.filter((avatar) => avatar.price === 0).map((avatar) => avatar.slug).join(",") === "kancil,katak" &&
    AVATAR_CATALOG.every((avatar) => avatar.price >= 0),
);
check(
  "avatarBySlug menemukan dan menolak slug asing",
  avatarBySlug("naga")?.id === 8 && avatarBySlug("asing") === undefined,
);
check(
  "avatarById menemukan dan menolak id asing",
  avatarById(1)?.slug === "kancil" && avatarById(99) === undefined,
);
check(
  "avatarImagePath membangun /avatars/<slug>.svg",
  avatarImagePath("kancil") === "/avatars/kancil.svg" && avatarImagePath("naga") === "/avatars/naga.svg",
);

// --- planRedemption ----------------------------------------------------------
const panda = avatarBySlug("panda");
const naga = avatarBySlug("naga");
const kancil = avatarBySlug("kancil");
const paid = planRedemption({ avatar: panda, owned: false, balance: 250 });
check("penukaran berbayar dengan saldo cukup → ok, cost = harga", paid.ok === true && paid.cost === 100);
const exact = planRedemption({ avatar: panda, owned: false, balance: 100 });
check("saldo pas-pasan → tetap ok", exact.ok === true && exact.cost === 100);
const free = planRedemption({ avatar: kancil, owned: false, balance: 0 });
check("avatar gratis bersaldo nol → ok, cost 0", free.ok === true && free.cost === 0);
const ownedPlan = planRedemption({ avatar: naga, owned: true, balance: 0 });
check(
  "sudah dimiliki didahulukan (mengalahkan saldo kurang)",
  ownedPlan.ok === false && ownedPlan.reason === "sudah_dimiliki",
);
const short = planRedemption({ avatar: naga, owned: false, balance: 640 });
check(
  "saldo kurang → reason saldo_kurang dengan angka kurang tepat (1000-640=360)",
  short.ok === false && short.reason === "saldo_kurang" && short.kurang === 360,
);

// --- Semantik level vs saldo -------------------------------------------------
const summary = summarizeXp(250, 90);
check(
  "summarizeXp(250, 90): level dari seumur (Penakluk LKPD), total 250, saldo 90",
  summary.total === 250 && summary.balance === 90 && summary.levelName === "Penakluk LKPD",
);
check(
  "summarizeXp tanpa saldo → saldo dianggap sama dengan total",
  summarizeXp(250).balance === 250,
);

// --- Skema & migrasi -----------------------------------------------------------
const usersSchema = readFileSync(new URL("../../../../packages/db/src/schema/users.ts", import.meta.url), "utf8");
check(
  "skema users: avatarSlug varchar(64) boleh NULL",
  usersSchema.includes('avatarSlug: varchar("avatar_slug", { length: 64 })'),
);
const xpSchema = readFileSync(new URL("../../../../packages/db/src/schema/xp.ts", import.meta.url), "utf8");
check(
  "skema xp_ledger: union event memuat tukar_avatar",
  xpSchema.includes('"materi_tuntas" | "lkpd_terkumpul" | "exit_ticket" | "tukar_avatar"'),
);
const migration = readFileSync(new URL("../../../../packages/db/migrations/0017_avatar_murid.sql", import.meta.url), "utf8");
check(
  "migrasi 0017 menambahkan users.avatar_slug varchar(64)",
  migration.includes("ALTER TABLE `users` ADD `avatar_slug` varchar(64);"),
);
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
const lastEntry = journal.entries.at(-1);
check(
  "jurnal migrasi berakhir di 0017_avatar_murid (18 entri)",
  journal.entries.length === 18 && lastEntry.idx === 17 && lastEntry.tag === "0017_avatar_murid",
);

// --- Wiring routes avatar ------------------------------------------------------
const avatarRoute = readFileSync(new URL("../routes/avatar.ts", import.meta.url), "utf8");
check(
  "routes avatar khusus murid",
  avatarRoute.includes('avatarRoutes.use("*", requireRole("murid"))'),
);
check(
  "GET /avatars terdaftar dan katalog membawa image_url dari avatarImagePath + owned/equipped",
  avatarRoute.includes('avatarRoutes.get("/avatars"') &&
    avatarRoute.includes("image_url: avatarImagePath(avatar.slug)") &&
    avatarRoute.includes("owned: owned.has(avatar.id)") &&
    avatarRoute.includes("equipped_slug: equipped"),
);
check(
  "unequip didaftarkan sebelum route /:slug (tidak tertangkap sebagai slug)",
  avatarRoute.indexOf('avatarRoutes.post("/avatars/unequip"') > -1 &&
    avatarRoute.indexOf('avatarRoutes.post("/avatars/unequip"') < avatarRoute.indexOf('avatarRoutes.post("/avatars/:slug/redeem"') &&
    avatarRoute.includes("data: { equipped_slug: null }"),
);
check(
  "redeem: slug asing 404 'Avatar tidak ditemukan.'",
  avatarRoute.includes('if (!avatar) return c.json({ ok: false, message: "Avatar tidak ditemukan." }, 404);'),
);
check(
  "redeem: sudah dimiliki 409 dengan pesannya",
  avatarRoute.includes('return c.json({ ok: false, message: "Avatar ini sudah kamu miliki." }, 409);'),
);
check(
  "redeem: saldo kurang 400 membawa pesan + field kurang",
  avatarRoute.includes("return c.json({ ok: false, message: `Saldo XP kurang ${plan.kurang}.`, kurang: plan.kurang }, 400);") &&
    avatarRoute.includes("planRedemption({ avatar, owned: owned.has(avatar.id), balance })"),
);
check(
  "redeem: menulis baris negatif buku besar (tukar_avatar, sourceId avatar, -harga) idempoten",
  avatarRoute.includes('values({ studentId: user.userId, event: "tukar_avatar", sourceId: avatar.id, points: -avatar.price })') &&
    avatarRoute.includes(".onDuplicateKeyUpdate({ set: { points: -avatar.price } })"),
);
check(
  "redeem: respons membawa slug + saldo baru + owned",
  avatarRoute.includes("data: { slug: avatar.slug, balance: after.balance, owned: true }"),
);
check(
  "equip: kepemilikan diperiksa sebelum users.avatar_slug diperbarui; belum dimiliki 403 dengan pesannya",
  avatarRoute.indexOf('if (!owned.has(avatar.id))') > -1 &&
    avatarRoute.indexOf('if (!owned.has(avatar.id))') < avatarRoute.indexOf(".update(users).set({ avatarSlug: avatar.slug })") &&
    avatarRoute.includes('return c.json({ ok: false, message: "Tukar dulu avatar ini dengan XP." }, 403);') &&
    avatarRoute.includes("data: { equipped_slug: avatar.slug }"),
);
check(
  "ekstensi gambar hanya disebut di lib/avatar (routes memakai avatarImagePath)",
  !avatarRoute.includes(".svg"),
);
const appSource = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
check(
  "app.ts memasang avatarRoutes pada awalan /murid",
  appSource.includes('import { avatarRoutes } from "./routes/avatar";') &&
    appSource.includes('v1.route("/murid", avatarRoutes);'),
);

// --- Penyesuaian /murid/today ----------------------------------------------------
const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
check(
  "/today: avatarSlug dipilih bersama welcomedAt dari baris users yang sama",
  muridRoute.includes(".select({ welcomedAt: users.welcomedAt, avatarSlug: users.avatarSlug })"),
);
check(
  "/today: slug divalidasi ke katalog dan terkirim sebagai avatar_slug",
  muridRoute.includes("avatarBySlug(me.avatarSlug)") &&
    muridRoute.includes("avatar_slug: equippedAvatarSlug,"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
