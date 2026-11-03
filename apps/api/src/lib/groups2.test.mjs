// Tests for the LKPD group Tahap 2 helpers (salin kelompok, pengeluaran
// anggota, penilaian kontribusi, penyesuaian nilai individu).
// Run with bun from apps/api:  bun src/lib/groups2.test.mjs
//
// Following the repo convention from Tahap 1 (groups.test.mjs), endpoint
// behavior is locked through its pure rules: copy composition intersected
// with the current roster, the removal/window predicates, the contribution
// aggregation, and the effective-score resolution used by the reports.
import {
  contributionWindowOpen,
  groupMemberRemovalAllowed,
  mapGroupAttemptsToStudents,
  pickEffectiveAttempt,
  planCopiedGroups,
  resolveEffectiveMemberScore,
  summarizeContributionRatings,
} from "./groups.ts";

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

console.log("Case 1: planCopiedGroups (salin kelompok — irisan daftar kelas saat ini)");
{
  const source = [
    { name: "Kelompok 1", memberIds: [1, 2, 3] },
    { name: "Kelompok 2", memberIds: [4, 5] },
    { name: "Kelompok 3", memberIds: [6, 7] },
  ];
  const identical = planCopiedGroups(source, new Set([1, 2, 3, 4, 5, 6, 7]));
  check("daftar sama → salinan identik", JSON.stringify(identical) === JSON.stringify(source));
  // Murid 5 dan 6 keluar kelas; murid 8 baru masuk kelas.
  const intersected = planCopiedGroups(source, [1, 2, 3, 4, 7, 8]);
  check("murid yang keluar kelas dibuang dari kelompoknya", JSON.stringify(intersected[0]) === JSON.stringify({ name: "Kelompok 1", memberIds: [1, 2, 3] }));
  check("kelompok menyusut mengikuti daftar", JSON.stringify(intersected[1]) === JSON.stringify({ name: "Kelompok 2", memberIds: [4] }));
  check("nama + urutan kelompok dipertahankan (tidak dinomori ulang)", intersected.map((g) => g.name).join(",") === "Kelompok 1,Kelompok 2,Kelompok 3", intersected.map((g) => g.name).join(","));
  check("murid baru di kelas tidak ikut tersalin (tetap belum berkelompok)", !intersected.some((g) => g.memberIds.includes(8)));
  const oneLeft = planCopiedGroups(source, [1]);
  check("kelompok yang kehilangan semua anggota tidak disalin", oneLeft.length === 1 && oneLeft[0].name === "Kelompok 1");
  check("daftar kelas kosong → tidak ada yang tersalin", planCopiedGroups(source, []).length === 0);
  check("sumber kosong → hasil kosong", planCopiedGroups([], [1, 2]).length === 0);
}

console.log("Case 2: groupMemberRemovalAllowed (keluarkan anggota)");
check("belum ada attempt → boleh", groupMemberRemovalAllowed(null) === true);
check("attempt draf → boleh", groupMemberRemovalAllowed("draf") === true);
check("attempt terkumpul → terkunci", groupMemberRemovalAllowed("terkumpul") === false);
check("attempt dinilai → terkunci", groupMemberRemovalAllowed("dinilai") === false);

console.log("Case 3: contributionWindowOpen (jendela penilaian kontribusi)");
check("draf → tertutup", contributionWindowOpen("draf") === false);
check("terkumpul → terbuka", contributionWindowOpen("terkumpul") === true);
check("dinilai → tertutup", contributionWindowOpen("dinilai") === false);

