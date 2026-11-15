// Tests for Hub Murid Tahap 3 — Jurnal Belajar (lib/jurnal.ts):
// katalog prompt bawaan + mood, validasi entri buat/sunting, predikat
// kepemilikan, tanggal WIB, pengelompokan riwayat, statistik + perencana
// ringkasan guru — semuanya MURNI — plus pengkabelan rute dan migrasi 0021.
// Run with bun from apps/api:  bun src/lib/jurnal-belajar.test.mjs
//
// Yang dikunci di sini:
//  - Katalog prompt tepat empat kunci keputusan pemilik (perubahan-
//    pemahaman, masih-bingung, strategi-berhasil, target-berikutnya)
//    dengan rumusan Transform pada rancangan; kunci asing ditolak.
//  - Validasi: body kosong/bukan string/kelebihan panjang ditolak;
//    prompt/mood asing ditolak; linked_module_id harus bilangan bulat
//    positif atau null; suntingan hanya mengubah field yang dikirim
//    dan entry_date tidak pernah bisa disunting.
//  - Kepemilikan: entri hanya milik penulisnya (predikat murni), dan
//    rute murid memeriksanya pada PATCH + DELETE (jarum statis) serta
//    memeriksa keterlihatan modul tertaut lewat studentCanAccessModule.
//  - todayWib: batas tengah malam WIB tepat (16:59:59Z masih tanggal
//    yang sama, 17:00:00Z sudah tanggal berikutnya).
//  - Sisi guru MURNI BACA: router guru jurnal hanya mendaftarkan GET;
//    keterlihatan meniru Pantau Hasil (assignmentClasses +
//    assignmentStudents + student-class) dan menjawab 403 di luar
//    jangkauan. Jurnal tidak menyentuh XP (tidak ada awardXp/xpLedger).
//  - Migrasi: jurnal 23 entri; 0021_jurnal_belajar tetap di idx 21;
//    SQL 0021 membuat journal_entries (FK student→users, linked module→
//    modules, indeks student+date); skema Drizzle memuat kolom sama.
import { readFileSync } from "node:fs";

const {
  JOURNAL_MOODS,
  JOURNAL_PROMPTS,
  collectVisibleStudentIds,
  groupEntriesByDate,
  isJournalMoodKey,
  isJournalPromptKey,
  journalEntryOwnedBy,
  journalMoodByKey,
  journalPromptText,
  planTeacherJournalOverview,
  reduceJournalStats,
  todayWib,
  validateJournalCreate,
  validateJournalPatch,
} = await import("./jurnal.ts");

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

// --- Katalog prompt ----------------------------------------------------------------
check("katalog prompt tepat 4 kunci keputusan pemilik",
  JSON.stringify(JOURNAL_PROMPTS.map((prompt) => prompt.key)) === JSON.stringify(["perubahan-pemahaman", "masih-bingung", "strategi-berhasil", "target-berikutnya"]),
  JSON.stringify(JOURNAL_PROMPTS.map((prompt) => prompt.key)));
check("rumusan prompt sesuai rancangan Transform",
  journalPromptText("perubahan-pemahaman") === "Apa yang berubah dari pemahamanmu hari ini?" &&
  journalPromptText("masih-bingung") === "Bagian mana yang masih membingungkan?" &&
  journalPromptText("strategi-berhasil") === "Strategi apa yang berhasil untukmu?" &&
  journalPromptText("target-berikutnya") === "Apa target belajarmu berikutnya?");
check("isJournalPromptKey menerima kunci katalog, menolak asing/null/bukan string",
  isJournalPromptKey("masih-bingung") && !isJournalPromptKey("prompt-buatanku") && !isJournalPromptKey(null) && !isJournalPromptKey(3));
check("journalPromptText kunci asing/null → null", journalPromptText("asing") === null && journalPromptText(null) === null);

// --- Katalog mood ---------------------------------------------------------------------
check("katalog mood himpunan kecil (5) berkunci unik",
  JOURNAL_MOODS.length === 5 && new Set(JOURNAL_MOODS.map((mood) => mood.key)).size === 5);
check("isJournalMoodKey + journalMoodByKey konsisten",
  isJournalMoodKey("senang") && !isJournalMoodKey("marah") &&
  journalMoodByKey("senang")?.label === "Senang" && journalMoodByKey("senang")?.emoji === "😊" &&
  journalMoodByKey("asing") === null && journalMoodByKey(null) === null);

// --- Validasi buat ----------------------------------------------------------------------
const buatValid = validateJournalCreate({ body: "  Hari ini aku paham sifat eksponen.  ", prompt_key: "perubahan-pemahaman", mood: "senang", linked_module_id: 12 });
check("buat valid: body ter-trim, semua field ternormalisasi",
  "draft" in buatValid && buatValid.draft.body === "Hari ini aku paham sifat eksponen." &&
  buatValid.draft.promptKey === "perubahan-pemahaman" && buatValid.draft.mood === "senang" && buatValid.draft.linkedModuleId === 12,
  JSON.stringify(buatValid));
