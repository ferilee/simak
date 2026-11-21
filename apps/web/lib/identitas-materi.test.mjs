// Tests for the material identity chip helpers (lib/identitas-materi.ts):
// chip label identitas yang ditempelkan sistem pada daftar sisi guru —
// kode mapel, token kelas-semester dari cerminan kurikulum, rangkaian
// chip/prefix, kunci statis cerminan terhadap berkas kurikulum API,
// pencarian PemilihCepat lewat kode, dan wiring statis (chip hanya di
// halaman guru, tidak pernah di berkas murid).
// Run with bun from apps/web:  bun lib/identitas-materi.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KELAS_SEMESTER_MAP,
  kelasSemesterToken,
  moduleIdentity,
  subjectCode,
  worksheetIdentity,
} from "./identitas-materi.ts";
import { filterPickerOptions } from "./pemilih-cepat.ts";

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- subjectCode -----------------------------------------------------------
check("kode mapel eksplisit: Matematika → MAT", subjectCode("Matematika") === "MAT");
check("kode mapel eksplisit: KKA → KKA", subjectCode("KKA") === "KKA");
check(
  "kode mapel eksplisit: nama panjang KKA → KKA",
  subjectCode("Koding dan Kecerdasan Artifisial (KKA)") === "KKA",
);
check("kode mapel eksplisit: Informatika → INF", subjectCode("Informatika") === "INF");
check("kode mapel tak dikenal: 3 huruf pertama huruf besar", subjectCode("Bahasa Inggris") === "BAH");
check("kode mapel kosong → null", subjectCode("") === null && subjectCode(null) === null && subjectCode("  ") === null);

// --- kelasSemesterToken: kasus nyata ---------------------------------------
check("Eksponen X ganjil → X1", kelasSemesterToken("Matematika", "Eksponen", { major: 1, minor: 1 }) === "X1");
check(
  "Barisan XI ganjil → XI1 (ATP 1.1 yang sama, jenjang berbeda)",
  kelasSemesterToken("Matematika", "Barisan dan Deret", { major: 1, minor: 1 }) === "XI1",
);
check(
  "Matematika Keuangan XI → XI1",
  kelasSemesterToken("Matematika", "Matematika Keuangan", { major: 2, minor: 4 }) === "XI1",
);
check(
  "SPtLDV nama kanonis → X1",
  kelasSemesterToken("Matematika", "Sistem Pertidaksamaan Linear Dua Variabel", { major: 2, minor: 7 }) === "X1",
);
check(
  "SPtLDV alias nama pendek lama → X1",
  kelasSemesterToken("Matematika", "SPtLDV", { major: 2, minor: 1 }) === "X1",
);
check(
  "KKA Berpikir Komputasional → X1",
  kelasSemesterToken("KKA", "Berpikir Komputasional", { major: 1, minor: 1 }) === "X1",
);
check(
  "Informatika Berpikir Komputasional → X1",
  kelasSemesterToken("Informatika", "Berpikir Komputasional", { major: 1, minor: 1 }) === "X1",
);
check(
  "Informatika Literasi Digital ATP awal → X1",
  kelasSemesterToken("Informatika", "Literasi Digital", { major: 2, minor: 3 }) === "X1",
);
check(
  "Informatika Literasi Digital ATP lanjut → X2",
  kelasSemesterToken("Informatika", "Literasi Digital", { major: 2, minor: 10 }) === "X2",
);
check(
  "Informatika Literasi Digital tanpa ATP → ambigu → null",
  kelasSemesterToken("Informatika", "Literasi Digital", null) === null,
);
check(
  "Informatika Literasi Digital ATP di luar kedua rentang → null",
  kelasSemesterToken("Informatika", "Literasi Digital", { major: 9, minor: 9 }) === null,
);
check(
  "Analisis Data Matematika (X genap) vs KKA (X genap) sama-sama X2, dibedakan kode mapel di chip",
  kelasSemesterToken("Matematika", "Analisis Data", { major: 3, minor: 1 }) === "X2" &&
    kelasSemesterToken("KKA", "Analisis Data", { major: 6, minor: 1 }) === "X2",
);
check(
  "kelompok tak dikenal → null (tidak ditebak)",
  kelasSemesterToken("Matematika", "Kelompok Ngawur", { major: 1, minor: 1 }) === null,
);
check(
  "mapel tak dikenal → null",
  kelasSemesterToken("Bahasa Inggris", "Eksponen", { major: 1, minor: 1 }) === null,
);
check(
  "masukan kosong → null",
  kelasSemesterToken("", "Eksponen", { major: 1, minor: 1 }) === null &&
    kelasSemesterToken("Matematika", "", { major: 1, minor: 1 }) === null &&
    kelasSemesterToken(null, null, null) === null,
);
check(
  "pencocokan kelompok bebas huruf besar/kecil + spasi",
  kelasSemesterToken(" matematika ", "  eksponen ", { major: 1, minor: 2 }) === "X1",
);

