// Blok Media Interaktif (H5P v1): berkas HTML mandiri hasil ekspor
// Lumi yang diunggah guru adalah JavaScript arbitrer, jadi seluruh
// permukaan paket ini dirancang agar HTML itu tidak pernah hidup di
// asal SIMAK:
//  - Objeknya disimpan di bawah awalan kunci khusus "interaktif/".
//  - Satu-satunya jalan keluarnya adalah route penyajian API yang
//    membalas dengan Content-Security-Policy: sandbox allow-scripts
//    (dokumen menjadi asal buram, tanpa akses ke cookie/DOM SIMAK)
//    dan dirangkaikan iframe sandbox="allow-scripts" di web.
//  - Kunci di luar awalan ini tidak dilayani route itu, dan route
//    unduhan biasa (/uploads/download) menolak awalan ini — tidak ada
//    jalan memutar lewat URL bertanda tangan penyimpanan.

/** Awalan kunci objek penyimpanan khusus berkas HTML interaktif. */
export const INTERAKTIF_KEY_PREFIX = "interaktif/";

/** Batas ukuran unggahan HTML interaktif: 25 MB. Ekspor Lumi memuat
 * seluruh pustaka H5P di dalam satu berkas, jadi batas lampiran biasa
 * (10 MB) tidak cukup. Angka yang sama ditegakkan skema presign di
 * @simak/shared (presignInteraktifUploadSchema). */
export const INTERAKTIF_MAX_SIZE_BYTES = 25 * 1024 * 1024;

/** Header CSP persis yang dikirim route penyajian: dokumen boleh
 * menjalankan skripnya sendiri tetapi terkurung sebagai asal buram. */
export const INTERAKTIF_CSP_HEADER = "sandbox allow-scripts";

export function isInteraktifKey(key: string): boolean {
  return key.startsWith(INTERAKTIF_KEY_PREFIX);
}

const HTML_HEAD_BYTES = 1024;

/**
 * Pemeriksaan isi ringan untuk berkas yang mengaku HTML: sesudah BOM
 * UTF-8 dan spasi awal dibuang, kepala berkas harus diawali deklarasi
 * "<!doctype html" atau tag "<html" (huruf besar/kecil bebas). Berkas
 * yang jelas bukan HTML (PDF, ZIP, teks polos, JSON) ditolak. Hanya
 * 1 KB pertama yang dinilai — cukup untuk penanda awal dokumen.
 */
export function looksLikeHtmlHead(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, HTML_HEAD_BYTES);
  let text = new TextDecoder("utf-8").decode(head);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const trimmed = text.replace(/^\s+/, "").toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}
