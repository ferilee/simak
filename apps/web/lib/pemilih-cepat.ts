// Helper murni untuk PemilihCepat (components/PemilihCepat.tsx):
// pencocokan pencarian bebas-urutan, pengelompokan modul menurut
// topic_group (urutan kurikulum yang sama dengan chip Materi saya),
// penyorotan kata yang cocok, dan pengurutan LKPD berpasangan ATP
// untuk formulir penugasan. Semua keputusan tampilan yang bisa diuji
// hidup di sini; komponen hanya menggambar dan meneruskan peristiwa.

export type PickerOption = {
  id: number;
  title: string;
  /** Nama kelompok asal opsi (topic_group untuk modul); null bila tak berkelompok. */
  group: string | null;
};

export type PickerGroup = {
  /** Kepala grup; null = daftar datar tanpa kepala. */
  label: string | null;
  options: PickerOption[];
  /** Grup terlipat saat panel dibuka (dibuka paksa saat ada pencarian). */
  collapsedByDefault?: boolean;
  /** Lencana kecil yang ditempel pada setiap butir di grup ini. */
  badge?: string | null;
  /** Penanda grup "Pasangan ATP x.y" dari orderWorksheetsForPairing. */
  paired?: boolean;
};

/** Label grup modul tanpa topic_group — selalu terakhir dan terlipat. */
export const PICKER_LAINNYA_LABEL = "Lainnya & arsip lama";

/**
 * Normalisasi teks untuk pencocokan: huruf kecil + lipat diakritik
 * dasar (é→e, ü→u, …) lewat dekomposisi Unicode. Cukup untuk judul
 * berbahasa Indonesia/Inggris yang dipakai SIMAK.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function queryTokens(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter((token) => token.length > 0);
}

/**
 * Saring opsi menurut query: query dipecah menjadi token dan opsi
 * lolos bila SETIAP token muncul sebagai substring pada judul
 * ternormalisasi (bebas urutan). Query kosong mengembalikan semua.
 */
export function filterPickerOptions<T extends { title: string }>(options: readonly T[], query: string): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [...options];
  return options.filter((option) => {
    const haystack = normalizeText(option.title);
    return tokens.every((token) => haystack.includes(token));
  });
}

function cleanGroupName(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Kelompokkan modul untuk pemilih penugasan: grup mengikuti
 * groupOrder (urutan kurikulum dari /kurikulum/groups — sumber yang
 * sama dengan chip Materi saya lewat canonicalTopicOrder), grup tak
 * dikenal sesudahnya menurut abjad, dan modul tanpa topic_group selalu
 * terakhir sebagai "Lainnya & arsip lama" yang terlipat secara bawaan.
 * Di dalam grup, butir diurutkan menurut judul menaik.
 */
export function groupModulesForPicker(
  modules: ReadonlyArray<{ id: number; title: string; topic_group: string | null }>,
  groupOrder: readonly string[],
): PickerGroup[] {
  const buckets = new Map<string, PickerOption[]>();
  const lainnya: PickerOption[] = [];
  for (const module of modules) {
    const option: PickerOption = { id: module.id, title: module.title, group: cleanGroupName(module.topic_group) };
    if (option.group === null) lainnya.push(option);
    else {
      const bucket = buckets.get(option.group) ?? [];
      bucket.push(option);
      buckets.set(option.group, bucket);
    }
  }
  const byTitle = (a: PickerOption, b: PickerOption) => a.title.localeCompare(b.title, "id");
  const groups: PickerGroup[] = [];
  for (const name of groupOrder) {
    const bucket = buckets.get(name);
    if (bucket && bucket.length > 0) {
      groups.push({ label: name, options: bucket.sort(byTitle) });
      buckets.delete(name);
    }
  }
  for (const name of [...buckets.keys()].sort((a, b) => a.localeCompare(b, "id"))) {
    groups.push({ label: name, options: buckets.get(name)!.sort(byTitle) });
  }
  if (lainnya.length > 0) {
    groups.push({ label: PICKER_LAINNYA_LABEL, options: lainnya.sort(byTitle), collapsedByDefault: true });
  }
  return groups;
}

export type HighlightPart = { text: string; match: boolean };

// Lipat satu karakter untuk pencocokan, sambil mencatat indeks asal
// supaya rentang cocok pada teks ternormalisasi bisa dipetakan kembali
// ke judul asli (diakritik prafaktur mengubah panjang string).
function foldWithIndexMap(title: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < title.length; i++) {
    const folded = normalizeText(title[i]);
    for (let j = 0; j < folded.length; j++) {
      normalized += folded[j];
      map.push(i);
    }
  }
  return { normalized, map };
}

/**
 * Pecah judul menjadi segmen { text, match } untuk penyorotan: semua
 * kemunculan setiap token query ditandai match (tumpang tindih
 * digabung). Tanpa token → satu segmen utuh tak cocok.
 */
export function highlightParts(title: string, query: string): HighlightPart[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0 || title.length === 0) return [{ text: title, match: false }];
  const { normalized, map } = foldWithIndexMap(title);
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = normalized.indexOf(token, from);
      if (at === -1) break;
      ranges.push([at, at + token.length]);
      from = at + 1;
    }
  }
  if (ranges.length === 0) return [{ text: title, match: false }];
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    const origStart = map[start];
    const origEnd = map[end - 1] + 1;
    if (origStart > cursor) parts.push({ text: title.slice(cursor, origStart), match: false });
    parts.push({ text: title.slice(origStart, origEnd), match: true });
    cursor = origEnd;
  }
  if (cursor < title.length) parts.push({ text: title.slice(cursor), match: false });
  return parts;
}

/**
 * Kode ATP dari judul: pola "(ATP 2.4)" pada judul modul maupun pola
 * "ATP 2.4" pada judul LKPD ("LKPD ATP 2.4 — …"). Null bila tak ada.
 */
export function parseAtpCode(title: string): string | null {
  const match = /ATP\s+(\d+\.\d+)/i.exec(title);
  return match ? match[1] : null;
}

/**
 * Urutkan LKPD untuk pemilih penugasan menurut modul terpilih: LKPD
 * berkode ATP sama dengan modul tampil lebih dulu dalam grup
 * "Pasangan ATP x.y" (berlencana sama pada tiap butir), sisanya dalam
 * grup datar "LKPD lainnya" (urutan muatan dipertahankan). Modul tanpa
 * kode ATP / belum dipilih / tanpa pasangan yang cocok → satu grup
 * datar tanpa label berisi semua LKPD. Hanya urutan + label yang
 * diatur — nilai terpilih tidak pernah diubah fungsi ini.
 */
export function orderWorksheetsForPairing(
  worksheets: ReadonlyArray<{ id: number; title: string }>,
  moduleTitle: string | null,
): PickerGroup[] {
  const flat: PickerOption[] = worksheets.map((worksheet) => ({ id: worksheet.id, title: worksheet.title, group: null }));
  const code = moduleTitle ? parseAtpCode(moduleTitle) : null;
  if (!code) return [{ label: null, options: flat }];
  const paired = flat.filter((option) => parseAtpCode(option.title) === code);
  if (paired.length === 0) return [{ label: null, options: flat }];
  const rest = flat.filter((option) => parseAtpCode(option.title) !== code);
  const groups: PickerGroup[] = [
    { label: `Pasangan ATP ${code}`, options: paired, paired: true, badge: `Pasangan ATP ${code}` },
  ];
  if (rest.length > 0) groups.push({ label: "LKPD lainnya", options: rest });
  return groups;
}
