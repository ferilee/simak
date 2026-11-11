// Tests for poin XP murid (gamifikasi): konstanta poin, tangga level,
// migrasi buku besar xp_ledger, dan wiring tiga titik penghargaan.
// Run with bun from apps/api:  bun src/lib/poin-xp.test.mjs
//
// Yang dikunci di sini:
//  - Besaran poin per kejadian: materi tuntas 10, LKPD terkumpul 25,
//    exit ticket 15 — dan XP untuk ketuntasan, bukan kebenaran.
//  - summarizeXp murni: batas-batas tangga level (0/49/50/119/120/
//    699/700/1000), tingkat tertinggi tanpa level berikutnya.
//  - Migrasi 0016 membuat xp_ledger dengan kunci unik
//    (student_id, event, source_id) — penjamin tidak pernah ganda —
//    dan terdaftar di jurnal pada idx 16 (dicari by-tag: jurnal terus
//    bertambah oleh paket-paket berikutnya).
//  - Wiring: penghargaan hanya di tempat kejadian benar-benar baru
//    (catatan tuntas pertama, transisi attempt ke terkumpul, tiket
//    exit yang baru dibuat), /murid/today membawa xp gagal-aman.
import { readFileSync } from "node:fs";
import { XP_LEVELS, XP_POINTS, summarizeXp } from "./xp.ts";

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

// --- Konstanta poin & tangga level ---------------------------------------
check("poin materi tuntas = 10", XP_POINTS.materi_tuntas === 10);
check("poin LKPD terkumpul = 25", XP_POINTS.lkpd_terkumpul === 25);
check("poin exit ticket = 15", XP_POINTS.exit_ticket === 15);
check(
  "tangga level: 6 tingkat dari 0 sampai Master SIMAK 700",
  XP_LEVELS.length === 6 &&
    XP_LEVELS[0].min === 0 && XP_LEVELS[0].name === "Pembelajar Baru" &&
    XP_LEVELS[5].min === 700 && XP_LEVELS[5].name === "Master SIMAK",
);
check(
  "ambang level menaik ketat",
  XP_LEVELS.every((level, i) => i === 0 || level.min > XP_LEVELS[i - 1].min),
);

// --- summarizeXp pada batas-batasnya --------------------------------------
const at0 = summarizeXp(0);
check(
  "total 0 → Pembelajar Baru, 50 lagi ke Penjelajah, kemajuan 0%",
  at0.levelIndex === 0 && at0.levelName === "Pembelajar Baru" &&
    at0.nextLevelName === "Penjelajah" && at0.nextLevelAt === 50 &&
    at0.xpToNext === 50 && at0.progressPct === 0,
);
const at49 = summarizeXp(49);
check(
  "total 49 → masih Pembelajar Baru, 1 lagi, kemajuan 98%",
  at49.levelIndex === 0 && at49.xpToNext === 1 && at49.progressPct === 98,
);
const at50 = summarizeXp(50);
check(
  "total 50 → naik ke Penjelajah, kemajuan mulai lagi dari 0%",
  at50.levelIndex === 1 && at50.levelName === "Penjelajah" &&
    at50.nextLevelName === "Pencari Pola" && at50.nextLevelAt === 120 &&
    at50.xpToNext === 70 && at50.progressPct === 0,
);
const at119 = summarizeXp(119);
check(
  "total 119 → masih Penjelajah, 1 lagi ke Pencari Pola",
  at119.levelIndex === 1 && at119.xpToNext === 1 && at119.progressPct === 98,
);
const at120 = summarizeXp(120);
check(
  "total 120 → Pencari Pola, berikutnya Penakluk LKPD pada 250",
  at120.levelIndex === 2 && at120.levelName === "Pencari Pola" &&
    at120.nextLevelName === "Penakluk LKPD" && at120.nextLevelAt === 250 &&
    at120.xpToNext === 130 && at120.progressPct === 0,
);
const at699 = summarizeXp(699);
check(
  "total 699 → Ahli Materi, 1 lagi ke Master SIMAK, kemajuan 99%",
  at699.levelIndex === 4 && at699.levelName === "Ahli Materi" &&
    at699.nextLevelName === "Master SIMAK" && at699.xpToNext === 1 && at699.progressPct === 99,
);
const at700 = summarizeXp(700);
check(
  "total 700 → Master SIMAK, tanpa level berikutnya, kemajuan 100%",
  at700.levelIndex === 5 && at700.levelName === "Master SIMAK" &&
    at700.nextLevelName === null && at700.nextLevelAt === null &&
    at700.xpToNext === null && at700.progressPct === 100,
);
const at1000 = summarizeXp(1000);
check(
  "total 1000 → tetap Master SIMAK (total dilaporkan apa adanya)",
  at1000.levelIndex === 5 && at1000.total === 1000 && at1000.progressPct === 100,
);

