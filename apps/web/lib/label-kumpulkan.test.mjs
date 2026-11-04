// Tests for "Label Kumpulkan" (v1.0.39): the submit button label states
// how many counted questions are still unanswered, and the gate modal
// chips name the missing question's TYPE — so a blocked group can see
// what is missing instead of thinking the button is dead.
// Run with bun from apps/web:  bun lib/label-kumpulkan.test.mjs
import { readFileSync } from "node:fs";
import { ITEM_TYPE_LABELS, itemTypeLabel, submitButtonLabel } from "./label-kumpulkan.ts";

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

const page = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");

console.log("Case 1: submitButtonLabel — sisa soal pada label tombol");
{
  check("semua terjawab → label polos (kelompok)", submitButtonLabel("Kumpulkan atas nama kelompok", 10, 10) === "Kumpulkan atas nama kelompok");
  check("semua terjawab → label polos (individu)", submitButtonLabel("Kumpulkan", 4, 4) === "Kumpulkan");
  check("semua terjawab → label polos (baris bawah)", submitButtonLabel("Kumpulkan LKPD", 7, 7) === "Kumpulkan LKPD");
  check("tanpa soal terhitung → label polos", submitButtonLabel("Kumpulkan", 0, 0) === "Kumpulkan");
  check(
    "satu sisa → '· 1 soal belum terjawab'",
    submitButtonLabel("Kumpulkan atas nama kelompok", 9, 10) === "Kumpulkan atas nama kelompok · 1 soal belum terjawab",
    submitButtonLabel("Kumpulkan atas nama kelompok", 9, 10),
  );
  check(
    "banyak sisa → jumlah tepat",
    submitButtonLabel("Kumpulkan", 2, 5) === "Kumpulkan · 3 soal belum terjawab",
    submitButtonLabel("Kumpulkan", 2, 5),
  );
  check(
    "basis 'Kumpulkan LKPD' ikut berbagi helper yang sama",
    submitButtonLabel("Kumpulkan LKPD", 0, 2) === "Kumpulkan LKPD · 2 soal belum terjawab",
  );
  check("answered melebihi total → dianggap lengkap (label polos)", submitButtonLabel("Kumpulkan", 6, 5) === "Kumpulkan");
}

console.log("Case 2: itemTypeLabel — peta jenis butir (sama dengan sisi API)");
{
  check("pilihan_ganda", itemTypeLabel("pilihan_ganda") === "Pilihan ganda");
  check("isian_singkat", itemTypeLabel("isian_singkat") === "Isian singkat");
  check("uraian", itemTypeLabel("uraian") === "Uraian");
  check("unggah_foto", itemTypeLabel("unggah_foto") === "Unggah foto");
  check("langkah_berurutan", itemTypeLabel("langkah_berurutan") === "Langkah berurutan");
  check("refleksi", itemTypeLabel("refleksi") === "Refleksi");
  check("tautan_ruas → 'Kuis RUAS' (chip kepala kartu murid)", ITEM_TYPE_LABELS.tautan_ruas === "Kuis RUAS");
  check("jenis tak dikenal → 'Soal'", itemTypeLabel("jenis_aneh") === "Soal");
}

console.log("Case 3: pengawatan halaman — ketiga penempatan tombol memakai helper yang sama");
{
  check("halaman mengimpor helper dari lib/label-kumpulkan", page.includes('import { ITEM_TYPE_LABELS, itemTypeLabel, submitButtonLabel } from "../../../../lib/label-kumpulkan";'));
  check("label dihitung sekali dari hitungan answerProgress", page.includes("const submitLabel = (base: string) => submitButtonLabel(base, answeredCount, totalCount);"));
  const placements = page.match(/\{submitLabel\(groupInfo \? "Kumpulkan atas nama kelompok" : "Kumpulkan"\)\}/g) ?? [];
  check("bilah kemajuan + kaki tinjauan berbagi label kelompok/individu", placements.length === 2, String(placements.length));
  check("baris aksi bawah memakai basis 'Kumpulkan LKPD'", page.includes('{submitLabel(groupInfo ? "Kumpulkan atas nama kelompok" : "Kumpulkan LKPD")}'));
  check("tidak ada lagi label kumpulkan polos yang dirender langsung", !page.includes('>{groupInfo ? "Kumpulkan atas nama kelompok" : "Kumpulkan"}</button>') && !page.includes('>{groupInfo ? "Kumpulkan atas nama kelompok" : "Kumpulkan LKPD"}</button>'));
}

console.log("Case 4: semantik disabled tombol TIDAK berubah (gerbang tetap terjangkau klik)");
{
  check(
    "bilah kemajuan + kaki tinjauan: disabled hanya saving",
    (page.match(/disabled=\{saving\} onClick=\{\(\) => void submitWorksheet\(\)\}/g) ?? []).length === 2,
  );
  check(
    "baris aksi bawah: disabled saving || status",
    page.includes('disabled={saving || status !== "draf"} onClick={() => void submitWorksheet()}'),
  );
  check(
    "tidak ada penonaktifan berbasis kelengkapan",
    !page.includes("disabled={saving || answeredCount") && !page.includes("disabled={answeredCount") && !page.includes("totalCount > answeredCount}"),
  );
}

console.log("Case 5: responsif — baris tombol membungkus, tidak meluber di layar ±360px");
{
  check(
    "progressActions membungkus (label panjang turun baris, bukan meluber)",
    page.includes('progressActions: { display: "flex", gap: 8, flexWrap: "wrap" as const, justifyContent: "flex-end" }'),
  );
  check(
    "navBar membungkus",
    page.includes('flexWrap: "wrap" as const, background: "#f8f9fc", border: "1px solid #eaecf0", borderRadius: 10, padding: "10px 12px", marginTop: 16 }'),
  );
  check(
    "baris aksi bawah membungkus",
    page.includes('actions: { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" as const, marginTop: 24 }'),
  );
  check(
    "bilah kemajuan induk memang sudah membungkus sejak sebelumnya",
    page.includes('progressBar: { position: "sticky" as const, top: 0, zIndex: 10, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const'),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
