// Tests for tampilan avatar murid di web (lib/avatar.ts, berkas
// placeholder, dan wiring pemilih avatar di ruang murid).
// Run with bun from apps/web:  bun lib/avatar.test.mjs
//
// Yang dikunci di sini:
//  - Label murni: harga 0 → "Gratis", selain itu "<n> XP"; keadaan
//    avatar → Terpasang / Dimiliki / Terkunci (terpasang menang).
//  - Delapan berkas placeholder public/avatars/<slug>.svg ada, dengan
//    warna latar + emoji yang sama dengan katalog server.
//  - Wiring ruang murid: kartu XP merender avatar terpasang
//    (avatar_slug dari /today) + baris saldo tukar + tombol Ganti
//    Avatar; pemilih mengambil GET /murid/avatars dan memanggil
//    redeem/equip/unequip; saldo kartu XP ikut diperbarui sesudah tukar.
import { existsSync, readFileSync } from "node:fs";
import { avatarImagePath, priceLabel, stateLabel } from "./avatar.ts";

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

// --- Label murni -------------------------------------------------------------
check("harga 0 → 'Gratis'", priceLabel(0) === "Gratis");
check("harga berbayar → '<n> XP'", priceLabel(150) === "150 XP" && priceLabel(1000) === "1000 XP");
check(
  "stateLabel: terpasang menang atas dimiliki",
  stateLabel({ owned: true, equipped: true }) === "Terpasang",
);
check(
  "stateLabel: dimiliki / terkunci",
  stateLabel({ owned: true, equipped: false }) === "Dimiliki" &&
    stateLabel({ owned: false, equipped: false }) === "Terkunci",
);
check(
  "avatarImagePath membangun /avatars/<slug>.svg",
  avatarImagePath("garuda") === "/avatars/garuda.svg",
);

// --- Berkas placeholder --------------------------------------------------------
const EXPECTED_AVATARS = [
  ["kancil", "🦌", "#FDE68A"],
  ["katak", "🐸", "#BBF7D0"],
  ["panda", "🐼", "#E5E7EB"],
  ["rubah", "🦊", "#FED7AA"],
  ["harimau", "🐯", "#FCD34D"],
  ["hantu", "🦉", "#DDD6FE"],
  ["garuda", "🦅", "#FECACA"],
  ["naga", "🐉", "#A7F3D0"],
];
for (const [slug, emoji, bg] of EXPECTED_AVATARS) {
  const path = new URL(`../public/avatars/${slug}.svg`, import.meta.url);
  const svg = existsSync(path) ? readFileSync(path, "utf8") : "";
  check(
    `placeholder ${slug}.svg: lingkaran berwarna katalog + emoji besar di tengah`,
    svg.includes(`fill="${bg}"`) && svg.includes(emoji) &&
      svg.includes('rx="128"') && svg.includes('font-size="150"') &&
      svg.includes('text-anchor="middle"'),
  );
}

// --- Wiring ruang murid ----------------------------------------------------------
const muridPage = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
check(
  "ruang murid memakai helper + tipe dari lib/avatar",
  muridPage.includes('from "../../lib/avatar";') &&
    muridPage.includes("avatarImagePath") && muridPage.includes("type AvatarsResponse"),
);
check(
  "TodayResponse membawa avatar_slug dan state awalnya null",
  muridPage.includes("avatar_slug: string | null") && muridPage.includes("xp: null, avatar_slug: null"),
);
check(
  "kartu XP merender gambar avatar terpasang dari avatar_slug",
  muridPage.includes("src={avatarImagePath(data.avatar_slug)}") &&
    muridPage.includes('className="xp-card-avatar"'),
);
check(
  "kartu XP menampilkan saldo tukar + tombol Ganti Avatar yang membuka pemilih",
  muridPage.includes("Saldo tukar: {data.xp.balance} XP") &&
    muridPage.includes("Ganti Avatar") &&
    muridPage.includes("onClick={() => void openAvatarPicker()}"),
);
check(
  "pemilih mengambil katalog dari GET /murid/avatars saat dibuka",
  muridPage.includes('apiRequest<AvatarsResponse>("/murid/avatars")'),
);
check(
  "pemilih memanggil redeem / equip / unequip pada jalur yang benar",
  muridPage.includes("`/murid/avatars/${item.slug}/redeem`") &&
    muridPage.includes("`/murid/avatars/${item.slug}/equip`") &&
    muridPage.includes('apiRequest("/murid/avatars/unequip", { method: "POST" })'),
);
check(
  "keadaan kartu pemilih: Terpasang nonaktif, Pakai, Ambil Gratis, Kurang X XP, Lepas Avatar",
  muridPage.includes("disabled>Terpasang</button>") &&
    muridPage.includes("onClick={() => void equipAvatar(item)}") &&
    muridPage.includes('"Ambil Gratis"') &&
    muridPage.includes("Kurang {kurang} XP") &&
    muridPage.includes("Lepas Avatar"),
);
check(
  "sesudah tukar berhasil, saldo kartu XP beranda ikut diperbarui dari respons",
  muridPage.includes("xp: current.xp ? { ...current.xp, balance: response.data.balance } : current.xp"),
);
check(
  "pemilih dirender di Modal bersama dan kegagalan muat memberi pesan galat",
  muridPage.includes('title="Avatar saya"') &&
    muridPage.includes("Katalog avatar belum dapat dimuat. Coba lagi nanti."),
);

const xpLib = readFileSync(new URL("./xp.ts", import.meta.url), "utf8");
check(
  "tipe XpSummary web membawa balance (saldo tukar dari server)",
  xpLib.includes("balance: number;"),
);
const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
check(
  "globals.css: gaya kisi avatar + gambar avatar kartu XP",
  globalsCss.includes(".avatar-grid") && globalsCss.includes(".avatar-card") &&
    globalsCss.includes(".xp-card-avatar"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
