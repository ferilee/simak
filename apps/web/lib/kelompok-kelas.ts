// Pengelompokan kelas per jenjang untuk daftar "Kelas saya" di Langkah 3
// ruang guru (fitur Edit Kelas): jenjang diturunkan dari token pertama
// nama kelas ("X", "XI", "XII"); nama yang tidak diawali salah satunya
// masuk kelompok "Lainnya" di akhir. Fungsi murni — diuji perilaku di
// kelompok-kelas.test.mjs.

export type ClassLevelGroup<T> = {
  key: "X" | "XI" | "XII" | "LAINNYA";
  label: string;
  classes: T[];
};

const LEVEL_ORDER: { key: ClassLevelGroup<unknown>["key"]; label: string }[] = [
  { key: "X", label: "Kelas X" },
  { key: "XI", label: "Kelas XI" },
  { key: "XII", label: "Kelas XII" },
  { key: "LAINNYA", label: "Lainnya" },
];

export function classLevelKey(name: string): ClassLevelGroup<unknown>["key"] {
  const firstToken = name.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (firstToken === "X" || firstToken === "XI" || firstToken === "XII") return firstToken;
  return "LAINNYA";
}

export function groupClassesByLevel<T extends { name: string }>(items: readonly T[]): ClassLevelGroup<T>[] {
  const buckets = new Map<ClassLevelGroup<T>["key"], T[]>();
  for (const item of items) {
    const key = classLevelKey(item.name);
    const current = buckets.get(key) ?? [];
    current.push(item);
    buckets.set(key, current);
  }
  const groups: ClassLevelGroup<T>[] = [];
  for (const { key, label } of LEVEL_ORDER) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.length === 0) continue;
    groups.push({
      key,
      label,
      classes: [...bucket].sort((a, b) => a.name.localeCompare(b.name, "id")),
    });
  }
  return groups;
}