// --- Rangkaian identitas -----------------------------------------------------
const modulEksponen = {
  id: 1,
  title: "Pangkat Pecahan sebagai Bentuk Akar — Eksponen (ATP 1.1)",
  subject: "Matematika",
  topic_group: "Eksponen",
  status: "terbit",
};
const idEksponen = moduleIdentity(modulEksponen);
check(
  "chip modul Eksponen persis format yang disetujui",
  idEksponen.chip === "X1-MAT · Eksponen · 1.1",
  idEksponen.chip ?? "null",
);
check("prefix opsi modul Eksponen", idEksponen.optionPrefix === "[X1 · 1.1]", idEksponen.optionPrefix ?? "null");
check("prefix picker modul Eksponen", idEksponen.pickerPrefix === "X1-MAT · 1.1", idEksponen.pickerPrefix ?? "null");

const modulMatkeu = {
  id: 2,
  title: "Nilai Sekarang Pinjaman — Matematika Keuangan (ATP 2.4)",
  subject: "Matematika",
  topic_group: "Matematika Keuangan",
  status: "terbit",
};
const lkpdMatkeu = { id: 21, title: "LKPD ATP 2.4 — Nilai Sekarang Pinjaman dan Anuitas", module_id: 2, status: "terbit" };
const idLkpdMatkeu = worksheetIdentity(lkpdMatkeu, modulMatkeu);
check(
  "chip LKPD mengikuti modul pasangannya",
  idLkpdMatkeu.chip === "XI1-MAT · Matematika Keuangan · 2.4",
  idLkpdMatkeu.chip ?? "null",
);
check(
  "nomor ATP LKPD didahulukan dari judul modul",
  worksheetIdentity(
    { id: 22, title: "LKPD ATP 1.6 — Menyelesaikan Masalah Pangkat Pecahan", module_id: 1, status: "terbit" },
    modulEksponen,
  ).atp === "1.6",
);
check(
  "chip LKPD SPtLDV (alias) tetap membawa nama kelompok apa adanya",
  worksheetIdentity(
    { id: 23, title: "LKPD ATP 2.2 — Daerah Penyelesaian", module_id: 3, status: "draf" },
    { id: 3, title: "Daerah Penyelesaian — SPtLDV (ATP 2.2)", subject: "Matematika", topic_group: "SPtLDV", status: "terbit" },
  ).chip === "X1-MAT · SPtLDV · 2.2",
);

// Degradasi anggun: unsur tak diketahui gugur tanpa pemisah ganda.
const idPengayaan = moduleIdentity({
  id: 4,
  title: "Modul Pengayaan",
  subject: "Matematika",
  topic_group: "Pengayaan",
  status: "draf",
});
check(
  "kelompok tak terpetakan: chip tanpa token kelas-semester dan tanpa ATP",
  idPengayaan.chip === "MAT · Pengayaan" && idPengayaan.kelasSemester === null,
  idPengayaan.chip ?? "null",
);
check(
  "kelompok tak terpetakan: prefix opsi kosong (perlu kelas-semester), prefix picker hanya kode",
  idPengayaan.optionPrefix === null && idPengayaan.pickerPrefix === "MAT",
);
const idTanpaModul = worksheetIdentity({ id: 24, title: "LKPD ATP 1.1 — Bebas", module_id: null, status: "draf" }, null);
check(
  "LKPD tanpa modul: chip hanya nomor ATP",
  idTanpaModul.chip === "1.1" && idTanpaModul.optionPrefix === null && idTanpaModul.pickerPrefix === null,
  idTanpaModul.chip ?? "null",
);
const idKosong = moduleIdentity({ id: 5, title: "Tanpa Pola", subject: "", topic_group: null, status: "draf" });
check("semua unsur kosong → chip null", idKosong.chip === null && idKosong.optionPrefix === null && idKosong.pickerPrefix === null);
check(
  "tidak ada pemisah ganda pada chip mana pun",
  [idEksponen, idLkpdMatkeu, idPengayaan, idTanpaModul].every(
    (parts) => parts.chip === null || (!parts.chip.includes("··") && !parts.chip.includes("·  ·") && !parts.chip.startsWith("·")),
  ),
);

