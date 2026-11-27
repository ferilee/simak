// Tests for "Edit Kelas" Langkah 3 (daftar kelas ringkas berkelompok
// jenjang + modal edit). Run with bun from apps/web:
//   bun lib/kelompok-kelas.test.mjs
//
// The grouping helper (lib/kelompok-kelas.ts) is tested behaviorally;
// the guru page wiring (all-classes load with active-only derivations
// for legacy consumers, grouped rows, hidden join-code chip, archived
// section, edit modal calls) is locked statically against the page
// source and globals.css.
import { readFileSync } from "node:fs";
import { classLevelKey, groupClassesByLevel } from "./kelompok-kelas.ts";

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

// ---------------------------------------------------------------------------
console.log("Case 1: kunci jenjang dari token pertama nama kelas");
{
  check("XI TKJ B → XI", classLevelKey("XI TKJ B") === "XI");
  check("X TKR A → X", classLevelKey("X TKR A") === "X");
  check("XII RPL → XII", classLevelKey("XII RPL") === "XII");
  check("huruf kecil diterima", classLevelKey("xi tkj a") === "XI");
  check("XIII bukan jenjang", classLevelKey("XIII Umum") === "LAINNYA");
  check("nama tanpa jenjang → LAINNYA", classLevelKey("Kelompok Belajar") === "LAINNYA");
  check("nama kosong → LAINNYA", classLevelKey("") === "LAINNYA");
}

// ---------------------------------------------------------------------------
console.log("Case 2: pengelompokan — urutan jenjang, urut nama, kelompok kosong hilang");
{
  const input = [
    { name: "XI TKJ B" },
    { name: "X TKR A" },
    { name: "XI DPIB" },
    { name: "Kelas Cadangan" },
    { name: "XII RPL" },
    { name: "X BD A" },
  ];
  const groups = groupClassesByLevel(input);
  check("urutan kelompok X, XI, XII, Lainnya", groups.map((g) => g.key).join(",") === "X,XI,XII,LAINNYA");
  check("label kelompok", groups.map((g) => g.label).join("|") === "Kelas X|Kelas XI|Kelas XII|Lainnya");
  check("di dalam kelompok urut nama menaik", groups[1].classes.map((c) => c.name).join("|") === "XI DPIB|XI TKJ B");
  check("input kosong → tanpa kelompok", groupClassesByLevel([]).length === 0);
  check("tanpa kelas XII → kelompok XII tidak dibuat", groupClassesByLevel([{ name: "X A" }]).map((g) => g.key).join(",") === "X");
}

// ---------------------------------------------------------------------------
console.log("Case 3: pemuatan semua kelas + turunan aktif untuk pemakai lama");
{
  const page = read("../app/guru/page.tsx");
  check("muat semua kelas tanpa saringan arsip", page.includes("setClasses(classResponse.data);"));
  check("saringan lama saat muat hilang", !page.includes("setClasses(classResponse.data.filter((kelas) => !kelas.is_archived))"));
  check("turunan activeClasses didefinisikan", page.includes("const activeClasses = classes.filter((kelas) => !kelas.is_archived);"));
  check("turunan archivedClasses didefinisikan", page.includes("const archivedClasses = classes.filter((kelas) => kelas.is_archived);"));
  check("tanda selesai langkah Kelas dari kelas aktif", page.includes("activeClasses.length > 0,"));
  check("kotak centang tujuan penugasan hanya kelas aktif", page.includes("{activeClasses.map((kelas) => <label key={kelas.id} style={styles.checkbox}>"));
  check("saringan kelas daftar penugasan hanya kelas aktif", page.includes("{activeClasses.map((kelas) => <option key={kelas.id}"));
  check("pemilih LKPD penilaian menerima kelas aktif", page.includes("worksheetIdsForClassFilter(gradingClassFilterActive, assignments, allAttempts, activeClasses)"));
  check("bawaan pilihan kelas penugasan tetap dari kelas aktif", page.includes("classResponse.data.filter((kelas) => !kelas.is_archived).map((kelas) => kelas.id)"));
}

// ---------------------------------------------------------------------------
console.log("Case 4: daftar ringkas berkelompok + chip kode tersembunyi + seksi Diarsipkan");
{
  const page = read("../app/guru/page.tsx");
  check("daftar aktif dirender berkelompok jenjang", page.includes("groupClassesByLevel(activeClasses).map((group)"));
  check("kepala seksi menghitung kelas aktif", page.includes("{activeClasses.length} kelas aktif"));
  check("chip kode tersembunyi bawaan", page.includes('codeVisible ? kelas.join_code : "••••••••"'));
  check("tombol tampilkan/sembunyikan kode", page.includes("setVisibleCodeClassId(codeVisible ? null : kelas.id)"));
  check("salin kode memakai papan klip", page.includes("navigator.clipboard.writeText(kelas.join_code)"));
  check("seksi Diarsipkan terlipat", page.includes("Diarsipkan ({archivedClasses.length})") && page.includes("archivedClassesOpen"));
  check("baris lama bertumpuk khusus kelas hilang", !page.includes("<span>Kode gabung: <strong>{kelas.join_code}</strong></span>"));
  check("formulir buat kelas tetap onSubmit createClass", page.includes("<form onSubmit={createClass} style={styles.form}>"));
}

// ---------------------------------------------------------------------------
console.log("Case 5: modal Edit Kelas terhubung ke API baru");
{
  const page = read("../app/guru/page.tsx");
  check("modal Edit kelas memakai komponen Modal bersama", page.includes('title="Edit kelas"'));
  check("simpan label lewat PATCH kelas", page.includes("method: \"PATCH\"") && page.includes("body: JSON.stringify({ name: editClassName, subject: editClassSubject, academicYear: editClassAcademicYear })"));
  check("buat kode baru memanggil endpoint regenerate", page.includes("/regenerate-code`, { method: \"POST\" }"));
  check("buat kode baru didahului konfirmasi peringatan", page.includes("Kode lama langsung tidak berlaku"));
  check("arsip/aktifkan lewat PATCH is_archived eksplisit", page.includes("body: JSON.stringify({ is_archived: !target.is_archived })"));
  check("balikan server mengganti baris lokal", page.includes("replaceClassRow(response.data)"));
  check("penjaga tutup modal kotor dipakai", page.includes("requestEditModalClose(classMetaDirty, cancelEditClass)"));
}

// ---------------------------------------------------------------------------
console.log("Case 6: CSS baris kelas + bebas lookbehind");
{
  const css = read("../app/globals.css");
  check("kelas CSS kelas-row terdaftar", css.includes(".kelas-row {") && css.includes(".kelas-row-dot") && css.includes(".kelas-row-code"));
  const blokBaru = css.slice(css.indexOf("/* Baris kelas ramping"), css.indexOf("/* Bagian kode gabung"));
  check("blok CSS kelas-row tanpa :has()", blokBaru.length > 0 && !blokBaru.includes(":has("));
  const page = read("../app/guru/page.tsx");
  const lib = read("./kelompok-kelas.ts");
  check("halaman guru bebas lookbehind", !page.includes("(?<"));
  check("lib kelompok-kelas bebas lookbehind", !lib.includes("(?<"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
