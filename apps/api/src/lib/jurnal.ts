// Jurnal Belajar (Hub Murid Tahap 3): katalog prompt refleksi + mood,
// validasi entri, dan perencana murni untuk riwayat murid dan ringkasan
// guru. Semua keputusan yang bisa diuji tanpa basis data tinggal di
// sini; routes/jurnal.ts hanya membaca/menulis baris dan memanggil
// fungsi-fungsi ini.
//
// Keputusan pemilik yang terkunci di berkas ini:
// - Prompt refleksi BAWAAN saja (guru tidak membuat prompt) → katalog
//   data-di-kode, pola yang sama dengan lib/kurikulum.ts: perubahan
//   prompt adalah perubahan kode yang ditinjau dan terbit bersama rilis.
// - Jurnal tidak menghasilkan XP dan tidak dinilai: tidak ada skor,
//   tidak ada kait ke lib/xp.ts di paket ini.
// - Guru membaca jurnal murid dalam jangkauannya, hanya-baca.

// ---------------------------------------------------------------------------
// Katalog prompt refleksi (gaya Transform DELTA: pemahaman awal vs akhir)
// ---------------------------------------------------------------------------

export type JournalPrompt = { key: string; text: string };

export const JOURNAL_PROMPTS: readonly JournalPrompt[] = [
  { key: "perubahan-pemahaman", text: "Apa yang berubah dari pemahamanmu hari ini?" },
  { key: "masih-bingung", text: "Bagian mana yang masih membingungkan?" },
  { key: "strategi-berhasil", text: "Strategi apa yang berhasil untukmu?" },
  { key: "target-berikutnya", text: "Apa target belajarmu berikutnya?" },
];

export function isJournalPromptKey(value: unknown): value is string {
  return typeof value === "string" && JOURNAL_PROMPTS.some((prompt) => prompt.key === value);
}

/** Teks prompt untuk kunci yang dikenal; null untuk kunci asing/null. */
export function journalPromptText(key: string | null): string | null {
  if (key === null) return null;
  return JOURNAL_PROMPTS.find((prompt) => prompt.key === key)?.text ?? null;
}

// ---------------------------------------------------------------------------
// Katalog mood: himpunan kecil penanda perasaan. Kuncinya yang disimpan
// di basis data; label + emoji adalah urusan tampil yang diputuskan di
// sini agar API dan web tidak pernah berbeda kata.
// ---------------------------------------------------------------------------

export type JournalMood = { key: string; label: string; emoji: string };

export const JOURNAL_MOODS: readonly JournalMood[] = [
  { key: "bersemangat", label: "Bersemangat", emoji: "⚡" },
  { key: "senang", label: "Senang", emoji: "😊" },
  { key: "biasa", label: "Biasa saja", emoji: "😐" },
  { key: "lelah", label: "Lelah", emoji: "😮‍💨" },
  { key: "cemas", label: "Cemas", emoji: "😟" },
];

export function isJournalMoodKey(value: unknown): value is string {
  return typeof value === "string" && JOURNAL_MOODS.some((mood) => mood.key === value);
}

export function journalMoodByKey(key: string | null): JournalMood | null {
  if (key === null) return null;
  return JOURNAL_MOODS.find((mood) => mood.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Validasi entri. Bentuk masukan mentah dari badan JSON; hasil validasi
// adalah draf ternormalisasi (body ter-trim, kunci asing ditolak) atau
// pesan galat ramah. Pemeriksaan linked_module_id terhadap keterlihatan
// modul BUKAN di sini — itu pemeriksaan basis data di rute.
// ---------------------------------------------------------------------------

export const JOURNAL_BODY_MAX_LENGTH = 5000;

export type JournalEntryDraft = {
  body: string;
  promptKey: string | null;
  mood: string | null;
  linkedModuleId: number | null;
};

export type JournalEntryPatch = {
  body?: string;
  promptKey?: string | null;
  mood?: string | null;
  linkedModuleId?: number | null;
};

type RawJournalInput = {
  body?: unknown;
  prompt_key?: unknown;
  mood?: unknown;
  linked_module_id?: unknown;
};

function validateBody(value: unknown): string | { body: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return "Isi jurnal tidak boleh kosong — tulis dulu refleksimu.";
  }
  const body = value.trim();
  if (body.length > JOURNAL_BODY_MAX_LENGTH) {
    return `Isi jurnal maksimal ${JOURNAL_BODY_MAX_LENGTH.toLocaleString("id-ID")} karakter.`;
  }
  return { body };
}

function validatePromptKey(value: unknown): string | { promptKey: string | null } {
  if (value === undefined || value === null) return { promptKey: null };
  if (!isJournalPromptKey(value)) return "Prompt refleksi tidak dikenal.";
  return { promptKey: value };
}

function validateMood(value: unknown): string | { mood: string | null } {
  if (value === undefined || value === null) return { mood: null };
  if (!isJournalMoodKey(value)) return "Penanda perasaan tidak dikenal.";
  return { mood: value };
}

function validateLinkedModuleId(value: unknown): string | { linkedModuleId: number | null } {
  if (value === undefined || value === null) return { linkedModuleId: null };
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return "Kaitan materi tidak sah.";
  }
  return { linkedModuleId: value };
}