// --- Kunci statis cerminan terhadap kurikulum API ---------------------------
{
  const apiKurikulum = readFileSync(new URL("../../api/src/lib/kurikulum.ts", import.meta.url), "utf8");
  const setsRegion = apiKurikulum.slice(apiKurikulum.indexOf("export const CURRICULUM_SETS"));
  const tokenRe = /(subject|grade|semester|title):\s*"([^"]+)"|atp\("(\d+)\.(\d+)"/g;
  const instances = [];
  let currentSet = null;
  let currentGroup = null;
  for (const match of setsRegion.matchAll(tokenRe)) {
    if (match[1] === "subject") {
      currentSet = { subject: match[2], grade: null, semester: null };
      currentGroup = null;
    } else if (match[1] === "grade" && currentSet) {
      currentSet.grade = match[2];
    } else if (match[1] === "semester" && currentSet) {
      currentSet.semester = match[2];
    } else if (match[1] === "title" && currentSet) {
      currentGroup = { ...currentSet, group: match[2], codes: [] };
      instances.push(currentGroup);
    } else if (match[3] !== undefined && currentGroup) {
      currentGroup.codes.push(`${match[3]}.${match[4]}`);
    }
  }
  check(
    "kurikulum API terbaca: 8 set, 24 kelompok, 152 ATP",
    instances.length === 24 && instances.reduce((sum, group) => sum + group.codes.length, 0) === 152,
    `${instances.length} kelompok`,
  );
  const expectedToken = (grade, semester) => `${grade.replace("Kelas ", "")}${semester === "Ganjil" ? "1" : "2"}`;
  const mismatches = [];
  for (const instance of instances) {
    for (const code of instance.codes) {
      const [major, minor] = code.split(".").map(Number);
      const token = kelasSemesterToken(instance.subject, instance.group, { major, minor });
      if (token !== expectedToken(instance.grade, instance.semester)) {
        mismatches.push(`${instance.subject}/${instance.group}/${code} → ${token}`);
      }
    }
  }
  check(
    "setiap (mapel, kelompok, ATP) di API terpetakan ke token yang benar oleh cerminan",
    mismatches.length === 0,
    mismatches.slice(0, 5).join("; "),
  );
  const stale = KELAS_SEMESTER_MAP.filter(
    (entry) =>
      !instances.some(
        (instance) =>
          instance.subject === entry.subject &&
          instance.group === entry.group &&
          instance.grade === entry.grade &&
          instance.semester === entry.semester,
      ),
  );
  check("cerminan tidak memuat entri basi (semua entri ada di API)", stale.length === 0, JSON.stringify(stale));
  const badCodes = [];
  for (const entry of KELAS_SEMESTER_MAP) {
    if (!entry.atpCodes) continue;
    const instance = instances.find(
      (candidate) =>
        candidate.subject === entry.subject &&
        candidate.group === entry.group &&
        candidate.grade === entry.grade &&
        candidate.semester === entry.semester,
    );
    for (const code of entry.atpCodes) {
      if (!instance || !instance.codes.includes(code)) badCodes.push(`${entry.subject}/${entry.group}/${code}`);
    }
  }
  check("kode ATP pada entri terbagi (Literasi Digital Informatika) semuanya nyata di API", badCodes.length === 0, badCodes.join("; "));
  const uncovered = instances.filter((instance) => {
    const entries = KELAS_SEMESTER_MAP.filter(
      (entry) => entry.subject === instance.subject && entry.group === instance.group,
    );
    if (entries.length === 0) return true;
    if (entries.length > 1 && entries.some((entry) => !entry.atpCodes)) return true;
    return false;
  });
  check(
    "setiap kelompok API tercakup cerminan; kelompok multi-set wajib berkode ATP",
    uncovered.length === 0,
    uncovered.map((instance) => `${instance.subject}/${instance.group}`).join("; "),
  );
}

