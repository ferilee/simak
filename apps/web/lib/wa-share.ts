// Pesan "Bagikan WA" untuk penugasan terbit (dibangun di halaman guru).
// Fungsi murni: tanggal diformat Asia/Jakarta dari due_at, tanpa state/DOM,
// supaya formatnya bisa dikunci dengan tes emas (wa-share.test.mjs).

export type WhatsAppShareClass = { name: string; join_code?: string | null };

export type WhatsAppShareAssignment = {
  title: string;
  due_at: string;
  ruas_quiz_url: string | null;
  work_mode?: "individu" | "kelompok";
  classes: WhatsAppShareClass[];
};

const RUAS_FALLBACK_URL = "https://ruas.smkpasirian-lmj.sch.id";

export function buildWhatsAppShareMessage(assignment: WhatsAppShareAssignment, origin: string) {
  const due = new Date(assignment.due_at);
  // Tanggal dan jam diformat terpisah lalu digabung kata "pukul" sendiri,
  // supaya hasil tidak bergantung pada literal bawaan data ICU per-runtime.
  const datePart = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(due);
  const timePart = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(due);

  const lines = [`📚 *${assignment.title}*`];
  if (assignment.classes.length > 0) {
    lines.push(`Kelas: ${assignment.classes.map((kelas) => kelas.name).join(", ")}`);
  }
  const codedClasses = assignment.classes.filter((kelas) => kelas.join_code);
  if (codedClasses.length > 0) {
    // Satu kelas: cukup kodenya. Banyak kelas: pasangan "Nama — KODE" agar
    // tidak ambigu; kelas tanpa kode dilewati.
    const codes = assignment.classes.length === 1
      ? String(codedClasses[0]!.join_code)
      : codedClasses.map((kelas) => `${kelas.name} — ${kelas.join_code}`).join(" · ");
    lines.push(`Kode kelas: ${codes}`);
  }
  if (assignment.work_mode === "kelompok") {
    lines.push("👥 Penugasan ini dikerjakan berkelompok — lihat kelompokmu di SIMAK.");
  }
  lines.push(
    "",
    "Kegiatan belajar hari ini:",
    `1. Baca dan pahami materi di SIMAK ${origin}`,
    "2. Kerjakan LKPD-nya di SIMAK",
    `3. Kerjakan kuis di RUAS ${assignment.ruas_quiz_url ? assignment.ruas_quiz_url : RUAS_FALLBACK_URL}`,
    "4. Isi exit ticket 3-2-1 di SIMAK",
    "",
    `⏰ Batas pengumpulan: ${datePart} pukul ${timePart} WIB — pengumpulan tercatat sebagai kehadiran.`,
    "🔑 Gunakan akun RUAS untuk masuk ke SIMAK",
  );
  return lines.join("\n");
}
