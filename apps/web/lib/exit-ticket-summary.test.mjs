// Tests for "Ringkasan Kelas Exit Ticket" (v1.0.42): the teacher's exit
// ticket panel gains a class-pattern view — answers per 3-2-1 section
// are folded into deterministic groups (normalized text) with counts
// and author names, "1 hal yang membingungkan" first — while the
// per-student cards remain available unchanged behind a toggle.
// Run with bun from apps/web:  bun lib/exit-ticket-summary.test.mjs
import { readFileSync } from "node:fs";
import {
  EXIT_TICKET_CLASS_SECTIONS,
  exitTicketStudentMatches,
  filterExitAnswerGroups,
  groupExitAnswers,
  normalizeExitAnswer,
} from "./exit-ticket-summary.ts";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const page = readFileSync(new URL("../app/guru/page.tsx", import.meta.url), "utf8");

let seq = 0;
function ticket(name, fields = {}) {
  seq += 1;
  return {
    student_id: seq,
    student_name: name,
    submitted_at: `2026-11-04T0${Math.min(seq, 9)}:00:00.000Z`,
    understood_3: "",
    examples_2: "",
    confusing_1: "",
    ...fields,
  };
}

console.log("Case 1: normalizeExitAnswer — variasi penulisan menjadi satu kunci");
{
  check("trim + huruf kecil + titik akhir dibuang", normalizeExitAnswer("  Rumus Bunga.  ") === "rumus bunga", normalizeExitAnswer("  Rumus Bunga.  "));
  check("spasi ganda di dalam diringkas", normalizeExitAnswer("rumus   bunga") === "rumus bunga");
  check("tab/baris baru diringkas", normalizeExitAnswer("rumus\tbunga\nmajemuk") === "rumus bunga majemuk");
  check("tanda seru/tanya akhir dibuang", normalizeExitAnswer("APA?!") === "apa");
  check("titik beruntun di akhir dibuang", normalizeExitAnswer("halo...") === "halo");
  check("koma akhir dibuang", normalizeExitAnswer("hitung bunga,") === "hitung bunga");
  check("tanda baca di tengah dipertahankan", normalizeExitAnswer("a, b, dan c") === "a, b, dan c");
  check("hanya tanda baca → kosong", normalizeExitAnswer("...?!") === "");
  check("hanya spasi → kosong", normalizeExitAnswer("   ") === "");
  check("string kosong → kosong", normalizeExitAnswer("") === "");
}

console.log("Case 2: groupExitAnswers — jawaban serupa terlipat dengan hitungan");
{
  seq = 0;
  const tickets = [
    ticket("Andi", { confusing_1: "Rumus bunga" }),
    ticket("Budi", { confusing_1: "rumus bunga." }),
    ticket("Citra", { confusing_1: "RUMUS BUNGA!" }),
    ticket("Dedi", { confusing_1: "Rumus bunga" }),
    ticket("Eka", { confusing_1: "Cara membulatkan" }),
  ];
  const groups = groupExitAnswers(tickets, "confusing_1");
  check("lima jawaban → dua kelompok", groups.length === 2, String(groups.length));
  check("kelompok terbanyak di atas", groups[0].count === 4 && groups[1].count === 1);
  check("perwakilan = bentuk asli tersering ('Rumus bunga' ×2)", groups[0].text === "Rumus bunga", groups[0].text);
  check("kunci kelompok adalah bentuk normalisasi", groups[0].key === "rumus bunga");
  check(
    "anggota urut waktu kirim",
    JSON.stringify(groups[0].students.map((s) => s.name)) === JSON.stringify(["Andi", "Budi", "Citra", "Dedi"]),
    JSON.stringify(groups[0].students),
  );
  check("id anggota ikut tercatat", groups[0].students[0].id === 1 && groups[1].students[0].name === "Eka");
}

console.log("Case 3: perwakilan seri → yang pertama terkirim; jawaban berbeda tetap terpisah");
{
  seq = 0;
  const tickets = [
    ticket("Andi", { understood_3: "Bunga majemuk" }),
    ticket("Budi", { understood_3: "bunga MAJEMUK" }),
    ticket("Citra", { understood_3: "Bunga tunggal" }),
  ];
  const groups = groupExitAnswers(tickets, "understood_3");
  check("'Bunga majemuk' vs 'Bunga tunggal' tidak tercampur", groups.length === 2);
  const majemuk = groups.find((g) => g.key === "bunga majemuk");
  check("seri 1-1 → perwakilan bentuk yang pertama terkirim", majemuk.text === "Bunga majemuk", majemuk.text);
  check("seri jumlah → kelompok yang lebih dulu terkirim di atas", groups[0].key === "bunga majemuk");
}

