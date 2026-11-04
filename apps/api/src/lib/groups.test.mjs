// Tests for the LKPD group helpers (Tahap 1 — kelompok acak otomatis).
// Run with bun from apps/api:  bun src/lib/groups.test.mjs
//
// Covers the pure rules only (no database): group-size planning, the
// Fisher–Yates split with an injected RNG, and the report merge that maps a
// group attempt onto its members (session/range report computation).
import {
  mapGroupAttemptsToStudents,
  pickEffectiveAttempt,
  planGroupSizes,
  shuffleIds,
  splitIntoGroups,
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

// RNG deterministik (LCG) agar pengacakan bisa direproduksi di tes.
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

console.log("Case 1: planGroupSizes (Aturan B — jumlah kelompok dibulatkan ke atas)");
check("n=0 menghasilkan daftar kosong", JSON.stringify(planGroupSizes(0, 4)) === "[]");
check("n=33, size=4 → 9 kelompok [4,4,4,4,4,4,3,3,3] (tidak ada lagi kelompok 5)", JSON.stringify(planGroupSizes(33, 4)) === JSON.stringify([4, 4, 4, 4, 4, 4, 3, 3, 3]), JSON.stringify(planGroupSizes(33, 4)));
check("n=32, size=4 → 8 kelompok berisi 4", JSON.stringify(planGroupSizes(32, 4)) === JSON.stringify([4, 4, 4, 4, 4, 4, 4, 4]));
check("n=25, size=4 → [4,4,4,4,3,3,3]", JSON.stringify(planGroupSizes(25, 4)) === JSON.stringify([4, 4, 4, 4, 3, 3, 3]), JSON.stringify(planGroupSizes(25, 4)));
check("n=26, size=4 → [4,4,4,4,4,3,3]", JSON.stringify(planGroupSizes(26, 4)) === JSON.stringify([4, 4, 4, 4, 4, 3, 3]), JSON.stringify(planGroupSizes(26, 4)));
check("n=27, size=4 → [4,4,4,4,4,4,3]", JSON.stringify(planGroupSizes(27, 4)) === JSON.stringify([4, 4, 4, 4, 4, 4, 3]), JSON.stringify(planGroupSizes(27, 4)));
check("n=30, size=4 → [4,4,4,4,4,4,3,3]", JSON.stringify(planGroupSizes(30, 4)) === JSON.stringify([4, 4, 4, 4, 4, 4, 3, 3]), JSON.stringify(planGroupSizes(30, 4)));
check("n=34, size=4 → [4,4,4,4,4,4,4,3,3]", JSON.stringify(planGroupSizes(34, 4)) === JSON.stringify([4, 4, 4, 4, 4, 4, 4, 3, 3]), JSON.stringify(planGroupSizes(34, 4)));
check("n=10, size=4 → 3 kelompok [4,3,3]", JSON.stringify(planGroupSizes(10, 4)) === JSON.stringify([4, 3, 3]), JSON.stringify(planGroupSizes(10, 4)));
check("n=7, size=4 → [4,3]", JSON.stringify(planGroupSizes(7, 4)) === JSON.stringify([4, 3]), JSON.stringify(planGroupSizes(7, 4)));
check("n=6, size=4 → [3,3]", JSON.stringify(planGroupSizes(6, 4)) === JSON.stringify([3, 3]), JSON.stringify(planGroupSizes(6, 4)));
check("n=5, size=4 → [3,2]", JSON.stringify(planGroupSizes(5, 4)) === JSON.stringify([3, 2]), JSON.stringify(planGroupSizes(5, 4)));
check("n<size: n=3, size=4 → satu kelompok [3]", JSON.stringify(planGroupSizes(3, 4)) === JSON.stringify([3]));
check("n=1, size=4 → [1]", JSON.stringify(planGroupSizes(1, 4)) === JSON.stringify([1]));
check("size=2: n=7 → [2,2,2,1]", JSON.stringify(planGroupSizes(7, 2)) === JSON.stringify([2, 2, 2, 1]), JSON.stringify(planGroupSizes(7, 2)));
check("size=10: n=25 → [9,8,8]", JSON.stringify(planGroupSizes(25, 10)) === JSON.stringify([9, 8, 8]), JSON.stringify(planGroupSizes(25, 10)));
for (const [n, size] of [[33, 4], [31, 3], [17, 5], [100, 6], [9, 2], [12, 10]]) {
  const plan = planGroupSizes(n, size);
  check(`n=${n}, size=${size}: total terjaga`, plan.reduce((a, b) => a + b, 0) === n);
  check(`n=${n}, size=${size}: selisih maks-min <= 1`, Math.max(...plan) - Math.min(...plan) <= 1);
  check(`n=${n}, size=${size}: tidak pernah melewati ukuran target`, Math.max(...plan) <= size);
  check(`n=${n}, size=${size}: kelompok besar lebih dulu`, plan.every((value, index) => index === 0 || plan[index - 1] >= value));
}
// Sapuan properti Aturan B: untuk semua n 1..60 dan size 2..10, rencana
// harus menjumlah ke n, tidak pernah melewati size, berselisih <= 1,
// dan terurut menurun.
{
  let sweepOk = true;
  let sweepDetail = "";
  for (let n = 1; n <= 60 && sweepOk; n++) {
    for (let size = 2; size <= 10; size++) {
      const plan = planGroupSizes(n, size);
      const ok = plan.reduce((a, b) => a + b, 0) === n
        && Math.max(...plan) <= size
        && Math.max(...plan) - Math.min(...plan) <= 1
        && plan.every((value, index) => index === 0 || plan[index - 1] >= value);
      if (!ok) {
        sweepOk = false;
        sweepDetail = `n=${n}, size=${size} → ${JSON.stringify(plan)}`;
      }
    }
  }
  check("sapuan n=1..60 × size=2..10: jumlah=n, maks<=size, selisih<=1, menurun", sweepOk, sweepDetail);
}

console.log("Case 2: shuffleIds (Fisher–Yates)");
{
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = shuffleIds(ids, lcg(42));
  check("hasil adalah permutasi", JSON.stringify([...shuffled].sort((a, b) => a - b)) === JSON.stringify(ids));
  check("masukan tidak berubah", JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]));
  check("urutan berubah untuk seed ini", JSON.stringify(shuffled) !== JSON.stringify(ids), JSON.stringify(shuffled));
  check("seed sama menghasilkan urutan sama", JSON.stringify(shuffleIds(ids, lcg(7))) === JSON.stringify(shuffleIds(ids, lcg(7))));
  check("rng selalu 0.999 tidak mengubah urutan", JSON.stringify(shuffleIds(ids, () => 0.999)) === JSON.stringify(ids));
}