export function validateJournalCreate(input: RawJournalInput): { draft: JournalEntryDraft } | { error: string } {
  const body = validateBody(input.body);
  if (typeof body === "string") return { error: body };
  const promptKey = validatePromptKey(input.prompt_key);
  if (typeof promptKey === "string") return { error: promptKey };
  const mood = validateMood(input.mood);
  if (typeof mood === "string") return { error: mood };
  const linkedModuleId = validateLinkedModuleId(input.linked_module_id);
  if (typeof linkedModuleId === "string") return { error: linkedModuleId };
  return { draft: { body: body.body, promptKey: promptKey.promptKey, mood: mood.mood, linkedModuleId: linkedModuleId.linkedModuleId } };
}

/**
 * Suntingan: hanya field yang DIKIRIM yang divalidasi dan diubah;
 * field yang tidak dikirim tidak muncul di hasil (undefined), field
 * yang dikirim null berarti dikosongkan. entry_date tidak pernah bisa
 * disunting — field itu tidak dikenal di sini dan diabaikan.
 */
export function validateJournalPatch(input: RawJournalInput): { patch: JournalEntryPatch } | { error: string } {
  const patch: JournalEntryPatch = {};
  if (input.body !== undefined) {
    const body = validateBody(input.body);
    if (typeof body === "string") return { error: body };
    patch.body = body.body;
  }
  if (input.prompt_key !== undefined) {
    const promptKey = validatePromptKey(input.prompt_key);
    if (typeof promptKey === "string") return { error: promptKey };
    patch.promptKey = promptKey.promptKey;
  }
  if (input.mood !== undefined) {
    const mood = validateMood(input.mood);
    if (typeof mood === "string") return { error: mood };
    patch.mood = mood.mood;
  }
  if (input.linked_module_id !== undefined) {
    const linkedModuleId = validateLinkedModuleId(input.linked_module_id);
    if (typeof linkedModuleId === "string") return { error: linkedModuleId };
    patch.linkedModuleId = linkedModuleId.linkedModuleId;
  }
  if (Object.keys(patch).length === 0) return { error: "Tidak ada perubahan yang dikirim." };
  return { patch };
}

// ---------------------------------------------------------------------------
// Kepemilikan + tanggal
// ---------------------------------------------------------------------------

/** Satu-satunya aturan kepemilikan jurnal: entri hanya milik penulisnya. */
export function journalEntryOwnedBy(entryStudentId: number, userId: number): boolean {
  return entryStudentId === userId;
}

/**
 * Tanggal "hari ini" menurut WIB (Asia/Jakarta) sebagai "YYYY-MM-DD" —
 * tanggal jurnal diputuskan server dari jam dinding WIB, bukan dari
 * zona waktu perangkat murid (mengikuti cara repo memperlakukan WIB,
 * mis. parseWibRange di routes/reports.ts yang menambatkan +07:00).
 */
