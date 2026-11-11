// Tests for saringan kelompok materi (topic_group pada modul):
// skema bersama menerima & membersihkan kelompok, serializer modul
// membawanya, salinan perpustakaan mempertahankannya, dan migrasinya
// terdaftar di jurnal.
// Run with bun from apps/api:  bun src/lib/kelompok-materi.test.mjs
//
// Latar: daftar "Materi saya" disaring per kelompok materi (Eksponen,
// Matematika Keuangan, …) lewat kolom resmi topic_group — bukan tebakan
// dari judul. Judul hanya dipakai SATU kali untuk isi-awal (SQL terpisah
// yang diperiksa guru) dan sebagai saran di formulir edit; sesudah itu
// kolom inilah satu-satunya sumber kebenaran saringan.
import { readFileSync } from "node:fs";
import { createModuleSchema, updateModuleSchema } from "@simak/shared";
import { moduleCopyValues } from "./library.ts";

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

// --- Skema bersama ---------------------------------------------------------
const created = createModuleSchema.parse({ title: "Modul Uji", subject: "Matematika", topicGroup: " Eksponen " });
check("buat modul: kelompok dipangkas spasi tepinya", created.topicGroup === "Eksponen");
const createdEmpty = createModuleSchema.parse({ title: "Modul Uji", subject: "Matematika", topicGroup: "   " });
check("buat modul: kelompok kosong menjadi null (belum dikelompokkan)", createdEmpty.topicGroup === null);
const createdAbsent = createModuleSchema.parse({ title: "Modul Uji", subject: "Matematika" });
check("buat modul: tanpa kelompok tetap sah (undefined → kolom bawaan NULL)", createdAbsent.topicGroup === undefined);
const updated = updateModuleSchema.parse({ topicGroup: null });
check("ubah modul: null eksplisit membersihkan kelompok", updated.topicGroup === null);
check(
  "ubah modul: kelompok lebih dari 120 karakter ditolak",
  !updateModuleSchema.safeParse({ topicGroup: "x".repeat(121) }).success,
);

// --- Salinan perpustakaan ----------------------------------------------------
const copy = moduleCopyValues(
  { id: 7, title: "Modul Sumber", subject: "Matematika", topicGroup: "Eksponen", description: null, coverKey: null },
  42,
  "Guru Sumber",
);
check("salinan modul mempertahankan kelompok sumbernya", copy.topicGroup === "Eksponen");
const copyNull = moduleCopyValues(
  { id: 8, title: "Modul Sumber", subject: "Matematika", topicGroup: null, description: null, coverKey: null },
  42,
  "Guru Sumber",
);
check("salinan modul tanpa kelompok tetap tanpa kelompok", copyNull.topicGroup === null);

// --- Wiring ------------------------------------------------------------------
const moduleRoute = readFileSync(new URL("../routes/modules.ts", import.meta.url), "utf8");
check("serializer modul membawa topic_group", moduleRoute.includes("topic_group: module.topicGroup"));
const migration = readFileSync(
  new URL("../../../../packages/db/migrations/0014_kelompok_materi.sql", import.meta.url),
  "utf8",
);
check(
  "migrasi 0014 menambahkan kolom topic_group yang boleh NULL",
  migration.includes("ALTER TABLE `modules` ADD `topic_group` varchar(120);"),
);
const journal = JSON.parse(
  readFileSync(new URL("../../../../packages/db/migrations/meta/_journal.json", import.meta.url), "utf8"),
);
const lastEntry = journal.entries.at(-1);
check(
  "jurnal migrasi berakhir di 0014_kelompok_materi",
  lastEntry.idx === 14 && lastEntry.tag === "0014_kelompok_materi",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
