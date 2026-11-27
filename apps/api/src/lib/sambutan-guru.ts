// Aturan sambutan guru (kartu selamat datang di ruang kerja guru):
// penanda tutupnya adalah users.welcome_dismissed_at di server — NULL
// berarti guru belum pernah menutup kartu. Berbeda dari sambutan murid
// (lib/sapaan.ts, welcomed_at): kartu guru punya tiga keadaan yang
// diputuskan di web dari penanda ini + kelengkapan data guru.
//
// URL panduan singkat dibaca dari env SIMAK_PANDUAN_URL secara langsung
// (bukan lewat skema env ketat) dan sepenuhnya opsional: tidak terdaftar
// atau string kosong berarti tombol "Baca panduan singkat" tidak tampil.
// Ketiadaannya tidak boleh menggagalkan apa pun.

export function readPanduanUrl(env: Record<string, string | undefined>): string | null {
  const raw = typeof env.SIMAK_PANDUAN_URL === "string" ? env.SIMAK_PANDUAN_URL.trim() : "";
  return raw === "" ? null : raw;
}

export function panduanUrl(): string | null {
  return readPanduanUrl(process.env);
}

// Penanda dianggap terisi (kartu sudah ditutup) untuk nilai tanggal apa
// pun; hanya null/undefined yang berarti belum ditutup.
export function isWelcomeDismissed(welcomeDismissedAt: Date | string | null | undefined): boolean {
  return welcomeDismissedAt !== null && welcomeDismissedAt !== undefined;
}
