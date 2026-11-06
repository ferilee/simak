// Helper murni untuk modal edit bersama ruang guru (Tahap 1): keputusan
// tutup modal dan perbandingan daftar id sasaran penugasan. Keputusan
// tutup dipisah dari komponen agar penjaga "buang perubahan" bisa diuji
// tanpa DOM: formulir bersih langsung ditutup, formulir kotor harus
// melewati konfirmasi dulu.

export type CloseDecision = "close" | "confirm";

// dirty=false → "close" (tutup langsung lewat logika Batal formulir);
// dirty=true → "confirm" (tanya dulu lewat dialog konfirmasi bersama).
export function closeDecision(dirty: boolean): CloseDecision {
  return dirty ? "confirm" : "close";
}

// Dua daftar id dianggap sama bila anggotanya sama, tanpa memandang
// urutan (kotak centang kelas/murid bisa dicentang dalam urutan apa pun
// tanpa mengubah nilai yang dikirim).
export function sameIdList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
}
