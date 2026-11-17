// Tests for Hub Murid Tahap 2 sisi SIMAK (lib/ruas-hub.ts): penurunan
// alamat endpoint internal RUAS, pemetaan efektif penugasan, perakitan
// topik terpetakan murid, kartu asesmen, ringkasan tarik nilai, progres
// per rantai — semuanya MURNI — plus pengkabelan rute dan migrasi 0020.
// Run with bun from apps/api:  bun src/lib/hub-tahap-2.test.mjs
//
// Yang dikunci di sini:
//  - Basis endpoint internal = ORIGIN RUAS_STATUS_ENDPOINT + prefiks
//    /api/internal/simak (tanpa env baru); URL kosong/rusak → null.
//  - Pemetaan efektif: urai tautan kuis selalu menang atas pilihan
//    guru; pilihan guru hanya berlaku bila tautan tak terurai; tanpa
//    keduanya → null (belum terpetakan).
//  - Daftar topik murid didedup per (topic_id, subject_id), konteks
//    kartu dari penugasan pertama yang membawa topik itu.
//  - Kartu asesmen: entri RUAS yang hilang = belum dikerjakan, judul
//    cadangan dari judul penugasan; skor/status dari RUAS apa adanya.
//  - Ringkasan tarikan: hanya murid berskor yang menjadi baris;
//    belumAdaSkor menghitung murid sasaran tanpa skor; tidakDikenal
//    menghitung username jawaban yang bukan sasaran.
//  - Progres rantai: penugasan bebas tidak ikut; % materi dari modul
//    unik; hitungan LKPD terkumpul/dinilai; asesmen pertama rantai
//    ditempel (null datanya bila RUAS tak tersedia).
//  - Pengkabelan: rute /guru/ruas-topics (peran guru), /reports/ruas-pull
//    (source "tarik" + pulled_at; impor CSV menandai source "csv"),
//    /murid/asesmen + /murid/handoff di murid.ts, serialisasi pemetaan
//    di assignments.ts, klien ruas-hub memakai x-internal-secret dan
//    TIDAK memperkenalkan env baru.
//  - Migrasi: jurnal 24 entri; 0020_pemetaan_ruas tetap di idx 20;
//    SQL 0020 menambah ruas_topic_id/ruas_subject_id di assignments dan
//    source (bawaan 'csv') + pulled_at di ruas_scores; skema Drizzle
//    memuat kolom yang sama.
import { readFileSync } from "node:fs";

// Modul yang diuji membaca env saat impor; beri nilai boneka yang aman.
process.env.DATABASE_URL = "mysql://uji:uji@localhost:3306/uji";
process.env.SESSION_SECRET = "rahasia-uji-yang-cukup-panjang";
process.env.RUSTFS_ENDPOINT = "http://localhost:9000";
process.env.RUSTFS_ACCESS_KEY = "uji";
process.env.RUSTFS_SECRET_KEY = "uji";
delete process.env.RUAS_STATUS_ENDPOINT;
delete process.env.RUAS_INTERNAL_SECRET;

const {
  collectMappedTopics,
  deriveRuasInternalBase,
  planAssessmentCards,
  planChainProgress,
  resolveEffectiveRuasTarget,
  ruasBridgeConfigured,
  summarizeRuasPull,
} = await import("./ruas-hub.ts");

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

// --- Penurunan alamat internal -------------------------------------------------
check(
  "basis = origin endpoint status + prefiks internal",
  deriveRuasInternalBase("https://ruas.smkpasirian-lmj.sch.id/api/internal/simak/attempt-status") === "https://ruas.smkpasirian-lmj.sch.id/api/internal/simak",
  deriveRuasInternalBase("https://ruas.smkpasirian-lmj.sch.id/api/internal/simak/attempt-status") ?? "null",
);
check(
  "origin mempertahankan port non-bawaan",
  deriveRuasInternalBase("http://localhost:3002/api/internal/simak/attempt-status") === "http://localhost:3002/api/internal/simak",
);
check("endpoint kosong → basis null", deriveRuasInternalBase("") === null && deriveRuasInternalBase(null) === null && deriveRuasInternalBase(undefined) === null);
check("endpoint bukan URL → basis null", deriveRuasInternalBase("bukan-url") === null);
check("env belum disetel → jembatan belum terkonfigurasi", ruasBridgeConfigured() === false);

