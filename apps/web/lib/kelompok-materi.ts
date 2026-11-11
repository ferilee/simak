// Helper murni untuk saringan kelompok materi (topic_group modul):
// perencanaan chip dari isi daftar modul, pencocokan saringan, daftar
// kelompok per mapel bebas untuk dropdown formulir, dan pengurai saran
// kelompok dari judul modul.
// Run-time-nya sederhana: kolom topic_group adalah sumber kebenaran;
// judul hanya dibaca SATU kali sebagai saran di formulir edit (guru
// yang memutuskan dengan klik) — tidak pernah menyaring diam-diam.

export type TopicGroupListEntry = {
  subject: string;
  groups: string[];
};

export const TOPIC_FILTER_SEMUA = "semua";
export const TOPIC_FILTER_LAINNYA = "__lainnya__";

export type TopicChip = {
  /** Nilai saringan: nama kelompok, atau TOPIC_FILTER_LAINNYA. */
  key: string;
  label: string;
  count: number;
};

function cleanGroup(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Chip saringan dari daftar modul milik guru: hanya kelompok yang
 * benar-benar terisi yang tampil (dengan hitungannya), diurutkan
 * mengikuti urutan kurikulum lebih dulu, sisanya alfabetis, dan chip
 * "Lainnya" (modul belum dikelompokkan) selalu paling akhir.
 */
export function planTopicChips(
  modules: ReadonlyArray<{ topic_group: string | null }>,
  canonicalOrder: readonly string[],
): TopicChip[] {
  const counts = new Map<string, number>();
  let lainnya = 0;
  for (const module of modules) {
    const group = cleanGroup(module.topic_group);
    if (group === null) lainnya++;
    else counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const ordered: TopicChip[] = [];
  for (const name of canonicalOrder) {
    const count = counts.get(name);
    if (count !== undefined) {
      ordered.push({ key: name, label: name, count });
      counts.delete(name);
    }
  }
  for (const name of [...counts.keys()].sort((a, b) => a.localeCompare(b, "id"))) {
    ordered.push({ key: name, label: name, count: counts.get(name)! });
  }
  if (lainnya > 0) ordered.push({ key: TOPIC_FILTER_LAINNYA, label: "Lainnya", count: lainnya });
  return ordered;
}

export function matchesTopicFilter(topicGroup: string | null, filter: string): boolean {
  if (filter === TOPIC_FILTER_SEMUA) return true;
  const group = cleanGroup(topicGroup);
  if (filter === TOPIC_FILTER_LAINNYA) return group === null;
  return group === filter;
}

/**
 * Saran kelompok dari judul berpola "… — <Kelompok> (ATP x.y)":
 * potongan sesudah "—" terakhir dan sebelum " (ATP". Judul di luar pola
 * itu mengembalikan null (tidak ada saran).
 */
export function parseTopicGroupFromTitle(title: string): string | null {
  const atpAt = title.indexOf(" (ATP ");
  if (atpAt < 0) return null;
  const head = title.slice(0, atpAt);
  const dashAt = head.lastIndexOf("—");
  if (dashAt < 0) return null;
  return cleanGroup(head.slice(dashAt + 1));
}

/** Kunci pencocokan mapel bebas — cermin subjectMatchKeys di sisi API. */
export function subjectMatchKeys(raw: string): string[] {
  const full = raw.trim().toLowerCase();
  const keys = new Set<string>([full]);
  const open = full.indexOf("(");
  const close = full.lastIndexOf(")");
  if (open >= 0 && close > open) {
    keys.add(full.slice(open + 1, close).trim());
    keys.add(full.slice(0, open).trim());
  }
  return [...keys].filter((key) => key.length > 0);
}

/** Daftar kelompok untuk mapel bebas pada formulir; [] bila tak dikenal. */
export function groupsForSubject(topicGroups: readonly TopicGroupListEntry[], rawSubject: string): string[] {
  const rawKeys = subjectMatchKeys(rawSubject);
  const match = topicGroups.find((entry) => subjectMatchKeys(entry.subject).some((key) => rawKeys.includes(key)));
  return match ? match.groups : [];
}

/** Urutan kanonis semua kelompok (untuk mengurutkan chip). */
export function canonicalTopicOrder(topicGroups: readonly TopicGroupListEntry[]): string[] {
  return topicGroups.flatMap((entry) => entry.groups);
}