// --- Skema & migrasi -------------------------------------------------------
const xpSchema = readFileSync(new URL("../../../../packages/db/src/schema/xp.ts", import.meta.url), "utf8");
check("skema mendefinisikan tabel xp_ledger", xpSchema.includes('mysqlTable(\n  "xp_ledger"'));
check(
  "skema: event varchar(32) dengan empat kejadian (3 penghargaan + tukar_avatar dari paket Avatar Murid)",
  xpSchema.includes('varchar("event", { length: 32 })') &&
    xpSchema.includes('"materi_tuntas" | "lkpd_terkumpul" | "exit_ticket" | "tukar_avatar"'),
);
check(
  "skema: kunci unik (student_id, event, source_id) + indeks student_id",
  xpSchema.includes('uniqueIndex("xp_ledger_student_event_source_unique").on(t.studentId, t.event, t.sourceId)') &&
    xpSchema.includes('index("xp_ledger_student_idx").on(t.studentId)'),
);
check(
  "skema: points int dan created_at timestamp default now",
  xpSchema.includes('int("points").notNull()') && xpSchema.includes('timestamp("created_at").notNull().defaultNow()'),
);
const schemaIndex = readFileSync(new URL("../../../../packages/db/src/schema/index.ts", import.meta.url), "utf8");
check("skema xp terdaftar di index skema", schemaIndex.includes('export * from "./xp";'));

const migration = readFileSync(
  new URL("../../../../packages/db/migrations/0016_poin_xp.sql", import.meta.url),
  "utf8",
);
check("migrasi 0016 membuat tabel xp_ledger", migration.includes("CREATE TABLE `xp_ledger`"));
check(
  "migrasi 0016: kolom sesuai rancangan",
  migration.includes("`student_id` bigint NOT NULL") &&
    migration.includes("`event` varchar(32) NOT NULL") &&
    migration.includes("`source_id` bigint NOT NULL") &&
    migration.includes("`points` int NOT NULL"),
);
check(
  "migrasi 0016: unik (student_id, event, source_id), FK ke users, indeks student",
  migration.includes("CONSTRAINT `xp_ledger_student_event_source_unique` UNIQUE(`student_id`,`event`,`source_id`)") &&
    migration.includes("`xp_ledger_student_id_users_id_fk` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`)") &&
    migration.includes("CREATE INDEX `xp_ledger_student_idx` ON `xp_ledger` (`student_id`)"),
);
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
const entry0016 = journal.entries.find((entry) => entry.tag === "0016_poin_xp");
check(
  "jurnal migrasi memuat 0016_poin_xp pada idx 16",
  entry0016?.idx === 16,
);

// --- Wiring titik penghargaan ----------------------------------------------
const xpLib = readFileSync(new URL("./xp.ts", import.meta.url), "utf8");
check(
  "awardXp menulis buku besar dengan onDuplicateKeyUpdate no-op (idempoten)",
  xpLib.includes(".insert(xpLedger)") && xpLib.includes(".onDuplicateKeyUpdate({ set: { points } })"),
);

const activityRoute = readFileSync(new URL("../routes/activity.ts", import.meta.url), "utf8");
check(
  "activity: XP materi tuntas dibayar dari lib/xp",
  activityRoute.includes('awardXp(user.userId, "materi_tuntas", moduleId)'),
);
check(
  "activity: pembayaran sesudah insert catatan tuntas pertama (di dalam blok !existing)",
  activityRoute.indexOf('event: "baca_materi_tuntas",') < activityRoute.indexOf('awardXp(user.userId, "materi_tuntas", moduleId)') &&
    activityRoute.indexOf("if (!existing)") < activityRoute.indexOf('awardXp(user.userId, "materi_tuntas", moduleId)'),
);

const muridRoute = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
check(
  "submit LKPD: anggota kelompok dibayar dari assignmentGroupMembers kelompok konteks",
  muridRoute.includes("eq(assignmentGroupMembers.groupId, context.group.id)") &&
    muridRoute.includes('awardXp(member.studentId, "lkpd_terkumpul", attempt.id)'),
);
check(
  "submit LKPD: attempt individu membayar pengumpulnya",
  muridRoute.includes('awardXp(user.userId, "lkpd_terkumpul", attempt.id)'),
);
check(
  "submit LKPD: xp_awarded pemanggil memakai konstanta XP_POINTS dan masuk respons",
  muridRoute.includes("XP_POINTS.lkpd_terkumpul") &&
    muridRoute.includes('data: { status: "terkumpul", xp_awarded: xpAwarded }'),
);
check(
  "exit ticket: XP hanya pada cabang insert tiket baru (sesudah insert, sebelum log aktivitas)",
  muridRoute.indexOf("await db.insert(exitTickets).values") < muridRoute.indexOf('awardXp(user.userId, "exit_ticket", assignmentId)') &&
    muridRoute.indexOf('awardXp(user.userId, "exit_ticket", assignmentId)') < muridRoute.indexOf('assignmentId, event: "exit_ticket" });'),
);
check(
  "exit ticket: respons membawa xp_awarded",
  muridRoute.includes("data: { submitted: true, xp_awarded: xpAwarded }"),
);
check(
  "/today: level dari XP seumur (jumlah baris positif), saldo dari jumlah semua baris",
  muridRoute.includes("summarizeXp(Number(row?.lifetime ?? 0), Number(row?.balance ?? 0))") &&
    muridRoute.includes("coalesce(sum(case when ${xpLedger.points} > 0 then ${xpLedger.points} else 0 end), 0)") &&
    muridRoute.includes("coalesce(sum(${xpLedger.points}), 0)"),
);
check(
  "/today: xp gagal-aman (null awal, try/catch) dan terkirim sebagai field xp",
  muridRoute.includes("let xpSummary: XpSummary | null = null;") &&
    muridRoute.includes("xp: xpSummary,"),
);
check("seluruh route murid tetap khusus peran murid", muridRoute.includes('muridRoutes.use("*", requireRole("murid"))'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
