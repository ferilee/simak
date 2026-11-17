// Tests for avatar murid di daftar nama (calon v1.0.75): avatar
// terpasang tampil di samping nama murid pada daftar anggota kelompok
// (sisi murid) dan daftar murid sisi guru. Run with bun from apps/api:
//   bun src/lib/avatar-di-daftar.test.mjs
//
// Yang dikunci di sini:
//  - avatarBadgeFields murni: slug sah katalog → { avatar_slug,
//    avatar_emoji }; belum memasang (null/undefined/kosong) atau slug
//    asing → keduanya null. Representasinya mengikuti payload profil
//    (/murid/today membawa avatar_slug tervalidasi yang sama).
//  - Perencana ringkasan jurnal guru meneruskan avatar tiap murid ke
//    baris muridnya (anggota kelas maupun sasaran langsung).
//  - Wiring: semua payload daftar nama pada cakupan fitur memilih
//    users.avatarSlug dan menyertakan field lencana — anggota
//    kelompok murid (loadStudentGroup → kartu penugasan, halaman
//    LKPD, penilaian kontribusi), presensi live, Rekap Pantau Hasil,
//    daftar pengumpulan (gabungan + per-LKPD + rincian attempt),
//    pemantauan per penugasan, panel Jurnal guru (ringkasan + kepala
//    detail), dan anggota kelas guru.
//  - PDF Rekap TIDAK menyentuh avatar: generator PDF sesi/rentang
//    tidak membaca field avatar sama sekali.
import { readFileSync } from "node:fs";
import { avatarBadgeFields } from "./avatar.ts";
import { planTeacherJournalOverview, reduceJournalStats } from "./jurnal.ts";

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

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// --- avatarBadgeFields murni ---------------------------------------------------
check("terpasang sah: slug + emoji katalog",
  JSON.stringify(avatarBadgeFields("garuda")) === JSON.stringify({ avatar_slug: "garuda", avatar_emoji: "🦅" }));
check("terpasang gratis pun terisi (kancil)",
  JSON.stringify(avatarBadgeFields("kancil")) === JSON.stringify({ avatar_slug: "kancil", avatar_emoji: "🦌" }));
check("belum memasang (null) → keduanya null",
  JSON.stringify(avatarBadgeFields(null)) === JSON.stringify({ avatar_slug: null, avatar_emoji: null }));
check("belum memasang (undefined) → keduanya null",
  JSON.stringify(avatarBadgeFields(undefined)) === JSON.stringify({ avatar_slug: null, avatar_emoji: null }));
check("slug kosong → keduanya null",
  JSON.stringify(avatarBadgeFields("")) === JSON.stringify({ avatar_slug: null, avatar_emoji: null }));
check("slug asing bagi katalog → keduanya null (diperlakukan belum memasang)",
  JSON.stringify(avatarBadgeFields("bukan-avatar")) === JSON.stringify({ avatar_slug: null, avatar_emoji: null }));

// --- Perencana jurnal guru meneruskan avatar ------------------------------------
const overview = planTeacherJournalOverview({
  classes: [{ id: 1, name: "X TKJ A" }],
  members: [
    { classId: 1, studentId: 1, name: "Bima", username: "bima", avatarSlug: "naga" },
    { classId: 1, studentId: 2, name: "Ani", username: "ani", avatarSlug: null },
  ],
  directStudents: [
    { studentId: 3, name: "Citra", username: "citra", avatarSlug: "asing", classId: 1, className: "X TKJ A" },
  ],
  stats: reduceJournalStats([]),
});
const byId = new Map(overview[0].students.map((student) => [student.id, student]));
check("jurnal: anggota beravatar → avatar_slug + avatar_emoji terisi",
  byId.get(1)?.avatar_slug === "naga" && byId.get(1)?.avatar_emoji === "🐉");
check("jurnal: anggota tanpa avatar → keduanya null",
  byId.get(2)?.avatar_slug === null && byId.get(2)?.avatar_emoji === null);
check("jurnal: sasaran langsung berslug asing → keduanya null",
  byId.get(3)?.avatar_slug === null && byId.get(3)?.avatar_emoji === null);

// --- Wiring: sisi murid ---------------------------------------------------------
const groupsLib = read("./groups.ts");
check("loadStudentGroup memilih avatarSlug anggota dan memetakan lencana",
  groupsLib.includes("avatarSlug: users.avatarSlug") &&
    groupsLib.includes("...avatarBadgeFields(member.avatarSlug)") &&
    groupsLib.includes('import { avatarBadgeFields } from "./avatar";'));