const buatBebas = validateJournalCreate({ body: "Refleksi bebas." });
check("buat bebas: tanpa prompt/mood/kaitan → semua null",
  "draft" in buatBebas && buatBebas.draft.promptKey === null && buatBebas.draft.mood === null && buatBebas.draft.linkedModuleId === null);
check("buat: body kosong ditolak", "error" in validateJournalCreate({ body: "" }));
check("buat: body hanya spasi ditolak", "error" in validateJournalCreate({ body: "   \n  " }));
check("buat: body bukan string ditolak", "error" in validateJournalCreate({ body: 42 }) && "error" in validateJournalCreate({}));
check("buat: body melebihi 5000 karakter ditolak", "error" in validateJournalCreate({ body: "a".repeat(5001) }));
check("buat: body tepat 5000 karakter diterima", "draft" in validateJournalCreate({ body: "a".repeat(5000) }));
check("buat: prompt asing ditolak", "error" in validateJournalCreate({ body: "isi", prompt_key: "prompt-guru" }));
check("buat: mood asing ditolak", "error" in validateJournalCreate({ body: "isi", mood: "gembira-sekali" }));
check("buat: linked_module_id 0/negatif/desimal/string ditolak",
  "error" in validateJournalCreate({ body: "isi", linked_module_id: 0 }) &&
  "error" in validateJournalCreate({ body: "isi", linked_module_id: -3 }) &&
  "error" in validateJournalCreate({ body: "isi", linked_module_id: 2.5 }) &&
  "error" in validateJournalCreate({ body: "isi", linked_module_id: "12" }));

// --- Validasi sunting ---------------------------------------------------------------------
const patchSebagian = validateJournalPatch({ mood: "lelah" });
check("sunting sebagian: hanya field terkirim yang muncul",
  "patch" in patchSebagian && patchSebagian.patch.mood === "lelah" &&
  !("body" in patchSebagian.patch) && !("promptKey" in patchSebagian.patch) && !("linkedModuleId" in patchSebagian.patch),
  JSON.stringify(patchSebagian));
const patchKosongkan = validateJournalPatch({ prompt_key: null, linked_module_id: null });
check("sunting mengosongkan: null terkirim berarti dikosongkan (kunci tetap muncul)",
  "patch" in patchKosongkan && patchKosongkan.patch.promptKey === null && patchKosongkan.patch.linkedModuleId === null);
check("sunting: tanpa field apa pun ditolak", "error" in validateJournalPatch({}));
check("sunting: entry_date tidak bisa disunting (diabaikan → tanpa perubahan)",
  "error" in validateJournalPatch({ entry_date: "2020-01-01" }));
check("sunting: body kosong ditolak", "error" in validateJournalPatch({ body: "  " }));
check("sunting: prompt/mood asing ditolak",
  "error" in validateJournalPatch({ prompt_key: "asing" }) && "error" in validateJournalPatch({ mood: "asing" }));

// --- Kepemilikan + tanggal ------------------------------------------------------------------
check("kepemilikan: hanya penulisnya", journalEntryOwnedBy(7, 7) && !journalEntryOwnedBy(7, 8) && !journalEntryOwnedBy(8, 7));
check("todayWib: siang UTC masih tanggal yang sama di WIB", todayWib(new Date("2026-11-15T10:00:00Z")) === "2026-11-15");
check("todayWib: 16:59:59Z = 23:59:59 WIB, belum berganti tanggal", todayWib(new Date("2026-11-15T16:59:59Z")) === "2026-11-15");
check("todayWib: 17:00:00Z = 00:00 WIB, tanggal berikutnya", todayWib(new Date("2026-11-15T17:00:00Z")) === "2026-11-16");
check("todayWib: tengah malam WIB persis", todayWib(new Date("2026-01-01T00:00:00+07:00")) === "2026-01-01");

// --- Pengelompokan riwayat ---------------------------------------------------------------------
const riwayat = [
  { entryDate: "2026-11-15", body: "b" },
  { entryDate: "2026-11-15", body: "a" },
  { entryDate: "2026-11-14", body: "c" },
  { entryDate: "2026-11-10", body: "d" },
];
const kelompok = groupEntriesByDate(riwayat);
check("kelompok tanggal: urutan kemunculan + isi mempertahankan urutan masuk",
  kelompok.length === 3 && kelompok[0].date === "2026-11-15" && kelompok[0].entries.length === 2 &&
  kelompok[0].entries[0].body === "b" && kelompok[1].date === "2026-11-14" && kelompok[2].date === "2026-11-10",
  JSON.stringify(kelompok.map((group) => group.date)));
