// Pemulihan konteks penugasan untuk endpoint LKPD murid (routes/murid.ts).
//
// Masalah yang diperbaiki: konteks penugasan halaman LKPD selama ini hanya
// datang dari parameter URL ?assignmentId=. Tautan LKPD dari halaman modul
// tidak membawanya, sehingga server diam-diam memakai attempt INDIVIDU
// murid — jawaban anggota kelompok terdampar di attempt pribadi, tidak
// pernah menyatu ke attempt bersama kelompok, dan Live Kelompok tidak
// pernah menyala (presence menjawab live:false). Modul ini adalah perencana
// MURNI pemulihannya: diberi daftar penugasan kandidat yang SUDAH terlingkup
// pada murid yang meminta (terbit, LKPD yang sama, murid adalah sasaran),
// ia memutuskan konteks mana yang dipakai — persis seolah id penugasan itu
// dikirim lewat URL. Pemuatan kandidat dari basis data tinggal di route;
// keputusan di sini dapat diuji tanpa basis data.
//
// Aturan keputusan (urut prioritas):
// 1. Ada kandidat KELOMPOK dan murid punya keanggotaan di dalamnya →
//    konteks kelompok penugasan itu (attempt bersama). Bila lebih dari
//    satu, yang paling baru menang (lihat aturan kebaruan di bawah).
// 2. Selain itu kandidat paling baru yang menang, apa pun modenya:
//    kelompok tanpa keanggotaan → keadaan "ungrouped" yang lantang (sama
//    seperti jalur parameter); individu → attempt individu dengan konteks
//    penugasan itu melekat.
// 3. Tanpa kandidat → "none": route memakai perilaku lama persis (attempt
//    individu tanpa konteks) untuk LKPD tanpa penugasan.
//
// Aturan kebaruan (tie-break): penugasan tidak punya kolom "diterbitkan
// pada", jadi kebaruan diukur dari updatedAt barisnya — transisi draf →
// terbit ikut menggeser updatedAt, sehingga secara praktis ini adalah
// "yang terakhir diterbitkan/diubah". Seri pada updatedAt yang sama
// diputuskan oleh id lebih besar (baris lebih baru). Perbandingan total
// ini membuat hasil tidak bergantung pada urutan masukan.

export type RecoveryCandidate = {
  id: number;
  workMode: "individu" | "kelompok";
  /** Hanya bermakna untuk mode kelompok: murid punya baris keanggotaan pada penugasan ini. */
  hasMembership: boolean;
  /** updatedAt baris penugasan dalam epoch milidetik — kunci kebaruan. */
  updatedAtMs: number;
};

export type RecoveredContextPlan =
  | { kind: "kelompok"; assignmentId: number }
  | { kind: "ungrouped"; assignmentId: number }
  | { kind: "individu"; assignmentId: number }
  | { kind: "none" };

function byRecencyDesc(a: RecoveryCandidate, b: RecoveryCandidate): number {
  if (b.updatedAtMs !== a.updatedAtMs) return b.updatedAtMs - a.updatedAtMs;
  return b.id - a.id;
}

export function planRecoveredContext(candidates: readonly RecoveryCandidate[]): RecoveredContextPlan {
  if (candidates.length === 0) return { kind: "none" };
  const ordered = [...candidates].sort(byRecencyDesc);
  const groupWithMembership = ordered.find((candidate) => candidate.workMode === "kelompok" && candidate.hasMembership);
  if (groupWithMembership) return { kind: "kelompok", assignmentId: groupWithMembership.id };
  const newest = ordered[0]!;
  return newest.workMode === "kelompok"
    ? { kind: "ungrouped", assignmentId: newest.id }
    : { kind: "individu", assignmentId: newest.id };
}
