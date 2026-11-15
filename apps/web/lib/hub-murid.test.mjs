// Tests for Hub Murid Tahap 2 di sisi web: cermin urai tautan +
// pemetaan efektif (lib/ruas-pemetaan.ts), label status asesmen
// (lib/hub-murid.ts), dan pengkabelan halaman guru (pemilih topik +
// tombol Tarik) & beranda murid (bagian Progres/Asesmen + serah-terima).
// Run with bun from apps/web:  bun lib/hub-murid.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRuasQuizUrl, resolveEffectiveRuasTarget, ruasTopicLabel } from "./ruas-pemetaan.ts";
import { assessmentStatusLabel, assessmentStatusTone } from "./hub-murid.ts";

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

const here = dirname(fileURLToPath(import.meta.url));
const guruPage = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const muridPage = readFileSync(join(here, "../app/murid/page.tsx"), "utf8");

// --- Urai tautan (cermin server) ---------------------------------------------------
check("urai /quiz/<id> + subject_id", JSON.stringify(parseRuasQuizUrl("https://ruas.example/quiz/42?subject_id=7")) === JSON.stringify({ topicId: 42, subjectId: 7 }));
check("urai /topics/<id> tanpa mapel", JSON.stringify(parseRuasQuizUrl("https://ruas.example/topics/9")) === JSON.stringify({ topicId: 9, subjectId: null }));
check("tautan tanpa pola topik → null", parseRuasQuizUrl("https://ruas.example/dashboard") === null);
check("tautan rusak/kosong → null", parseRuasQuizUrl("bukan url") === null && parseRuasQuizUrl("") === null && parseRuasQuizUrl(null) === null);
check("subject_id bukan angka → diabaikan", parseRuasQuizUrl("https://ruas.example/quiz/5?subject_id=abc")?.subjectId === null);

// --- Pemetaan efektif ------------------------------------------------------------------
check(
  "urai tautan menang atas pilihan guru",
  resolveEffectiveRuasTarget({ ruasQuizUrl: "https://ruas.example/quiz/42?subject_id=7", ruasTopicId: 99, ruasSubjectId: 3 })?.topicId === 42,
);
check(
  "pilihan guru berlaku bila tautan tak terurai",
  resolveEffectiveRuasTarget({ ruasQuizUrl: "https://contoh.invalid/x", ruasTopicId: 99, ruasSubjectId: 3 })?.topicId === 99,
);
check("tanpa keduanya → belum terpetakan", resolveEffectiveRuasTarget({ ruasQuizUrl: null, ruasTopicId: null, ruasSubjectId: null }) === null);
check("label topik menyertakan mapel bila ada", ruasTopicLabel({ id: 1, title: "Eksponen", subject_id: 7, subject_name: "Matematika" }) === "Eksponen · Matematika");
check("label topik tanpa mapel = judul saja", ruasTopicLabel({ id: 1, title: "Eksponen", subject_id: null, subject_name: null }) === "Eksponen");

// --- Label status asesmen ------------------------------------------------------------------
check("label status: belum/sedang/selesai", assessmentStatusLabel("not_started") === "Belum dikerjakan" && assessmentStatusLabel("in_progress") === "Sedang dikerjakan" && assessmentStatusLabel("finished") === "Selesai");
check("nada status konsisten", assessmentStatusTone("finished") === "done" && assessmentStatusTone("in_progress") === "doing" && assessmentStatusTone("not_started") === "todo");

// --- Pengkabelan halaman guru ------------------------------------------------------------------
check("guru: memuat daftar topik dari /guru/ruas-topics", guruPage.includes('apiRequest<RuasTopicsResponse>("/guru/ruas-topics")'));
check("guru: catatan deteksi otomatis dari tautan", guruPage.includes("Topik RUAS terdeteksi otomatis dari tautan"));
check("guru: pemilih nonaktif + petunjuk bila jembatan belum aktif", guruPage.includes("disabled={!ruasTopics.available}") && guruPage.includes("jembatan RUAS belum aktif"));
check("guru: payload buat mengirim ruasTopicId", guruPage.includes("ruasTopicId: assignmentRuasTopicId ?? undefined"));
check("guru: payload ubah mengirim null untuk mengosongkan pilihan", guruPage.includes("ruasTopicId: assignmentRuasTopicId,"));
check("guru: edit mengisi pemilih dari penugasan tersimpan", guruPage.includes("setAssignmentRuasTopicId(assignment.ruas_topic_id)"));
check("guru: tombol Tarik nilai RUAS ada di tab Impor", guruPage.includes("Tarik nilai RUAS") && guruPage.includes('apiRequest<RuasPullResponse>("/reports/ruas-pull"'));
check("guru: Tarik nonaktif bila penugasan belum terpetakan + petunjuknya", guruPage.includes("!ruasImportMappedTarget") && guruPage.includes("belum terpetakan ke topik RUAS"));
check("guru: ringkasan tarikan menyebut terbarui/belum ada skor/tidak dikenal", guruPage.includes("belum_ada_skor") && guruPage.includes("tidak_dikenal"));

// --- Pengkabelan beranda murid ---------------------------------------------------------------------
check("murid: memuat ringkasan hub dari /murid/asesmen secara gagal-lembut", muridPage.includes('apiRequest<HubResponse>("/murid/asesmen")') && muridPage.includes(".catch(() => setHub(null))"));
check("murid: bagian Progres belajar + Asesmen RUAS tampil", muridPage.includes("Progres belajar") && muridPage.includes("Asesmen RUAS"));
check("murid: progres menampilkan materi/LKPD + asesmen tertempel", muridPage.includes("chain.materials_completed") && muridPage.includes("chain.lkpd_submitted") && muridPage.includes("chain.assessment"));
check("murid: tombol Buka di RUAS per kartu + Buka RUAS umum", muridPage.includes("Buka di RUAS") && muridPage.includes("Buka RUAS"));
check("murid: serah-terima lewat /murid/handoff lalu alihkan peramban", muridPage.includes('"/murid/handoff"') && muridPage.includes("window.location.href = response.data.url"));
check("murid: pesan gagal serah-terima ramah tanpa rincian teknis", muridPage.includes("RUAS belum bisa dibuka otomatis — buka RUAS seperti biasa."));
check("murid: keadaan belum terhubung tampil sebagai catatan lembut", muridPage.includes("Asesmen RUAS belum dapat dimuat dari sini."));

console.log(`\nWeb hub-murid: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