// --- Pencarian PemilihCepat lewat awalan identitas ---------------------------
{
  const options = [
    { id: 1, title: "Pangkat Pecahan sebagai Bentuk Akar", group: "Eksponen", prefix: "X1-MAT · 1.1" },
    { id: 2, title: "Bunga Tunggal", group: "Matematika Keuangan", prefix: "XI1-MAT · 2.1" },
    { id: 3, title: "Struktur Data Standar", group: "Berpikir Komputasional", prefix: "X1-INF · 1.1" },
  ];
  const ids = (list) => list.map((option) => option.id);
  check("cari 'X1' menemukan semua materi Kelas X semester 1", same(ids(filterPickerOptions(options, "X1")), [1, 3]));
  check("cari 'MAT' menemukan semua Matematika", same(ids(filterPickerOptions(options, "MAT")), [1, 2]));
  check("cari '1.1' menemukan ATP 1.1 lintas mapel", same(ids(filterPickerOptions(options, "1.1")), [1, 3]));
  check("cari gabungan 'x1 inf' menunjuk satu materi", same(ids(filterPickerOptions(options, "x1 inf")), [3]));
  check("cari judul tetap bekerja seperti sebelumnya", same(ids(filterPickerOptions(options, "bunga")), [2]));
  check(
    "opsi tanpa prefix tetap tersaring dari judulnya",
    same(ids(filterPickerOptions([{ id: 9, title: "Modul Lama", group: null }], "lama")), [9]),
  );
}

// --- Kunci wiring statis ------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../app/guru/page.tsx"), "utf8");
const pickerComponent = readFileSync(join(here, "../components/PemilihCepat.tsx"), "utf8");
const pickerLib = readFileSync(join(here, "pemilih-cepat.ts"), "utf8");
const css = readFileSync(join(here, "../app/globals.css"), "utf8");
const count = (haystack, needle) => haystack.split(needle).length - 1;

check("halaman guru mengimpor helper identitas", page.includes('from "../../lib/identitas-materi"'));
check(
  "chip dirender di baris modul DAN baris LKPD (tepat 2)",
  count(page, 'className="identity-chip"') === 2,
  `${count(page, 'className="identity-chip"')} temuan`,
);
check(
  "prefix opsi dipakai di dropdown modul Langkah 2 dan pemilih LKPD Langkah 5",
  page.includes("moduleIdentity(module).optionPrefix") && page.includes(").optionPrefix"),
);
check(
  "prefix picker ditempelkan pada opsi modul dan LKPD formulir penugasan",
  count(page, "pickerPrefix") === 2,
  `${count(page, "pickerPrefix")} temuan`,
);
check(
  "komponen PemilihCepat menggambar awalan di nilai terpilih dan di daftar opsi",
  count(pickerComponent, "pemilih-cepat-prefix") >= 2,
);
check("pencarian PemilihCepat mencocokkan awalan identitas", pickerLib.includes("option.prefix"));
check(
  "CSS chip identitas + awalan picker tersedia",
  css.includes(".identity-chip") && css.includes(".pemilih-cepat-prefix"),
);
{
  const muridFiles = readdirSync(join(here, "../app/murid"), { recursive: true })
    .filter((name) => typeof name === "string" && /\.(tsx|ts)$/.test(name));
  const offenders = muridFiles.filter((name) => {
    const content = readFileSync(join(here, "../app/murid", name), "utf8");
    return content.includes("identitas-materi") || content.includes("identity-chip");
  });
  check(
    "tidak ada chip identitas di berkas murid mana pun",
    muridFiles.length > 0 && offenders.length === 0,
    offenders.join(", "),
  );
}

console.log(`\nHasil: ${passed} lulus, ${failed} gagal, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
