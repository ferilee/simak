// Presensi "live kelompok" (versi ringan — polling, BUKAN WebSocket):
// keadaan siapa-sedang-membuka-soal-mana pada attempt kelompok, agar murid
// melihat indikator "teman sedang mengerjakan soal ini" dan jawaban terbaru
// tanpa memuat ulang halaman.
//
// ASUMSI PENYEBARAN: keadaan ini disimpan di MEMORI proses API (satu Map),
// TANPA menyentuh basis data. Ini sah karena deployment SIMAK menjalankan
// TEPAT SATU kontainer/proses API — semua heartbeat dan semua polling
// mendarat di proses yang sama. Bila suatu saat API diskalakan ke banyak
// instans, store ini harus dipindah ke penyimpanan bersama (mis. Redis)
// atau presensi antar-instans tidak akan saling terlihat. Restart proses
// API mengosongkan peta — tidak masalah: entri berumur paling lama
// PRESENCE_TTL_MS dan diisi ulang oleh heartbeat berikutnya.
//
// Fungsi-fungsi murni di sini menerima store + waktu (`now`) sebagai
// parameter supaya bisa diuji deterministik (presence.test.mjs).

export const PRESENCE_TTL_MS = 12_000;

export type PresenceEntry = {
  studentId: number;
  name: string;
  // Butir yang sedang dibuka murid; null saat ia berada di layar tinjauan.
  currentItemId: number | null;
  lastSeen: number;
};

/** attemptId → (studentId → entri presensi). */
export type PresenceStore = Map<number, Map<number, PresenceEntry>>;

export function createPresenceStore(): PresenceStore {
  return new Map();
}

/** Store tunggal yang dipakai route pada proses API yang berjalan. */
export const presenceStore: PresenceStore = createPresenceStore();

/**
 * Catat satu detak jantung: murid `student` pada attempt `attemptId` sedang
 * membuka butir `currentItemId` (null = layar tinjauan) pada waktu `now`.
 * Detak berikutnya dari murid yang sama menimpa entri lamanya.
 */
export function recordHeartbeat(
  store: PresenceStore,
  attemptId: number,
  student: { id: number; name: string },
  currentItemId: number | null,
  now: number,
): void {
  let byStudent = store.get(attemptId);
  if (!byStudent) {
    byStudent = new Map();
    store.set(attemptId, byStudent);
  }
  byStudent.set(student.id, {
    studentId: student.id,
    name: student.name,
    currentItemId,
    lastSeen: now,
  });
}

/**
 * Potret presensi aktif satu attempt pada waktu `now`: entri yang umurnya
 * < ttlMs. Entri basi dibuang sekalian (prune on read) dan peta attempt yang
 * menjadi kosong ikut dihapus. Pemanggil menyaring dirinya sendiri dari
 * hasil ini.
 */
export function presenceSnapshot(
  store: PresenceStore,
  attemptId: number,
  now: number,
  ttlMs: number = PRESENCE_TTL_MS,
): PresenceEntry[] {
  const byStudent = store.get(attemptId);
  if (!byStudent) return [];
  const active: PresenceEntry[] = [];
  for (const [studentId, entry] of byStudent) {
    if (now - entry.lastSeen < ttlMs) {
      active.push(entry);
    } else {
      byStudent.delete(studentId);
    }
  }
  if (byStudent.size === 0) store.delete(attemptId);
  return active;
}
