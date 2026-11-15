// Perencana murni navigasi lingkaran penugasan di beranda murid
// (pager "Penugasan aktif", v1.0.63): daftar penugasan tampil SATU per
// halaman dalam urutan global dari server, dan lingkaran bernomor di
// bawah kartu berpindah antar-tugas. Semua keputusan di sini dapat
// diuji tanpa peramban; halaman hanya menggambar hasilnya.
//
// Klien TIDAK PERNAH menghitung urutan atau kunci sendiri: urutan,
// keadaan selesai, dan keadaan kunci datang utuh dari payload
// /murid/today (lib/rantai-penugasan di API adalah satu-satunya sumber
// kebenaran). Yang diputuskan di sini hanya soal gambar: tugas mana
// yang dibuka pertama kali dan rupa tiap lingkaran.

export type PagerAssignmentState = {
  /** Keadaan selesai menurut definisi server (materi tuntas + LKPD terkumpul). */
  completed: boolean;
  /** Terkunci oleh penugasan lebih awal yang belum selesai di rantainya. */
  locked: boolean;
};

/**
 * Indeks tugas yang dibuka saat beranda pertama dimuat: penugasan
 * BELUM-SELESAI paling awal pada urutan global (itulah tugas yang
 * sedang harus dikerjakan murid); bila semua sudah selesai, yang
 * pertama. Daftar kosong → -1 (tidak ada yang dibuka).
 */
export function initialPagerIndex(assignments: readonly PagerAssignmentState[]): number {
  if (assignments.length === 0) return -1;
  const firstOpen = assignments.findIndex((assignment) => !assignment.completed);
  return firstOpen === -1 ? 0 : firstOpen;
}

/** Jenis lambang pada lingkaran: centang (selesai), gembok (terkunci), atau nomor urut. */
export type CircleGlyph = "check" | "lock" | "number";

export type CirclePlan = {
  glyph: CircleGlyph;
  /** Lingkaran tugas yang sedang dibuka — digambar terisi penuh. */
  current: boolean;
  /** Kelas keadaan untuk CSS: selesai hijau, terkunci redup. */
  tone: "done" | "locked" | "current" | "plain";
};

/**
 * Rencana gambar satu lingkaran. Lambang: selesai selalu centang dan
 * terkunci selalu gembok (keadaan tugasnya lebih penting daripada
 * posisinya); selain itu nomor urut tampil. Nada "current" hanya untuk
 * lingkaran biasa yang sedang dibuka — lingkaran selesai/terkunci yang
 * sedang dibuka tetap bernada keadaannya, dan komponen menambahkan
 * penanda current lewat aria-current + kelas pendamping.
 */
export function planCircle(assignment: PagerAssignmentState, isCurrent: boolean): CirclePlan {
  if (assignment.completed) return { glyph: "check", current: isCurrent, tone: "done" };
  if (assignment.locked) return { glyph: "lock", current: isCurrent, tone: "locked" };
  return { glyph: "number", current: isCurrent, tone: isCurrent ? "current" : "plain" };
}

/** Label aksesibel satu lingkaran untuk pembaca layar dan tooltip. */
export function circleAriaLabel(position: number, title: string, assignment: PagerAssignmentState): string {
  const state = assignment.completed ? "sudah selesai" : assignment.locked ? "terkunci" : "belum selesai";
  return `Tugas ${position}: ${title} (${state})`;
}