console.log("Case 4: urutan proses mengikuti submitted_at, bukan urutan array");
{
  const late = { student_id: 21, student_name: "Sinta", submitted_at: "2026-11-04T02:00:00.000Z", understood_3: "", examples_2: "", confusing_1: "Soal cerita" };
  const early = { student_id: 22, student_name: "Rudi", submitted_at: "2026-11-04T01:00:00.000Z", understood_3: "", examples_2: "", confusing_1: "soal cerita" };
  const groups = groupExitAnswers([late, early], "confusing_1");
  check("satu kelompok", groups.length === 1);
  check(
    "anggota terurut menurut waktu kirim walau array terbalik",
    JSON.stringify(groups[0].students.map((s) => s.name)) === JSON.stringify(["Rudi", "Sinta"]),
    JSON.stringify(groups[0].students),
  );
  check("perwakilan seri → milik pengirim terdahulu", groups[0].text === "soal cerita", groups[0].text);
}

console.log("Case 5: jawaban kosong tidak terhitung; bagian tidak tercampur");
{
  seq = 0;
  const tickets = [
    ticket("Andi", { confusing_1: "   ", understood_3: "Paham bunga" }),
    ticket("Budi", { confusing_1: "...", understood_3: "" }),
    ticket("Citra", { confusing_1: "", understood_3: "paham bunga" }),
  ];
  check("bagian membingungkan semua kosong → tanpa kelompok", groupExitAnswers(tickets, "confusing_1").length === 0);
  const understood = groupExitAnswers(tickets, "understood_3");
  check("bagian dipahami terlipat sendiri (2 murid)", understood.length === 1 && understood[0].count === 2);
  check("daftar tiket kosong → tanpa kelompok", groupExitAnswers([], "examples_2").length === 0);
}

console.log("Case 6: EXIT_TICKET_CLASS_SECTIONS — membingungkan paling atas");
{
  check(
    "urutan bagian: membingungkan, dipahami, penerapan",
    JSON.stringify(EXIT_TICKET_CLASS_SECTIONS.map((s) => s.field)) === JSON.stringify(["confusing_1", "understood_3", "examples_2"]),
    JSON.stringify(EXIT_TICKET_CLASS_SECTIONS),
  );
  check(
    "label persis label kartu per murid",
    JSON.stringify(EXIT_TICKET_CLASS_SECTIONS.map((s) => s.label)) === JSON.stringify(["1 hal yang membingungkan", "3 hal yang dipahami", "2 contoh penerapan"]),
  );
}

console.log("Case 7: filterExitAnswerGroups — cari pada teks dan nama");
{
  seq = 0;
  const tickets = [
    ticket("Andi", { confusing_1: "Rumus bunga" }),
    ticket("Budi Santoso", { confusing_1: "rumus bunga" }),
    ticket("Citra", { confusing_1: "Grafik fungsi" }),
  ];
  const groups = groupExitAnswers(tickets, "confusing_1");
  check("kata kunci kosong → semua kelompok", filterExitAnswerGroups(groups, "  ").length === 2);
  check("cocok pada teks perwakilan (tanpa peka huruf)", filterExitAnswerGroups(groups, "BUNGA").length === 1 && filterExitAnswerGroups(groups, "BUNGA")[0].count === 2);
  check("cocok pada nama salah satu anggota", filterExitAnswerGroups(groups, "santoso").length === 1 && filterExitAnswerGroups(groups, "santoso")[0].key === "rumus bunga");
  check("cocok pada kelompok lain", filterExitAnswerGroups(groups, "grafik").length === 1);
  check("tanpa kecocokan → kosong", filterExitAnswerGroups(groups, "trigonometri").length === 0);
}

console.log("Case 8: exitTicketStudentMatches — saringan tampilan Per murid");
{
  const student = { name: "Dedi Kurnia", exit_ticket: { understood_3: "Paham bunga tunggal", examples_2: "Menabung di bank", confusing_1: "Rumus anuitas" } };
  check("kata kunci kosong → cocok", exitTicketStudentMatches(student, "") === true);
  check("cocok pada nama", exitTicketStudentMatches(student, "kurnia") === true);
  check("cocok pada teks dipahami", exitTicketStudentMatches(student, "TUNGGAL") === true);
  check("cocok pada teks penerapan", exitTicketStudentMatches(student, "menabung") === true);
  check("cocok pada teks membingungkan", exitTicketStudentMatches(student, "anuitas") === true);
  check("tidak cocok di mana pun → false", exitTicketStudentMatches(student, "logaritma") === false);
  const noTicket = { name: "Eka", exit_ticket: null };
  check("tanpa exit ticket: cocok hanya lewat nama", exitTicketStudentMatches(noTicket, "eka") === true && exitTicketStudentMatches(noTicket, "bunga") === false);
}

