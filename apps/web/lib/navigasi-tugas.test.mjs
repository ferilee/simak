// Tests for navigasi lingkaran penugasan beranda murid (sisi web):
// perencana murni pager "Penugasan aktif" + wiring render di beranda.
// Run with bun from apps/web:  bun lib/navigasi-tugas.test.mjs
//
// Yang dikunci di sini:
//  - initialPagerIndex: penugasan belum-selesai paling awal pada
//    urutan global server; semua selesai → yang pertama; kosong → -1.
//  - planCircle: selesai → centang hijau; terkunci → gembok redup;
//    biasa yang sedang dibuka → terisi penuh (current); lambang
//    keadaan (centang/gembok) menang atas penanda current, nada
//    current hanya untuk lingkaran biasa.
//  - circleAriaLabel menyebut nomor urut, judul, dan keadaannya.
//  - Wiring beranda murid: daftar tampil SATU kartu (pager) dalam
//    urutan server TANPA penyaringan tenggat / pengurutan ulang di
//    klien dan TANPA daftar riwayat terpisah; lingkaran 1..N dari
//    lib ini; kartu terkunci adalah varian tanpa tautan dengan
//    penjelasan "Selesaikan dulu: <penghambat>"; materi terkunci
//    digambar sebagai kartu bertanda kunci, bukan tautan.
import { readFileSync } from "node:fs";
import { circleAriaLabel, initialPagerIndex, planCircle } from "./navigasi-tugas.ts";

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

const open = { completed: false, locked: false };
const doneState = { completed: true, locked: false };
const lockedState = { completed: false, locked: true };

console.log("Kasus A: pilihan awal pager");
check("daftar kosong → -1", initialPagerIndex([]) === -1);
check("semua belum selesai → indeks 0", initialPagerIndex([open, open]) === 0);
check("yang pertama belum selesai yang dibuka (selesai di depan dilewati)", initialPagerIndex([doneState, doneState, open]) === 2);
check("semua selesai → indeks 0", initialPagerIndex([doneState, doneState]) === 0);
// Invarian data server: penugasan terkunci selalu didahului
// penghambatnya yang juga belum selesai, jadi yang terawal belum
// selesai tidak pernah yang terkunci — pilihan awal selalu tugas yang
// bisa dikerjakan (penghambat itu sendiri).
check("penghambat (belum selesai, tak terkunci) menjadi pilihan awal, bukan yang terkunci sesudahnya", initialPagerIndex([doneState, open, lockedState]) === 1);

console.log("Kasus B: rencana lingkaran");
{
  const done = planCircle(doneState, false);
  check("selesai → centang + nada done", done.glyph === "check" && done.tone === "done" && done.current === false);
  const locked = planCircle(lockedState, false);
  check("terkunci → gembok + nada locked", locked.glyph === "lock" && locked.tone === "locked");
  const current = planCircle(open, true);
  check("biasa + sedang dibuka → nomor + nada current", current.glyph === "number" && current.tone === "current" && current.current === true);
  const plain = planCircle(open, false);
  check("biasa → nomor + nada plain", plain.glyph === "number" && plain.tone === "plain" && plain.current === false);
  const doneCurrent = planCircle(doneState, true);
  check("selesai yang sedang dibuka tetap centang/done, current tercatat", doneCurrent.glyph === "check" && doneCurrent.tone === "done" && doneCurrent.current === true);
  const lockedCurrent = planCircle(lockedState, true);
  check("terkunci yang sedang dibuka tetap gembok/locked, current tercatat", lockedCurrent.glyph === "lock" && lockedCurrent.tone === "locked" && lockedCurrent.current === true);
  check(
    "label aksesibel menyebut urutan + judul + keadaan",
    circleAriaLabel(2, "Tugas ATP 1.2", lockedState) === "Tugas 2: Tugas ATP 1.2 (terkunci)" &&
      circleAriaLabel(1, "Tugas ATP 1.1", doneState) === "Tugas 1: Tugas ATP 1.1 (sudah selesai)" &&
      circleAriaLabel(3, "Tugas Bebas", open) === "Tugas 3: Tugas Bebas (belum selesai)",
  );
}

console.log("Kasus C: wiring beranda murid");
{
  const page = readFileSync(new URL("../app/murid/page.tsx", import.meta.url), "utf8");
  check("halaman memakai perencana navigasi-tugas", page.includes('from "../../lib/navigasi-tugas"') && page.includes("initialPagerIndex(pagerAssignments)") && page.includes("planCircle(assignment, index === currentPagerIndex)"));
  check("daftar pager = data server apa adanya (tanpa saring/urut ulang klien)", page.includes("const pagerAssignments = data.assignments;") && !page.includes("pastAssignments") && !page.includes("activeAssignments"));
  check("satu kartu per halaman + nav lingkaran", page.includes('className="assignment-pager"') && page.includes("assignment-pager-dot") && page.includes("setPagerIndex(index)"));
  check(
    "kartu terkunci varian khusus tanpa tautan, menyebut penghambat",
    page.includes("function LockedAssignmentCard(") && page.includes("currentAssignment.locked ? (") && page.includes("Selesaikan dulu:") && page.includes("assignment.locked_by_title"),
  );
  check(
    "materi terkunci digambar sebagai kartu bertanda kunci, bukan tautan",
    // Sejak daftar materi terpandu (v1.0.65) kartu digambar oleh
    // GuidedModuleCard dari field terpandu (lockedByTitle); maksud
    // kuncinya sama: varian terkunci bukan tautan + menyebut
    // penghambatnya.
    page.includes("module.locked ? (") && page.includes("assignment-card--locked") && page.includes("module.lockedByTitle"),
  );
  check("tipe payload membawa field rencana server", ["position: number | null", "atp_label: string | null", "chain_key: string | null", "completed: boolean", "locked: boolean", "locked_by_title: string | null"].every((needle) => page.includes(needle)));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