// --- Pemetaan efektif --------------------------------------------------------------
const dariTautan = resolveEffectiveRuasTarget({ ruasQuizUrl: "https://ruas.example/quiz/42?subject_id=7", ruasTopicId: 99, ruasSubjectId: 3 });
check("urai tautan menang atas pilihan guru", dariTautan?.topicId === 42 && dariTautan?.subjectId === 7, JSON.stringify(dariTautan));
const dariPilihan = resolveEffectiveRuasTarget({ ruasQuizUrl: "https://contoh.invalid/tanpa-pola", ruasTopicId: 99, ruasSubjectId: 3 });
check("tautan tak terurai → pilihan guru berlaku", dariPilihan?.topicId === 99 && dariPilihan?.subjectId === 3, JSON.stringify(dariPilihan));
const pilihanTanpaMapel = resolveEffectiveRuasTarget({ ruasQuizUrl: null, ruasTopicId: 99, ruasSubjectId: null });
check("pilihan guru tanpa mapel → subjectId null", pilihanTanpaMapel?.topicId === 99 && pilihanTanpaMapel?.subjectId === null);
check("tanpa tautan & tanpa pilihan → belum terpetakan", resolveEffectiveRuasTarget({ ruasQuizUrl: null, ruasTopicId: null, ruasSubjectId: null }) === null);
check("topic id tidak sah (0/negatif) → belum terpetakan", resolveEffectiveRuasTarget({ ruasQuizUrl: null, ruasTopicId: 0, ruasSubjectId: null }) === null);

// --- Daftar topik terpetakan murid ------------------------------------------------------
const mapped = collectMappedTopics([
  { id: 11, title: "Tugas ATP 1.1", ruasQuizUrl: "https://ruas.example/quiz/42?subject_id=7", ruasTopicId: null, ruasSubjectId: null },
  { id: 12, title: "Tugas ATP 1.2", ruasQuizUrl: null, ruasTopicId: 42, ruasSubjectId: 7 },
  { id: 13, title: "Tugas ATP 1.3", ruasQuizUrl: null, ruasTopicId: 43, ruasSubjectId: null },
  { id: 14, title: "Tugas bebas", ruasQuizUrl: null, ruasTopicId: null, ruasSubjectId: null },
]);
check("dedup per (topik, mapel): 4 penugasan → 2 topik", mapped.length === 2, `got ${mapped.length}`);
check("konteks kartu dari penugasan pertama pembawa topik", mapped[0]?.assignmentId === 11 && mapped[0]?.assignmentTitle === "Tugas ATP 1.1");
check("topik kedua dari pilihan guru", mapped[1]?.topicId === 43 && mapped[1]?.subjectId === null && mapped[1]?.assignmentId === 13);
const mappedBedaMapel = collectMappedTopics([
  { id: 21, title: "A", ruasQuizUrl: null, ruasTopicId: 42, ruasSubjectId: 7 },
  { id: 22, title: "B", ruasQuizUrl: null, ruasTopicId: 42, ruasSubjectId: 8 },
]);
check("topik sama beda mapel = dua pemetaan berbeda", mappedBedaMapel.length === 2);

// --- Kartu asesmen ----------------------------------------------------------------------
const cards = planAssessmentCards(mapped, [
  { topicId: 42, title: "Asesmen Eksponen", status: "finished", score: 85, finishedAt: "2026-11-10T02:00:00.000Z" },
]);
check("kartu mengikuti daftar terpetakan (2 kartu)", cards.length === 2);
check(
  "kartu selesai membawa judul/status/skor RUAS",
  cards[0]?.title === "Asesmen Eksponen" && cards[0]?.status === "finished" && cards[0]?.score === 85 && cards[0]?.finished_at === "2026-11-10T02:00:00.000Z",
);
check(
  "entri RUAS hilang → belum dikerjakan + judul cadangan penugasan",
  cards[1]?.status === "not_started" && cards[1]?.title === "Tugas ATP 1.3" && cards[1]?.score === null,
);
check("kartu membawa konteks penugasan", cards[0]?.assignment_id === 11 && cards[0]?.assignment_title === "Tugas ATP 1.1");

// --- Ringkasan tarik nilai ------------------------------------------------------------------
const pull = summarizeRuasPull(
  [
    { id: 1, username: "siti", name: "Siti" },
    { id: 2, username: "budi", name: "Budi" },
    { id: 3, username: "ani", name: "Ani" },
  ],
  {
    siti: { score: 88, finishedAt: "2026-11-10T02:00:00.000Z" },
    budi: null,
    orangasing: { score: 50, finishedAt: null },
  },
);
check("tarikan: hanya murid berskor menjadi baris", pull.rows.length === 1 && pull.rows[0]?.studentId === 1 && pull.rows[0]?.score === 88);
check("tarikan: terbarui = baris tertulis", pull.terbarui === 1);
check("tarikan: belumAdaSkor menghitung budi + ani (kunci hilang = belum ada skor)", pull.belumAdaSkor === 2, `got ${pull.belumAdaSkor}`);
check("tarikan: tidakDikenal menghitung username asing", pull.tidakDikenal === 1);

