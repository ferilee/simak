// Aturan modal ucapan selamat datang murid: murni keputusan "perlu
// disambut atau tidak" dari penanda server users.welcomed_at.
// NULL berarti murid belum pernah menutup sambutan — modal tampil
// sekali pada kedatangan pertama di ruang murid; sesudah ditutup,
// penanda terisi dan modal tidak pernah tampil lagi untuk akun itu.

export function needsWelcome(welcomedAt: Date | null | undefined): boolean {
  return welcomedAt === null || welcomedAt === undefined;
}