check("kelompok tanggal: kosong → kosong", groupEntriesByDate([]).length === 0);

// --- Statistik + ringkasan guru -------------------------------------------------------------------
const stats = reduceJournalStats([
  { studentId: 1, entryDate: "2026-11-14", createdAt: new Date("2026-11-14T03:00:00Z") },
  { studentId: 1, entryDate: "2026-11-15", createdAt: new Date("2026-11-15T02:00:00Z") },
  { studentId: 1, entryDate: "2026-11-15", createdAt: new Date("2026-11-15T05:00:00Z") },
  { studentId: 2, entryDate: "2026-11-10", createdAt: new Date("2026-11-10T05:00:00Z") },
]);
check("statistik: hitungan per murid", stats.get(1)?.entryCount === 3 && stats.get(2)?.entryCount === 1 && !stats.has(3));
check("statistik: entri terakhir = tanggal terbaru, lalu createdAt terbaru",
  stats.get(1)?.lastEntryDate === "2026-11-15" && stats.get(1)?.lastEntryAt?.toISOString() === "2026-11-15T05:00:00.000Z");

check("jangkauan terlihat: gabungan anggota + sasaran langsung, tanpa duplikat",
  JSON.stringify(collectVisibleStudentIds(
    [{ classId: 1, studentId: 1, name: "A", username: "a" }, { classId: 1, studentId: 2, name: "B", username: "b" }],
    [{ studentId: 2, name: "B", username: "b", classId: 1, className: "X" }, { studentId: 3, name: "C", username: "c", classId: 0, className: "" }],
  ).sort()) === JSON.stringify([1, 2, 3]));

const overview = planTeacherJournalOverview({
  classes: [{ id: 2, name: "X RPL" }, { id: 1, name: "X TKJ A" }],
  members: [
    { classId: 1, studentId: 1, name: "Bima", username: "bima" },
    { classId: 1, studentId: 2, name: "Ani", username: "ani" },
    { classId: 2, studentId: 3, name: "Citra", username: "citra" },
  ],
  directStudents: [
    { studentId: 3, name: "Citra", username: "citra", classId: 2, className: "X RPL" },
    { studentId: 4, name: "Dedi", username: "dedi", classId: 5, className: "XI DPIB" },
    { studentId: 5, name: "Eka", username: "eka", classId: 0, className: "" },
  ],
  stats,
});
check("ringkasan guru: kelas terurut nama, kelompok tanpa kelas terakhir",
  overview.map((group) => group.id).join(",") === "2,1,5,0", JSON.stringify(overview.map((group) => group.id)));
const grupTkj = overview.find((group) => group.id === 1);
check("ringkasan guru: murid terurut nama di kelasnya",
  grupTkj?.students.map((student) => student.name).join(",") === "Ani,Bima");
check("ringkasan guru: sasaran langsung yang sudah anggota tidak digandakan",
  overview[0].students.filter((student) => student.id === 3).length === 1);
check("ringkasan guru: statistik menempel (jumlah + entri terakhir); tanpa statistik → 0/null",
  grupTkj?.students.find((student) => student.id === 1)?.entry_count === 3 &&
  grupTkj?.students.find((student) => student.id === 1)?.last_entry_date === "2026-11-15" &&
  grupTkj?.students.find((student) => student.id === 2)?.entry_count === 1 &&
  grupTkj?.students.find((student) => student.id === 2)?.last_entry_date === "2026-11-10" &&
  overview[0].students.find((student) => student.id === 3)?.entry_count === 0 &&
  overview[0].students.find((student) => student.id === 3)?.last_entry_date === null);
check("ringkasan guru: sasaran langsung teratasi ke kelas di luar sasaran tampil di kelasnya",
  overview[2].id === 5 && overview[2].students[0]?.id === 4);