export function todayWib(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// ---------------------------------------------------------------------------
// Pengelompokan riwayat per tanggal (dipakai tampilan murid): entri
// masuk sudah terurut terbaru dulu; kelompok mengikuti urutan kemunculan
// pertama tanggalnya, isi kelompok mempertahankan urutan masuk.
// ---------------------------------------------------------------------------

export function groupEntriesByDate<T extends { entryDate: string }>(
  entries: readonly T[],
): { date: string; entries: T[] }[] {
  const groups: { date: string; entries: T[] }[] = [];
  const byDate = new Map<string, { date: string; entries: T[] }>();
  for (const entry of entries) {
    let group = byDate.get(entry.entryDate);
    if (!group) {
      group = { date: entry.entryDate, entries: [] };
      byDate.set(entry.entryDate, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sisi guru: statistik per murid + perencana ringkasan per kelas.
//
// Aturan keterlihatan MENIRU Pantau Hasil/Rekap (routes/reports.ts
// getTargetStudents) persis — bukan relasi baru:
// - murid terlihat bila ia anggota kelas sasaran (assignment_classes →
//   kelas tidak terarsip → class_members) dari penugasan milik guru, ATAU
// - ia sasaran langsung (assignment_students) penugasan milik guru;
//   kelas tampilnya diatasi dengan aturan lib/student-class.ts
//   (berpreferensi mapel penugasan; tak teratasi → kelas id 0, nama "").
// ---------------------------------------------------------------------------

export type JournalStatRow = { studentId: number; entryDate: string; createdAt: Date };

export type JournalStudentStat = {
  entryCount: number;
  lastEntryDate: string | null;
  lastEntryAt: Date | null;
};

/** Lipat baris (studentId, entryDate, createdAt) menjadi hitungan + entri terakhir per murid. */
export function reduceJournalStats(rows: readonly JournalStatRow[]): Map<number, JournalStudentStat> {
  const stats = new Map<number, JournalStudentStat>();
  for (const row of rows) {
    const current = stats.get(row.studentId) ?? { entryCount: 0, lastEntryDate: null, lastEntryAt: null };
    current.entryCount += 1;
    const isLater =
      current.lastEntryDate === null ||
      row.entryDate > current.lastEntryDate ||
      (row.entryDate === current.lastEntryDate && (current.lastEntryAt === null || row.createdAt.getTime() > current.lastEntryAt.getTime()));
    if (isLater) {
      current.lastEntryDate = row.entryDate;
      current.lastEntryAt = row.createdAt;
    }
    stats.set(row.studentId, current);
  }
  return stats;
}

export type TeacherJournalMemberInput = { classId: number; studentId: number; name: string; username: string };
export type TeacherJournalDirectInput = { studentId: number; name: string; username: string; classId: number; className: string };

export type TeacherJournalStudent = {
  id: number;
  name: string;
  username: string;
  entry_count: number;
  last_entry_date: string | null;
};

export type TeacherJournalClassGroup = {
  id: number;
  name: string;
  students: TeacherJournalStudent[];
};

/** Semua id murid yang berada dalam jangkauan guru menurut aturan di atas. */
export function collectVisibleStudentIds(
  members: readonly TeacherJournalMemberInput[],
  directStudents: readonly TeacherJournalDirectInput[],
): number[] {
  const ids = new Set<number>();
  for (const member of members) ids.add(member.studentId);
  for (const direct of directStudents) ids.add(direct.studentId);
  return [...ids];
}

/**
 * Susun ringkasan jurnal guru: daftar kelas → daftar murid beserta
 * jumlah entri + tanggal entri terakhir. Murid anggota kelas sasaran
 * tampil di kelasnya; murid sasaran langsung tampil di kelas hasil
 * aturan student-class (kelompok kelas dibuat bila belum ada; kelas
 * tak teratasi = id 0 tampil terakhir). Murid yang sudah tampil sebagai
 * anggota pada kelas yang sama tidak digandakan oleh jalur langsung.
 * Kelas terurut nama (kelompok tanpa nama terakhir), murid terurut nama.
 */
export function planTeacherJournalOverview(input: {
  classes: readonly { id: number; name: string }[];
  members: readonly TeacherJournalMemberInput[];
  directStudents: readonly TeacherJournalDirectInput[];
  stats: ReadonlyMap<number, JournalStudentStat>;
}): TeacherJournalClassGroup[] {
  const groups = new Map<number, TeacherJournalClassGroup>();
  const ensureGroup = (id: number, name: string): TeacherJournalClassGroup => {
    let group = groups.get(id);
    if (!group) {
      group = { id, name, students: [] };
      groups.set(id, group);
    }
    return group;
  };
  for (const kelas of input.classes) ensureGroup(kelas.id, kelas.name);

  const seenInClass = new Set<string>();
  const addStudent = (classId: number, className: string, student: { id: number; name: string; username: string }) => {
    const key = `${classId}:${student.id}`;
    if (seenInClass.has(key)) return;
    seenInClass.add(key);
    const stat = input.stats.get(student.id);
    ensureGroup(classId, className).students.push({
      id: student.id,
      name: student.name,
      username: student.username,
      entry_count: stat?.entryCount ?? 0,
      last_entry_date: stat?.lastEntryDate ?? null,
    });
  };

  for (const member of input.members) {
    const group = groups.get(member.classId);
    addStudent(member.classId, group?.name ?? "", { id: member.studentId, name: member.name, username: member.username });
  }
  for (const direct of input.directStudents) {
    addStudent(direct.classId, direct.className, { id: direct.studentId, name: direct.name, username: direct.username });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.students.sort((a, b) => a.name.localeCompare(b.name, "id") || a.id - b.id);
  }
  result.sort((a, b) => {
    if (a.id === 0) return 1;
    if (b.id === 0) return -1;
    return a.name.localeCompare(b.name, "id") || a.id - b.id;
  });
  return result;
}
