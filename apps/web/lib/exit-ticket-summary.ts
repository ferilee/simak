// Ringkasan kelas exit ticket (v1.0.42) — helper murni.
//
// Latar: panel "Ringkasan exit ticket" guru menampilkan satu kartu per
// murid dengan jawaban 3-2-1 mereka (3 hal yang dipahami / 2 contoh
// penerapan / 1 hal yang membingungkan). Pada satu kelas penuh itu
// menjadi guliran panjang yang tidak terbaca — yang dibutuhkan guru
// adalah POLA kelasnya: jawaban apa yang paling banyak muncul, terutama
// pada bagian yang membingungkan. Helper di sini mengelompokkan jawaban
// per bagian secara deterministik (tanpa AI, tanpa mengubah data):
// jawaban dinormalisasi (trim, spasi diringkas, huruf kecil, tanda baca
// akhir dibuang) lalu digabung menurut kunci normalisasinya.
//
// Semua fungsi murni agar bisa diuji tanpa peramban
// (lihat exit-ticket-summary.test.mjs). Payload-nya adalah payload yang
// sama dengan yang sudah dimuat panel (GET /grading/assignments/:id):
// daftar murid sasaran beserta exit_ticket masing-masing (atau null).

/** Tiga bagian exit ticket 3-2-1, sesuai nama kolom pada payload. */
export type ExitTicketField = "understood_3" | "examples_2" | "confusing_1";

/** Satu exit ticket terkirim, diratakan dari baris murid pada payload. */
export type ExitTicketEntry = {
  student_id: number;
  student_name: string;
  submitted_at: string;
  understood_3: string;
  examples_2: string;
  confusing_1: string;
};

/** Satu kelompok jawaban serupa pada satu bagian. */
export type ExitAnswerGroup = {
  /** Kunci normalisasi (identitas kelompok). */
  key: string;
  /** Bentuk asli yang paling sering ditulis dalam kelompok ini. */
  text: string;
  /** Jumlah murid dalam kelompok. */
  count: number;
  /** Murid penulis, urut waktu pengiriman. */
  students: { id: number; name: string }[];
};

/**
 * Urutan bagian pada tampilan Ringkasan kelas: yang membingungkan
 * PALING ATAS (paling bisa ditindaklanjuti guru), lalu yang dipahami,
 * lalu contoh penerapan. Labelnya persis label kartu per murid yang
 * sudah ada, agar struktur 3-2-1 tetap dikenali.
 */
export const EXIT_TICKET_CLASS_SECTIONS: { field: ExitTicketField; label: string }[] = [
  { field: "confusing_1", label: "1 hal yang membingungkan" },
  { field: "understood_3", label: "3 hal yang dipahami" },
  { field: "examples_2", label: "2 contoh penerapan" },
];

/**
 * Normalisasi jawaban untuk pengelompokan: trim, spasi di dalam
 * diringkas menjadi satu, semua huruf kecil, lalu sisa tanda baca /
 * spasi di ujung dibuang ("Rumus bunga.", "rumus  bunga", "RUMUS
 * BUNGA!" → "rumus bunga"). Jawaban yang sesudah dinormalisasi kosong
 * (termasuk yang isinya hanya tanda baca) dianggap kosong.
 */
export function normalizeExitAnswer(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[\s.,!?]+$/, "");
}

/**
 * Kelompokkan jawaban satu bagian dari seluruh exit ticket.
 *
 * Tiket diproses urut waktu pengiriman (submitted_at menaik; urutan
 * payload dipertahankan bila waktunya sama). Jawaban kosong sesudah
 * normalisasi dilewati dan tidak dihitung. Bentuk perwakilan kelompok
 * adalah bentuk ASLI (sesudah trim tepi) yang paling sering ditulis;
 * seri → yang pertama kali terkirim. Kelompok diurutkan menurut jumlah
 * murid menurun; seri → kelompok yang pengiriman pertamanya lebih dulu.
 */
export function groupExitAnswers(tickets: ExitTicketEntry[], field: ExitTicketField): ExitAnswerGroup[] {
  const ordered = tickets
    .map((ticket, index) => ({ ticket, index }))
    .sort((a, b) => a.ticket.submitted_at.localeCompare(b.ticket.submitted_at) || a.index - b.index);

  type Draft = {
    key: string;
    firstIndex: number;
    variants: Map<string, { count: number; firstIndex: number }>;
    students: { id: number; name: string }[];
  };
  const drafts = new Map<string, Draft>();

  ordered.forEach(({ ticket }, position) => {
    const raw = ticket[field] ?? "";
    const key = normalizeExitAnswer(raw);
    if (!key) return;
    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, firstIndex: position, variants: new Map(), students: [] };
      drafts.set(key, draft);
    }
    const variantText = raw.trim();
    const variant = draft.variants.get(variantText);
    if (variant) variant.count += 1;
    else draft.variants.set(variantText, { count: 1, firstIndex: position });
    draft.students.push({ id: ticket.student_id, name: ticket.student_name });
  });

  return [...drafts.values()]
    .map((draft) => {
      let representative = "";
      let bestCount = -1;
      let bestFirst = Number.POSITIVE_INFINITY;
      for (const [text, variant] of draft.variants) {
        if (variant.count > bestCount || (variant.count === bestCount && variant.firstIndex < bestFirst)) {
          representative = text;
          bestCount = variant.count;
          bestFirst = variant.firstIndex;
        }
      }
      return {
        key: draft.key,
        text: representative,
        count: draft.students.length,
        students: draft.students,
        firstIndex: draft.firstIndex,
      };
    })
    .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
    .map(({ key, text, count, students }) => ({ key, text, count, students }));
}

/**
 * Saring kelompok jawaban menurut kata kunci: cocok bila kata kunci
 * (tanpa peka huruf besar/kecil) muncul pada teks perwakilan ATAU pada
 * nama salah satu murid dalam kelompok. Kata kunci kosong → semua
 * kelompok dikembalikan apa adanya.
 */
export function filterExitAnswerGroups(groups: ExitAnswerGroup[], query: string): ExitAnswerGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups.filter(
    (group) =>
      group.text.toLowerCase().includes(needle) ||
      group.key.includes(needle) ||
      group.students.some((student) => student.name.toLowerCase().includes(needle)),
  );
}

/**
 * Kecocokan satu murid terhadap kata kunci pada tampilan Per murid:
 * cocok bila kata kunci muncul pada nama murid ATAU pada salah satu
 * dari tiga teks exit ticket-nya. Murid tanpa exit ticket hanya bisa
 * cocok lewat nama. Kata kunci kosong → selalu cocok.
 */
export function exitTicketStudentMatches(
  student: { name: string; exit_ticket: { understood_3: string; examples_2: string; confusing_1: string } | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (student.name.toLowerCase().includes(needle)) return true;
  const ticket = student.exit_ticket;
  if (!ticket) return false;
  return [ticket.understood_3, ticket.examples_2, ticket.confusing_1].some((text) =>
    (text ?? "").toLowerCase().includes(needle),
  );
}