const muridRoute = read("../routes/murid.ts");
check("penilaian kontribusi: teammates membawa avatar_slug + avatar_emoji dari anggota kelompok",
  muridRoute.includes("avatar_slug: member.avatar_slug") &&
    muridRoute.includes("avatar_emoji: member.avatar_emoji"));
check("presensi live: avatar dibaca satu kueri himpunan users dan disertakan per entri",
  muridRoute.includes("presenceAvatarById") &&
    muridRoute.includes("...avatarBadgeFields(presenceAvatarById.get(entry.studentId))"));

// --- Wiring: sisi guru ----------------------------------------------------------
const reportsRoute = read("../routes/reports.ts");
check("rekap: kedua jalur sasaran memilih avatarSlug",
  (reportsRoute.match(/avatarSlug: users\.avatarSlug/g) ?? []).length === 2);
check("rekap: baris murid menyertakan lencana dari avatarBadgeFields",
  reportsRoute.includes("...avatarBadgeFields(student.avatarSlug)"));
const sessionPdfSource = reportsRoute.slice(reportsRoute.indexOf("function createSessionPdf"), reportsRoute.indexOf("function createRangePdf"));
const rangePdfSource = reportsRoute.slice(reportsRoute.indexOf("function createRangePdf"), reportsRoute.indexOf("type TabularPdfOptions"));
check("PDF rekap sesi TIDAK menyentuh avatar",
  !sessionPdfSource.includes("avatar"));
check("PDF rekap rentang TIDAK menyentuh avatar",
  !rangePdfSource.includes("avatar"));
check("CSV rekap TIDAK menyentuh avatar",
  !reportsRoute.slice(reportsRoute.indexOf("function respondSessionCsv"), reportsRoute.indexOf("function respondRangePdf")).includes("avatar"));

const gradingRoute = read("../routes/grading.ts");
check("pengumpulan gabungan: attempt individu membawa lencana pemiliknya",
  gradingRoute.includes("studentAvatarSlug: users.avatarSlug") &&
    gradingRoute.includes("...avatarBadgeFields(row.studentAvatarSlug)"));
check("pengumpulan gabungan: attempt kelompok membawa daftar members beravatar, member_names tetap ada",
  gradingRoute.includes("memberBadgesByGroup") &&
    gradingRoute.includes("members: memberBadgesByGroup.get(row.groupId) ?? []") &&
    gradingRoute.includes("member_names: memberNamesByGroup.get(row.groupId) ?? []"));
check("pemantauan per penugasan: daftar murid membawa lencana (kedua jalur sasaran memilih avatarSlug)",
  gradingRoute.includes("...avatarBadgeFields(student.avatarSlug)") &&
    gradingRoute.includes(".select({ id: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug })") &&
    gradingRoute.includes(".select({ id: users.id, name: users.name, username: users.username, avatarSlug: users.avatarSlug, classId: classMembers.classId })"));

const worksheetsRoute = read("../routes/worksheets.ts");
check("pengumpulan per-LKPD: pola lencana sama dengan daftar gabungan",
  worksheetsRoute.includes("studentAvatarSlug: users.avatarSlug") &&
    worksheetsRoute.includes("members: memberBadgesByGroup.get(row.groupId) ?? []") &&
    worksheetsRoute.includes("...avatarBadgeFields(row.studentAvatarSlug)"));
check("rincian attempt: anggota kelompok membawa lencana di samping kontribusi/nilai",
  worksheetsRoute.includes("...avatarBadgeFields(member.avatarSlug)") &&
    worksheetsRoute.includes("avatar_slug: string | null;"));

const jurnalRoute = read("../routes/jurnal.ts");
check("jurnal guru: jangkauan (anggota + sasaran langsung) memilih avatarSlug",
  (jurnalRoute.match(/avatarSlug: users\.avatarSlug/g) ?? []).length === 3);
check("jurnal guru: kepala detail murid membawa lencana",
  jurnalRoute.includes("...avatarBadgeFields(studentRow.avatarSlug)"));
const jurnalLib = read("./jurnal.ts");
check("jurnal lib: perencana mengisi avatar_slug/avatar_emoji tiap murid",
  jurnalLib.includes("...avatarBadgeFields(student.avatarSlug)") &&
    jurnalLib.includes("avatar_slug: string | null;"));

const classesRoute = read("../routes/classes.ts");
check("anggota kelas guru: memilih avatarSlug dan menyertakan lencana per anggota",
  classesRoute.includes("avatarSlug: users.avatarSlug") &&
    classesRoute.includes("...avatarBadgeFields(row.avatarSlug)"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
