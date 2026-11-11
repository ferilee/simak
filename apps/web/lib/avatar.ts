// Tampilan avatar murid di ruang murid: tipe respons GET
// /murid/avatars (katalog + kepemilikan + saldo dari server) dan label
// murni untuk pemilih avatar. Katalog, harga, dan kepemilikan selalu
// dari server (lib/avatar di API) — web tidak menyimpan salinannya;
// di sini hanya kata-kata tampilannya yang disusun.

export type AvatarCatalogItem = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  price: number;
  image_url: string;
  owned: boolean;
  equipped: boolean;
};

export type AvatarsResponse = {
  ok: true;
  data: {
    balance: number;
    lifetime: number;
    equipped_slug: string | null;
    catalog: AvatarCatalogItem[];
  };
};

/**
 * Jalur gambar avatar dari slug-nya (untuk kartu XP di beranda, yang
 * hanya menerima slug dari GET /murid/today). Dibangun di SATU tempat
 * ini saja — pemilih avatar memakai image_url dari server. Bila format
 * gambar asli kelak berbeda (mis. PNG), hanya ekstensi di baris ini
 * yang berubah.
 */
export function avatarImagePath(slug: string): string {
  return `/avatars/${slug}.svg`;
}

/** Label harga avatar: gratis disebut apa adanya, selain itu nominal XP. */
export function priceLabel(price: number): string {
  return price === 0 ? "Gratis" : `${price} XP`;
}

/** Label keadaan avatar bagi murid yang melihat: terpasang / dimiliki / terkunci. */
export function stateLabel(item: { owned: boolean; equipped: boolean }): string {
  if (item.equipped) return "Terpasang";
  if (item.owned) return "Dimiliki";
  return "Terkunci";
}
