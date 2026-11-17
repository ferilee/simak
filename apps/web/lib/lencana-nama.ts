// Lencana nama murid: field avatar pada payload daftar nama (dari
// lib/avatar di API — slug terpasang tervalidasi katalog + emoji-nya,
// keduanya null bila murid belum memasang avatar) dan penurun inisial
// murni untuk lingkaran pengganti bagi murid tanpa avatar. Komponen
// tampilannya components/StudentNameBadge.tsx; di sini hanya tipe
// datanya dan logika inisialnya yang bisa diuji tanpa DOM.

export type StudentAvatarFields = {
  avatar_slug?: string | null;
  avatar_emoji?: string | null;
};

/**
 * Inisial tampil dari nama lengkap: huruf pertama kata pertama dan
 * kata kedua, huruf besar ("Beni Firmansyah" → "BF"). Nama satu kata
 * cukup huruf pertamanya ("Agus" → "A"); kata-kata sesudah kata kedua
 * tidak dipakai. Nama kosong/putih saja menghasilkan "?" agar
 * lingkaran tidak pernah tampil kosong.
 */
export function nameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const second = words.length > 1 ? words[1]!.charAt(0) : "";
  return (first + second).toUpperCase();
}