console.log("Case 3: splitIntoGroups");
{
  const ids = Array.from({ length: 33 }, (_, i) => i + 1);
  const groups = splitIntoGroups(ids, 4, lcg(123));
  check("33 murid ukuran 4 menghasilkan 9 kelompok", groups.length === 9);
  check("ukuran mengikuti rencana Aturan B [4,4,4,4,4,4,3,3,3]", JSON.stringify(groups.map((g) => g.length)) === JSON.stringify([4, 4, 4, 4, 4, 4, 3, 3, 3]));
  const flat = groups.flat();
  check("setiap murid tepat satu kali", flat.length === 33 && new Set(flat).size === 33 && flat.every((id) => ids.includes(id)));
  check("daftar kosong menghasilkan daftar kosong", JSON.stringify(splitIntoGroups([], 4, lcg(1))) === "[]");
  check("n<size tetap satu kelompok utuh", JSON.stringify(splitIntoGroups([9, 8], 4, lcg(3)).map((g) => g.length)) === JSON.stringify([2]));
}

console.log("Case 4: pemetaan attempt kelompok ke anggota (fikstur laporan)");
{
  // Kelompok 11 beranggotakan murid 1 dan 2; kelompok 12 beranggotakan
  // murid 3; murid 4 belum berkelompok. Attempt kelompok 11 terkumpul
  // dengan nilai; kelompok 12 masih draf.
  const members = [
    { studentId: 1, groupId: 11 },
    { studentId: 2, groupId: 11 },
    { studentId: 3, groupId: 12 },
  ];
  const terkumpul = { status: "terkumpul", submittedAt: new Date("2026-11-03T02:00:00Z"), totalScore: null };
  const dinilai = { status: "dinilai", submittedAt: new Date("2026-11-03T02:00:00Z"), totalScore: "85.00" };
  const draf = { status: "draf", submittedAt: null, totalScore: null };
  const byGroup = new Map([[11, dinilai], [12, draf]]);
  const byStudent = mapGroupAttemptsToStudents(members, byGroup);
  check("dua anggota kelompok yang sama sama-sama terpetakan", byStudent.get(1) === dinilai && byStudent.get(2) === dinilai);
  check("nilai kelompok diwarisi kedua anggota", byStudent.get(1)?.totalScore === "85.00" && byStudent.get(2)?.totalScore === "85.00");
  check("anggota kelompok draf terpetakan sebagai draf", byStudent.get(3) === draf);
  check("murid tanpa kelompok tidak terpetakan", !byStudent.has(4));
  check("kelompok tanpa attempt tidak memetakan anggotanya", mapGroupAttemptsToStudents(members, new Map()).size === 0);
  void terkumpul;
}

console.log("Case 5: pickEffectiveAttempt (gabungan laporan per murid)");
{
  const draf = { status: "draf", submittedAt: null, totalScore: null };
  const terkumpul = { status: "terkumpul", submittedAt: new Date(), totalScore: null };
  const dinilai = { status: "dinilai", submittedAt: new Date(), totalScore: "90.00" };
  check("hanya individu → individu", pickEffectiveAttempt(draf, undefined) === draf);
  check("hanya kelompok → kelompok", pickEffectiveAttempt(undefined, terkumpul) === terkumpul);
  check("keduanya kosong → undefined", pickEffectiveAttempt(undefined, undefined) === undefined);
  check("individu draf + kelompok terkumpul → kelompok (terhitung mengumpulkan)", pickEffectiveAttempt(draf, terkumpul) === terkumpul);
  check("individu terkumpul + kelompok draf → individu", pickEffectiveAttempt(terkumpul, draf) === terkumpul);
  check("individu dinilai + kelompok terkumpul → individu (nilai tidak tertutup)", pickEffectiveAttempt(dinilai, terkumpul) === dinilai);
  check("seri terkumpul → kelompok (produk penugasan)", pickEffectiveAttempt(terkumpul, terkumpul) === terkumpul);
  check("seri dinilai → kelompok", pickEffectiveAttempt(dinilai, dinilai) === dinilai);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