console.log("Case 9: pengawatan panel — saklar tampilan, bawaan Ringkasan kelas");
{
  check("halaman mengimpor helper ringkasan exit ticket", page.includes('from "../../lib/exit-ticket-summary";'));
  check("keadaan tampilan berawal 'kelas'", page.includes('useState<"kelas" | "murid">("kelas")'));
  check("chip 'Ringkasan kelas' dengan aria-pressed", page.includes('aria-pressed={exitTicketView === "kelas"}') && page.includes(">Ringkasan kelas</button>"));
  check("chip 'Per murid' dengan aria-pressed", page.includes('aria-pressed={exitTicketView === "murid"}') && page.includes(">Per murid</button>"));
  check("kepala menyebut jumlah terkirim dari total murid", page.includes('murid mengirim exit ticket') && page.includes("{exitTicketStudents.length} dari {assignmentSummary.students.length}"));
  check("kotak cari terhubung ke exitTicketQuery", page.includes("value={exitTicketQuery}") && page.includes('aria-label="Cari jawaban exit ticket"'));
  check("bagian kelas dirender dari EXIT_TICKET_CLASS_SECTIONS", page.includes("exitTicketClassSections.map((section)"));
  check("pengelompokan memakai helper murni", page.includes("groupExitAnswers(exitTicketEntries, section.field)") && page.includes("filterExitAnswerGroups("));
  check("pencarian diatur ulang saat penugasan berganti", page.includes('setExitTicketQuery("");') && page.includes("setExitTicketExpanded(new Set())"));
}

console.log("Case 10: tampilan kelas — kelompok terlipat, hitungan, perluas nama");
{
  check("chip hitungan '{count} murid'", page.includes("{group.count} murid"));
  check("baris kelompok adalah tombol dengan aria-expanded", page.includes("aria-expanded={expanded}") && page.includes("toggleExitTicketGroup(groupKey)"));
  check("nama anggota tampil saat diperluas", page.includes("group.students.map((student) => student.name).join(\", \")"));
  check("maksimal 10 kelompok sebelum 'Lihat semua'", page.includes("section.groups.slice(0, 10)") && page.includes("`Lihat semua (${section.groups.length})`"));
  check("bagian tanpa jawaban → pesan redup baku", page.includes("Belum ada jawaban pada bagian ini."));
  check("pencarian tanpa hasil → pesan baku", page.includes("Tidak ada hasil untuk"));
  check("kunci kelompok unik per bagian", page.includes("`${section.field}:${group.key}`"));
}

console.log("Case 11: tampilan Per murid — markup kartu lama TIDAK berubah");
{
  check("kartu artikel lama dipertahankan", page.includes("<article key={student.id} style={styles.exitTicketCard}>"));
  check("kepala kartu lama dipertahankan", page.includes("<span style={styles.muted}>{student.username} · dikirim {formatDate(student.exit_ticket.submitted_at)}</span>"));
  check("bidang '3 hal yang dipahami' persis semula", page.includes("<div style={styles.exitTicketField}><strong>3 hal yang dipahami</strong><p>{student.exit_ticket.understood_3}</p></div>"));
  check("bidang '2 contoh penerapan' persis semula", page.includes("<div style={styles.exitTicketField}><strong>2 contoh penerapan</strong><p>{student.exit_ticket.examples_2}</p></div>"));
  check("bidang '1 hal yang membingungkan' persis semula", page.includes("<div style={styles.exitTicketField}><strong>1 hal yang membingungkan</strong><p>{student.exit_ticket.confusing_1}</p></div>"));
  check("daftar Per murid melewati saringan pencarian yang sama", page.includes("exitTicketVisibleStudents.map((student) => student.exit_ticket ? (") && page.includes("exitTicketStudentMatches(student, exitTicketQuery)"));
  check("pesan kosong lama (belum ada yang mengirim) dipertahankan", page.includes("Belum ada murid yang mengirim exit ticket untuk penugasan ini."));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