// --- Pengkabelan rute ------------------------------------------------------------------------------
const routesSrc = readFileSync(new URL("../routes/jurnal.ts", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
check("rute terpasang di app.ts pada awalan peran yang sama",
  appSrc.includes('v1.route("/murid", muridJurnalRoutes)') && appSrc.includes('v1.route("/guru", guruJurnalRoutes)'));
check("penjaga peran: murid untuk sisi murid, guru untuk sisi guru",
  routesSrc.includes('muridJurnalRoutes.use("*", requireRole("murid"))') && routesSrc.includes('guruJurnalRoutes.use("*", requireRole("guru"))'));
check("sisi murid mendaftarkan GET/POST/PATCH/DELETE jurnal",
  routesSrc.includes('muridJurnalRoutes.get("/jurnal"') && routesSrc.includes('muridJurnalRoutes.post("/jurnal"') &&
  routesSrc.includes('muridJurnalRoutes.patch("/jurnal/:id"') && routesSrc.includes('muridJurnalRoutes.delete("/jurnal/:id"'));
const guruSegment = routesSrc.slice(routesSrc.indexOf("export const guruJurnalRoutes"));
check("sisi guru MURNI BACA: sesudah guruJurnalRoutes tidak ada metode tulis apa pun",
  !guruSegment.includes(".post(") && !guruSegment.includes(".patch(") && !guruSegment.includes(".put(") && !guruSegment.includes(".delete("),
);
check("sisi guru mendaftarkan ringkasan + entri per murid",
  guruSegment.includes('guruJurnalRoutes.get("/jurnal"') && guruSegment.includes('guruJurnalRoutes.get("/jurnal/entries"'));
check("kepemilikan diperiksa pada sunting + hapus (predikat dipakai ≥2 kali)",
  (routesSrc.match(/journalEntryOwnedBy\(existing\.entry\.studentId, user\.userId\)/g) ?? []).length === 2);
check("kaitan materi diperiksa keterlihatannya saat buat + sunting (studentCanAccessModule ≥2 kali)",
  (routesSrc.match(/studentCanAccessModule\(user\.userId, /g) ?? []).length === 2);
check("tanggal jurnal diputuskan server lewat todayWib saat buat",
  routesSrc.includes("entryDate: todayWib(new Date())"));
const patchSegment = routesSrc.slice(routesSrc.indexOf('muridJurnalRoutes.patch'), routesSrc.indexOf('muridJurnalRoutes.delete'));
check("sunting tidak pernah menyentuh entryDate", !patchSegment.includes("entryDate"));
check("keterlihatan guru meniru Pantau Hasil: assignmentClasses + assignmentStudents + student-class",
  routesSrc.includes("assignmentClasses") && routesSrc.includes("assignmentStudents") &&
  routesSrc.includes("loadTeacherClassMemberships") && routesSrc.includes("resolveStudentClass"));
check("murid di luar jangkauan guru → 403 dengan pesan jangkauan",
  guruSegment.includes("403") && guruSegment.includes("tidak berada dalam jangkauan penugasan Anda"));
check("jurnal tidak menyentuh XP (tanpa awardXp / xpLedger di lib + rute jurnal)",
  !routesSrc.includes("awardXp") && !routesSrc.includes("xpLedger") &&
  !readFileSync(new URL("./jurnal.ts", import.meta.url), "utf8").includes("xpLedger"));

// --- Migrasi & skema ----------------------------------------------------------------------------------
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
check("jurnal migrasi 23 entri", journal.entries.length === 23, `got ${journal.entries.length}`);
const entry0021 = journal.entries[21];
check("entri 0021_jurnal_belajar tetap di idx 21", entry0021.tag === "0021_jurnal_belajar" && entry0021.idx === 21, JSON.stringify(entry0021));

const migrationSql = readFileSync(new URL("../../../../packages/db/migrations/0021_jurnal_belajar.sql", import.meta.url), "utf8");
check("SQL 0021 membuat tabel journal_entries", migrationSql.includes("CREATE TABLE `journal_entries`"));
check("SQL 0021: kolom inti (student_id, entry_date date, body text)",
  migrationSql.includes("`student_id` bigint NOT NULL") && migrationSql.includes("`entry_date` date NOT NULL") && migrationSql.includes("`body` text NOT NULL"));
check("SQL 0021: prompt_key varchar(64) + mood varchar(32) + linked_module_id bigint",
  migrationSql.includes("`prompt_key` varchar(64)") && migrationSql.includes("`mood` varchar(32)") && migrationSql.includes("`linked_module_id` bigint"));
check("SQL 0021: FK student → users + linked module → modules",
  migrationSql.includes("FOREIGN KEY (`student_id`) REFERENCES `users`(`id`)") &&
  migrationSql.includes("FOREIGN KEY (`linked_module_id`) REFERENCES `modules`(`id`)"));
check("SQL 0021: indeks student+date", migrationSql.includes("CREATE INDEX `journal_entries_student_date_idx` ON `journal_entries` (`student_id`,`entry_date`)"));

const schemaSrc = readFileSync(new URL("../../../../packages/db/src/schema/journal.ts", import.meta.url), "utf8");
check("skema journalEntries memuat kolom yang sama (entryDate mode string)",
  schemaSrc.includes('date("entry_date", { mode: "string" })') && schemaSrc.includes('promptKey: varchar("prompt_key", { length: 64 })') &&
  schemaSrc.includes('mood: varchar("mood", { length: 32 })') && schemaSrc.includes('linkedModuleId: bigint("linked_module_id"'));
const schemaIndexSrc = readFileSync(new URL("../../../../packages/db/src/schema/index.ts", import.meta.url), "utf8");
check("skema index mengekspor journal", schemaIndexSrc.includes('export * from "./journal";'));

console.log(`\nAPI jurnal-belajar: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
