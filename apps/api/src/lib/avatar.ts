// Katalog avatar murid (gamifikasi, gaya Wayground): avatar adalah
// identitas tampil murid yang dibuka dengan menukar poin XP. Katalog
// ini STATIS di kode — mengikuti pola data kurikulum (lib/kurikulum.ts)
// dan tangga level XP (lib/xp.ts): harga dan nama terbit bersama kode,
// bukan baris basis data. Gambarnya berkas statis web di
// public/avatars/<slug>.svg (placeholder; gambar asli menggantinya
// dengan nama berkas yang sama).
//
// Kepemilikan TIDAK disimpan di tabel sendiri: menukar avatar menulis
// satu baris ke buku besar xp_ledger (event "tukar_avatar", source_id
// = id avatar di katalog ini, points = -harga) — baris itu bukti
// kepemilikannya, dan kunci unik buku besar melarang membeli dua kali.
// Avatar yang sedang dipasang ditunjuk users.avatar_slug.

export type AvatarCatalogEntry = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  price: number;
  bg: string;
};

export const AVATAR_CATALOG: AvatarCatalogEntry[] = [
  { id: 1, slug: "kancil", name: "Kancil Cerdik", emoji: "🦌", price: 0, bg: "#FDE68A" },
  { id: 2, slug: "katak", name: "Katak Ceria", emoji: "🐸", price: 0, bg: "#BBF7D0" },
  { id: 3, slug: "panda", name: "Panda Santai", emoji: "🐼", price: 100, bg: "#E5E7EB" },
  { id: 4, slug: "rubah", name: "Rubah Cerdik", emoji: "🦊", price: 150, bg: "#FED7AA" },
  { id: 5, slug: "harimau", name: "Harimau Berani", emoji: "🐯", price: 250, bg: "#FCD34D" },
  { id: 6, slug: "hantu", name: "Burung Hantu Bijak", emoji: "🦉", price: 400, bg: "#DDD6FE" },
  { id: 7, slug: "garuda", name: "Garuda Perkasa", emoji: "🦅", price: 600, bg: "#FECACA" },
  { id: 8, slug: "naga", name: "Naga Legenda", emoji: "🐉", price: 1000, bg: "#A7F3D0" },
];

/**
 * Jalur gambar avatar — dibangun di SATU tempat ini saja. Bila format
 * gambar asli kelak berbeda (mis. PNG), hanya ekstensi di baris ini
 * yang berubah; semua pemanggil memakai fungsi ini.
 */
export function avatarImagePath(slug: string): string {
  return `/avatars/${slug}.svg`;
}

export function avatarBySlug(slug: string): AvatarCatalogEntry | undefined {
  return AVATAR_CATALOG.find((avatar) => avatar.slug === slug);
}

export function avatarById(id: number): AvatarCatalogEntry | undefined {
  return AVATAR_CATALOG.find((avatar) => avatar.id === id);
}

export type RedemptionPlan =
  | { ok: true; cost: number }
  | { ok: false; reason: "sudah_dimiliki" }
  | { ok: false; reason: "saldo_kurang"; kurang: number };

/**
 * Rencana penukaran avatar: murni, tanpa basis data. Kepemilikan
 * diperiksa lebih dulu (avatar yang sudah dimiliki tidak dibeli lagi),
 * lalu saldo tukar harus menutupi harga — saldo pas-pasan boleh.
 * Avatar gratis (harga 0) selalu terjangkau, tetapi tetap lewat jalur
 * penukaran yang sama agar kepemilikannya tercatat di buku besar.
 */
export function planRedemption(input: {
  avatar: AvatarCatalogEntry;
  owned: boolean;
  balance: number;
}): RedemptionPlan {
  if (input.owned) return { ok: false, reason: "sudah_dimiliki" };
  if (input.balance < input.avatar.price) {
    return { ok: false, reason: "saldo_kurang", kurang: input.avatar.price - input.balance };
  }
  return { ok: true, cost: input.avatar.price };
}
