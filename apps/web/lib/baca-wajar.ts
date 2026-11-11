// Pelacak waktu membaca AKTIF untuk gerbang keplausiban ketuntasan
// materi (Deteksi Baca Terlalu Cepat): hanya waktu saat tab terlihat
// yang dihitung — murid yang membuka materi lalu pindah aplikasi
// tidak "lulus" tanpa membaca. Keputusan tuntas selalu milik server
// (respons POST /activity); lib ini hanya mengakumulasi dan menyimpan
// waktu aktif per (murid, modul) di perangkat, plus memformat target
// waktu yang dikirim payload modul. Semua fungsi murni/dapat diuji
// tanpa DOM: jam dan storage disuntikkan pemanggil.

export type ActiveTimeTracker = {
  /** Catat keadaan terlihat pada cap waktu sekarang; kembalikan total detik aktif. */
  tick: (visible: boolean) => number;
  /** Total detik aktif yang sudah terakumulasi sampai tick terakhir. */
  totalSeconds: () => number;
  /** Muat akumulasi awal (mis. dari penyimpanan perangkat); tidak pernah mengurangi yang sudah terhitung. */
  setInitial: (seconds: number) => void;
};

/**
 * Akumulator segmen terlihat: selisih waktu antar-tick hanya ditambah
 * bila keadaan pada segmen itu "terlihat". Pemanggil men-tick berkala
 * (dan setiap perubahan visibilitas) dengan jam yang disuntikkan.
 */
export function createActiveTimeTracker(now: () => number): ActiveTimeTracker {
  let accumulatedMs = 0;
  let lastStamp: number | null = null;
  let lastVisible = false;

  function tick(visible: boolean): number {
    const stamp = now();
    if (lastStamp !== null && lastVisible) {
      accumulatedMs += Math.max(0, stamp - lastStamp);
    }
    lastStamp = stamp;
    lastVisible = visible;
    return Math.floor(accumulatedMs / 1000);
  }

  return {
    tick,
    totalSeconds: () => Math.floor(accumulatedMs / 1000),
    setInitial: (seconds: number) => {
      const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
      accumulatedMs = Math.max(accumulatedMs, safe * 1000);
    },
  };
}

// Penyimpanan akumulasi per (murid, modul): kuncinya WAJIB memuat id
// murid karena perangkat dipakai bergantian — akumulasi milik murid
// lain tidak boleh terbawa. Nilai rusak diperlakukan sebagai 0.
export const READING_TIME_KEY_PREFIX = "simak:baca-wajar";

// Pagar kewarasan yang sama dengan batas laporan klien di skema
// bersama (6 jam) — akumulasi di luar itu dianggap rusak.
export const MAX_STORED_ACTIVE_SECONDS = 21600;

export function readingTimeStorageKey(studentId: number, moduleId: number): string {
  return `${READING_TIME_KEY_PREFIX}:${studentId}:${moduleId}`;
}

export type KeyValueStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function readStoredActiveSeconds(storage: KeyValueStorage, key: string): number {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(parsed, MAX_STORED_ACTIVE_SECONDS);
  } catch {
    return 0;
  }
}

export function storeActiveSeconds(storage: KeyValueStorage, key: string, seconds: number): void {
  try {
    const safe = Number.isFinite(seconds) ? Math.min(Math.max(0, Math.floor(seconds)), MAX_STORED_ACTIVE_SECONDS) : 0;
    storage.setItem(key, String(safe));
  } catch {
    // Penyimpanan tidak tersedia (mode privat dsb.): sesi berjalan
    // tanpa persistensi, bukan kegagalan membaca.
  }
}

export function clearStoredActiveSeconds(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Abaikan — kunci basi paling buruk tertinggal dan dimuat ulang
    // pada kunjungan yang sudah tercatat tuntas (tidak terpakai).
  }
}

/**
 * Format durasi target/sisa waktu membaca untuk tampilan:
 * di bawah semenit "±45 dtk", sesudahnya "±3 menit", dan jam bila
 * panjang ("±1 jam 5 menit"). Tanda ± menegaskan ini perkiraan
 * kewajaran, bukan tenggat yang menghukum.
 */
export function formatReadingDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (safe < 60) return `±${safe} dtk`;
  const minutes = Math.round(safe / 60);
  if (minutes < 60) return `±${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `±${hours} jam ${rest} menit` : `±${hours} jam`;
}
