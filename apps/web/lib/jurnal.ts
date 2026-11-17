// Jurnal Belajar (Hub Murid Tahap 3) di sisi web: tipe payload API
// jurnal + helper tampil murni. Katalog prompt dan mood adalah milik
// server (API lib/jurnal.ts adalah sumber tunggalnya) — berkas ini
// TIDAK menyalin daftarnya; halaman menerima katalog dari respons
// GET /murid/jurnal dan label prompt/mood setiap entri sudah diatasi
// server (prompt_text, mood_label, mood_emoji).

export type JournalPrompt = { key: string; text: string };

export type JournalMood = { key: string; label: string; emoji: string };

export type JournalEntry = {
  id: number;
  entry_date: string;
  body: string;
  prompt_key: string | null;
  prompt_text: string | null;
  mood: string | null;
  mood_label: string | null;
  mood_emoji: string | null;
  linked_module_id: number | null;
  linked_module_title: string | null;
  teacher_response: string | null;
  teacher_response_at: string | null;
  teacher_responded_by: number | null;
  teacher_responded_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JournalListData = {
  entries: JournalEntry[];
  total: number;
  prompts: JournalPrompt[];
  moods: JournalMood[];
};

export type GuruJournalStudent = {
  id: number;
  name: string;
  username: string;
  entry_count: number;
  unreviewed_count: number;
  last_entry_date: string | null;
};

export type GuruJournalClass = {
  id: number;
  name: string;
  students: GuruJournalStudent[];
};

export type GuruJournalOverviewData = { classes: GuruJournalClass[]; unreviewed_total: number };

export type GuruJournalEntriesData = {
  student: { id: number; name: string; username: string };
  entries: JournalEntry[];
  total: number;
};

/**
 * Label tanggal jurnal yang ramah, mis. "Sabtu, 15 November 2026".
 * Tanggal "YYYY-MM-DD" ditambatkan ke tengah hari UTC agar labelnya
 * tidak bergeser hari saat diformat di zona Asia/Jakarta.
 */
export function journalDateLabel(entryDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entryDate);
  if (!match) return entryDate;
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instant);
}

/**
 * Label tanggal + jam untuk cap waktu tanggapan guru (ISO dari
 * server), mis. "17 November 2026 pukul 11.12" menurut WIB. String
 * yang tidak terbaca sebagai tanggal diteruskan apa adanya; null
 * menjadi string kosong.
 */
export function journalDateTimeLabel(iso: string | null): string {
  if (iso === null) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/**
 * Kelompokkan entri (sudah terurut terbaru dulu dari server) per
 * tanggal jurnal — urutan kelompok mengikuti kemunculan pertama
 * tanggalnya, isi kelompok mempertahankan urutan masuk.
 */
export function groupEntriesByDate(
  entries: readonly JournalEntry[],
): { date: string; label: string; entries: JournalEntry[] }[] {
  const groups: { date: string; label: string; entries: JournalEntry[] }[] = [];
  const byDate = new Map<string, { date: string; label: string; entries: JournalEntry[] }>();
  for (const entry of entries) {
    let group = byDate.get(entry.entry_date);
    if (!group) {
      group = { date: entry.entry_date, label: journalDateLabel(entry.entry_date), entries: [] };
      byDate.set(entry.entry_date, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Nama tampil kelompok kelas guru: kelas tanpa nama (id 0, sasaran langsung tak teratasi) tampil sebagai "Tanpa kelas". */
export function guruJournalClassLabel(kelas: Pick<GuruJournalClass, "id" | "name">): string {
  return kelas.name !== "" ? kelas.name : "Tanpa kelas";
}

/** Saringan kelas panel guru: null = semua kelas; selain itu hanya kelas itu. */
export function filterGuruJournalClasses(
  classes: readonly GuruJournalClass[],
  classId: number | null,
): GuruJournalClass[] {
  if (classId === null) return [...classes];
  return classes.filter((kelas) => kelas.id === classId);
}