// --- Progres per rantai ----------------------------------------------------------------------
const chainInputs = [
  { assignmentId: 11, chainKey: "Matematika|Eksponen", subject: "Matematika", topicGroup: "Eksponen", moduleId: 101, materialCompleted: true, worksheetId: 201, attemptStatus: "dinilai", ruasTarget: { topicId: 42, subjectId: 7 } },
  { assignmentId: 12, chainKey: "Matematika|Eksponen", subject: "Matematika", topicGroup: "Eksponen", moduleId: 102, materialCompleted: false, worksheetId: 202, attemptStatus: "terkumpul", ruasTarget: null },
  { assignmentId: 13, chainKey: "Matematika|Eksponen", subject: "Matematika", topicGroup: "Eksponen", moduleId: 102, materialCompleted: false, worksheetId: null, attemptStatus: null, ruasTarget: null },
  { assignmentId: 14, chainKey: null, subject: "Matematika", topicGroup: null, moduleId: null, materialCompleted: false, worksheetId: 204, attemptStatus: "draf", ruasTarget: null },
];
const progress = planChainProgress(chainInputs, cards);
check("progres: penugasan bebas tidak membentuk rantai", progress.length === 1, `got ${progress.length}`);
const chain = progress[0];
check("progres: identitas rantai dari masukan pertama", chain?.subject === "Matematika" && chain?.topic_group === "Eksponen" && chain?.assignment_count === 3);
check("progres: materi unik per modul (102 dihitung sekali)", chain?.materials_total === 2 && chain?.materials_completed === 1 && chain?.materials_pct === 50);
check("progres: LKPD terkumpul 2 (terkumpul+dinilai), dinilai 1", chain?.lkpd_total === 2 && chain?.lkpd_submitted === 2 && chain?.lkpd_graded === 1);
check(
  "progres: asesmen pertama rantai ditempel dari kartu",
  chain?.assessment?.topic_id === 42 && chain?.assessment?.status === "finished" && chain?.assessment?.score === 85 && chain?.assessment?.title === "Asesmen Eksponen",
);
const progressOffline = planChainProgress(chainInputs, null);
check(
  "progres tanpa data RUAS: asesmen tetap ditempel, datanya null",
  progressOffline[0]?.assessment?.topic_id === 42 && progressOffline[0]?.assessment?.status === null && progressOffline[0]?.assessment?.score === null && progressOffline[0]?.assessment?.title === null,
);

// --- Pengkabelan klien + rute ------------------------------------------------------------------
const hubSrc = readFileSync(new URL("./ruas-hub.ts", import.meta.url), "utf8");
check("klien memakai header x-internal-secret", hubSrc.includes('"x-internal-secret": env.RUAS_INTERNAL_SECRET'));
check("klien menurunkan alamat dari RUAS_STATUS_ENDPOINT (tanpa env baru)", hubSrc.includes("deriveRuasInternalBase(env.RUAS_STATUS_ENDPOINT)") && !/RUAS_(TOPICS|SCORES|HANDOFF|ASSESSMENTS)_ENDPOINT/.test(hubSrc));
check("klien memanggil keempat endpoint kontrak", hubSrc.includes('"/topics"') && hubSrc.includes('"/scores"') && hubSrc.includes('"/student-assessments"') && hubSrc.includes('"/handoff"'));
check("semua panggilan ber-timeout (AbortSignal.timeout)", (hubSrc.match(/AbortSignal\.timeout/g) ?? []).length >= 1);

const guruRoutesSrc = readFileSync(new URL("../routes/guru.ts", import.meta.url), "utf8");
check("rute guru: /ruas-topics berperan guru + gagal-lembut available:false", guruRoutesSrc.includes('get("/ruas-topics"') && guruRoutesSrc.includes('requireRole("guru")') && guruRoutesSrc.includes("available: false"));
const appSrc = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
check("app memasang rute /guru", appSrc.includes('v1.route("/guru", guruRoutes)'));