console.log("Case 4: summarizeContributionRatings (agregat untuk guru)");
{
  const members = [1, 2, 3, 4];
  const ratings = [
    { raterStudentId: 2, rateeStudentId: 1, score: 5 },
    { raterStudentId: 3, rateeStudentId: 1, score: 4 },
    { raterStudentId: 4, rateeStudentId: 1, score: 4 },
    { raterStudentId: 1, rateeStudentId: 2, score: 3 },
    { raterStudentId: 3, rateeStudentId: 2, score: 5 },
  ];
  const summary = summarizeContributionRatings(ratings, members);
  check("rata-rata dibulatkan 1 desimal (13/3 → 4.3)", summary.get(1)?.average === 4.3, String(summary.get(1)?.average));
  check("jumlah penilai dihitung", summary.get(1)?.raters === 3);
  check("rata-rata pas (8/2 → 4)", summary.get(2)?.average === 4 && summary.get(2)?.raters === 2);
  check("anggota tanpa penilaian → null / 0 penilai", summary.get(3)?.average === null && summary.get(3)?.raters === 0);
  check("semua anggota selalu muncul di ringkasan", summary.size === 4);
  const polluted = summarizeContributionRatings([
    { raterStudentId: 1, rateeStudentId: 1, score: 5 },
    { raterStudentId: 99, rateeStudentId: 2, score: 1 },
    { raterStudentId: 2, rateeStudentId: 99, score: 1 },
    { raterStudentId: 2, rateeStudentId: 3, score: 2 },
    { raterStudentId: 2, rateeStudentId: 3, score: 5 },
  ], members);
  check("penilaian diri sendiri diabaikan", polluted.get(1)?.raters === 0);
  check("penilai non-anggota diabaikan", polluted.get(2)?.raters === 0);
  check("yang dinilai non-anggota diabaikan", !polluted.has(99));
  check("penilai yang sama dua kali dihitung sekali (baris terakhir menang di route, di sini dedup penilai)", polluted.get(3)?.raters === 1);
}

console.log("Case 5: resolveEffectiveMemberScore (penyesuaian vs warisan)");
check("override menang atas nilai kelompok", resolveEffectiveMemberScore("70.00", "85.00") === 70);
check("tanpa override → nilai kelompok", resolveEffectiveMemberScore(null, "85.00") === 85);
check("override 0 tetap menang (bukan fallback)", resolveEffectiveMemberScore("0.00", "85.00") === 0);
check("keduanya kosong → null", resolveEffectiveMemberScore(null, null) === null);
check("override tanpa nilai kelompok → override", resolveEffectiveMemberScore("55.50", null) === 55.5);

console.log("Case 6: fikstur laporan Tahap 1 diperluas dengan penyesuaian (nilai laporan per murid)");
{
  // Sama seperti fikstur groups.test.mjs Kasus 4: kelompok 11 (murid 1,2)
  // dinilai 85; kelompok 12 (murid 3) draf; murid 4 tanpa kelompok.
  // Guru menyesuaikan nilai murid 2 menjadi 70.
  const members = [
    { studentId: 1, groupId: 11 },
    { studentId: 2, groupId: 11 },
    { studentId: 3, groupId: 12 },
  ];
  const dinilai = { status: "dinilai", submittedAt: new Date("2026-11-03T02:00:00Z"), totalScore: "85.00" };
  const draf = { status: "draf", submittedAt: null, totalScore: null };
  const groupByStudent = mapGroupAttemptsToStudents(members, new Map([[11, dinilai], [12, draf]]));
  const overrides = new Map([[2, "70.00"]]);
  const reportScore = (studentId) => {
    const effective = pickEffectiveAttempt(undefined, groupByStudent.get(studentId));
    if (!effective) return null;
    return resolveEffectiveMemberScore(overrides.get(studentId) ?? null, effective.totalScore);
  };
  const reportStatus = (studentId) => pickEffectiveAttempt(undefined, groupByStudent.get(studentId))?.status ?? "belum";
  check("anggota tanpa penyesuaian melaporkan nilai kelompok", reportScore(1) === 85);
  check("anggota dengan penyesuaian melaporkan nilai penyesuaiannya", reportScore(2) === 70);
  check("status hitungan tidak berubah oleh penyesuaian (keduanya terkumpul/dinilai)", reportStatus(1) === "dinilai" && reportStatus(2) === "dinilai");
  check("anggota kelompok draf tetap tanpa nilai", reportScore(3) === null && reportStatus(3) === "draf");
  check("murid tanpa kelompok tetap belum", reportScore(4) === null && reportStatus(4) === "belum");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