const reportsSrc = readFileSync(new URL("../routes/reports.ts", import.meta.url), "utf8");
check("reports: endpoint /ruas-pull ada", reportsSrc.includes('post("/ruas-pull"'));
check("tarik menolak penugasan belum terpetakan dengan petunjuk", reportsSrc.includes("belum terpetakan ke topik RUAS"));
check("tarik menulis source tarik + pulled_at", reportsSrc.includes('source: "tarik" as const') && reportsSrc.includes("pulledAt"));
check("tarik mencocokkan lewat username sasaran rekap (getTargetStudents)", reportsSrc.includes("getTargetStudents(pullAssignment)") && reportsSrc.includes("students.map((student) => student.username)"));
check("impor CSV menandai source csv", reportsSrc.includes('source: "csv" as const'));
check("tarik mengganti snapshot penugasan (delete lalu insert, pola impor)", reportsSrc.includes("tx.delete(ruasScores).where(eq(ruasScores.assignmentId, assignmentId))"));

const muridSrc = readFileSync(new URL("../routes/murid.ts", import.meta.url), "utf8");
check("murid: GET /asesmen terdaftar", muridSrc.includes('muridRoutes.get("/asesmen"'));
check("murid: /asesmen memakai pemetaan + progres rantai + gagal-lembut available", muridSrc.includes("collectMappedTopics(") && muridSrc.includes("planChainProgress(") && muridSrc.includes("available,"));
check("murid: POST /handoff terdaftar dengan pesan ramah", muridSrc.includes('muridRoutes.post("/handoff"') && muridSrc.includes("RUAS belum bisa dibuka otomatis — buka RUAS seperti biasa."));
check("murid: handoff membawa target topik bila topic_id ada", muridSrc.includes('{ type: "topic", topicId, subjectId }'));

const assignmentsSrc = readFileSync(new URL("../routes/assignments.ts", import.meta.url), "utf8");
check("assignments: serialisasi mengirim ruas_topic_id/ruas_subject_id", assignmentsSrc.includes("ruas_topic_id: assignment.ruasTopicId") && assignmentsSrc.includes("ruas_subject_id: assignment.ruasSubjectId"));
check("assignments: buat menyimpan pemetaan", assignmentsSrc.includes("ruasTopicId: input.ruasTopicId ?? null"));
check("assignments: pemetaan termasuk kunci isi penugasan ditutup", assignmentsSrc.includes('"ruasTopicId", "ruasSubjectId"'));

// --- Migrasi & skema --------------------------------------------------------------------------------
const journal = JSON.parse(readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"));
check("jurnal migrasi 24 entri", journal.entries.length === 24, `got ${journal.entries.length}`);
const entry0020 = journal.entries[20];
check("entri 0020_pemetaan_ruas tetap di idx 20", entry0020.tag === "0020_pemetaan_ruas" && entry0020.idx === 20, JSON.stringify(entry0020));

const migrationSql = readFileSync(new URL("../../../../packages/db/migrations/0020_pemetaan_ruas.sql", import.meta.url), "utf8");
check("SQL 0020: assignments.ruas_topic_id int", migrationSql.includes("ALTER TABLE `assignments` ADD `ruas_topic_id` int"));
check("SQL 0020: assignments.ruas_subject_id int", migrationSql.includes("ALTER TABLE `assignments` ADD `ruas_subject_id` int"));
check("SQL 0020: ruas_scores.source enum csv/tarik bawaan csv", migrationSql.includes("ALTER TABLE `ruas_scores` ADD `source` enum('csv','tarik') DEFAULT 'csv' NOT NULL"));
check("SQL 0020: ruas_scores.pulled_at timestamp", migrationSql.includes("ALTER TABLE `ruas_scores` ADD `pulled_at` timestamp"));

const assignmentSchemaSrc = readFileSync(new URL("../../../../packages/db/src/schema/assignments.ts", import.meta.url), "utf8");
check("skema assignments memuat ruasTopicId/ruasSubjectId", assignmentSchemaSrc.includes('ruasTopicId: int("ruas_topic_id")') && assignmentSchemaSrc.includes('ruasSubjectId: int("ruas_subject_id")'));
const ruasScoresSchemaSrc = readFileSync(new URL("../../../../packages/db/src/schema/ruas-scores.ts", import.meta.url), "utf8");
check("skema ruas_scores memuat source + pulledAt", ruasScoresSchemaSrc.includes('mysqlEnum("source", ["csv", "tarik"])') && ruasScoresSchemaSrc.includes('pulledAt: timestamp("pulled_at")'));

const sharedSchemaSrc = readFileSync(new URL("../../../../packages/shared/src/schemas.ts", import.meta.url), "utf8");
check("skema bersama menerima ruasTopicId/ruasSubjectId (buat + ubah)", (sharedSchemaSrc.match(/ruasTopicId: z\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.optional\(\)/g) ?? []).length === 2);

console.log(`\nAPI hub-tahap-2: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
