// Tests for Tahap 1 of the guru edit modals: the assignment edit form
// and the module/LKPD metadata forms move from inline step panels into
// one shared Modal (components/Modal.tsx); create forms stay in place,
// content editors (blocks/items) stay in the full pane. Run with bun
// from apps/web:  bun lib/modal-edit-tahap-1.test.mjs
//
// What is locked here:
//  - closeDecision / sameIdList pure helpers (lib/modal.ts).
//  - Modal markup + behavior wiring (overlay, dialog aria, ✕, backdrop,
//    Escape, body scroll lock) and the layering order in globals.css
//    (modal 45 < confirm 50 < toast 100) + the ≤720px full-screen sheet.
//  - The page's guarded close: clean → the form's own Batal logic,
//    dirty → confirmDialog "Perubahan belum disimpan…" first, and a
//    re-entry guard so one Escape can't queue the confirm twice.
//  - Hosting: the three forms render inside Modal under their existing
//    state conditions; entry points, Batal/Simpan handlers, the details
//    create panel, and the snapshot restore all survive.
import { readFileSync } from "node:fs";
import { closeDecision, sameIdList } from "./modal.ts";

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
const page = read("../app/guru/page.tsx");
const modal = read("../components/Modal.tsx");
const css = read("../app/globals.css");

// Extract the body of the first rule/block starting at `marker`
// (brace-matched, so @media blocks come out whole).
function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

function zIndexOf(ruleBody) {
  const match = /z-index:\s*(\d+)/.exec(ruleBody ?? "");
  return match ? Number(match[1]) : null;
}

console.log("Case 1: closeDecision — tabel kebenaran penjaga tutup");
check("formulir bersih → close", closeDecision(false) === "close");
check("formulir kotor → confirm", closeDecision(true) === "confirm");

console.log("Case 2: sameIdList — perbandingan daftar id tanpa urutan");
check("urutan sama → sama", sameIdList([1, 2, 3], [1, 2, 3]) === true);
check("urutan berbeda → tetap sama", sameIdList([3, 1, 2], [1, 2, 3]) === true);
check("panjang berbeda → tidak sama", sameIdList([1, 2], [1, 2, 3]) === false);
check("anggota berbeda → tidak sama", sameIdList([1, 2, 4], [1, 2, 3]) === false);
check("dua daftar kosong → sama", sameIdList([], []) === true);

console.log("Case 3: komponen Modal — markup dan perilaku dasar");
check("overlay memakai kelas modal-overlay", modal.includes('className="modal-overlay"'));
check("klik latar memanggil onClose", modal.includes('className="modal-overlay" onClick={onClose}'));
check("panel memakai kelas modal-panel", modal.includes('className="modal-panel"'));
check("panel ber-role dialog", modal.includes('role="dialog"'));
check("panel aria-modal", modal.includes('aria-modal="true"'));
check("aria-label panel dari judul", modal.includes("aria-label={title}"));
check("klik di dalam panel tidak merambat ke latar", modal.includes("event.stopPropagation()"));
check("kepala modal ada", modal.includes('className="modal-header"'));
check("judul memakai kelas modal-title", modal.includes('className="modal-title"'));
check("tombol ✕ memakai kelas modal-close", modal.includes('className="modal-close"'));
check("tombol ✕ berlabel aksesibel", modal.includes('aria-label="Tutup dialog"'));
check("tombol ✕ memanggil onClose", modal.includes('className="modal-close" onClick={onClose}'));
check("badan modal memakai kelas modal-body", modal.includes('className="modal-body"'));
check("tidak terbuka → tidak dirender", modal.includes("if (!open) return null;"));
check("Esc dirutekan ke onClose", modal.includes('event.key === "Escape"') && modal.includes('addEventListener("keydown"'));
check("gulir badan dikunci selama terbuka", modal.includes('document.body.style.overflow = "hidden"'));
check("gulir badan dipulihkan saat ditutup", modal.includes("document.body.style.overflow = previousOverflow"));

console.log("Case 4: lapisan CSS — modal < konfirmasi < toast, lembar layar penuh di HP");
const modalOverlayRule = blockAfter(css, ".modal-overlay {");
const confirmOverlayRule = blockAfter(css, ".confirm-overlay {");
const toastRule = blockAfter(css, ".toast {");
const modalZ = zIndexOf(modalOverlayRule);
const confirmZ = zIndexOf(confirmOverlayRule);
const toastZ = zIndexOf(toastRule);
check("z-index modal-overlay = 45", modalZ === 45, `got ${modalZ}`);
check("z-index confirm-overlay = 50", confirmZ === 50, `got ${confirmZ}`);
check("z-index toast = 100", toastZ === 100, `got ${toastZ}`);
check("urutan lapisan modal < konfirmasi < toast", modalZ !== null && confirmZ !== null && toastZ !== null && modalZ < confirmZ && confirmZ < toastZ);
check("latar modal = keluarga konfirmasi rgba(16, 24, 40, 0.55)", modalOverlayRule !== null && modalOverlayRule.includes("background: rgba(16, 24, 40, 0.55)"));
const modalPanelRule = blockAfter(css, ".modal-panel {");
check("panel modal dibatasi 720px", modalPanelRule !== null && modalPanelRule.includes("width: min(720px, 94vw)"), modalPanelRule ?? "rule tidak ditemukan");
const modalBodyRule = blockAfter(css, ".modal-body {");
check("badan modal bisa digulir", modalBodyRule !== null && modalBodyRule.includes("overflow-y: auto"));
const sheetBlock = blockAfter(css, "@media (max-width: 720px)");
check("lembar layar penuh ≤720px: panel tanpa radius", sheetBlock !== null && sheetBlock.includes(".modal-panel") && sheetBlock.includes("border-radius: 0"));
check("lembar layar penuh ≤720px: panel setinggi layar", sheetBlock !== null && sheetBlock.includes("height: 100dvh"));

console.log("Case 5: penjaga tutup di halaman guru");
check("requestEditModalClose ada", page.includes("async function requestEditModalClose(dirty: boolean, onCancel: () => void)"));
check("penjaga memakai closeDecision", page.includes('closeDecision(dirty) === "close"'));
check("salinan konfirmasi buang perubahan persis", page.includes('confirmDialog("Perubahan belum disimpan. Tutup tanpa menyimpan?", { confirmLabel: "Tutup" })'));
check("penjaga anti-tumpuk aktif", page.includes("if (editCloseConfirmRef.current) return;") && page.includes("editCloseConfirmRef.current = true;") && page.includes("editCloseConfirmRef.current = false;"));
check("modal penugasan terhubung ke penjaga + Batal lama", page.includes("onClose={() => void requestEditModalClose(assignmentEditDirty, exitAssignmentEdit)}"));
check("modal metadata modul terhubung ke penjaga + Batal lama", page.includes("onClose={() => void requestEditModalClose(moduleMetaDirty, cancelEditModuleMeta)}"));
check("modal metadata LKPD terhubung ke penjaga + Batal lama", page.includes("onClose={() => void requestEditModalClose(worksheetMetaDirty, cancelEditWorksheetMeta)}"));

console.log("Case 6: tiga formulir tinggal di Modal; buat-baru tetap di tempat");
const assignmentModalAt = page.indexOf('title="Edit penugasan"');
const moduleModalAt = page.indexOf('title="Edit modul"');
const worksheetModalAt = page.indexOf('title="Edit LKPD"');
check("modal penugasan berjudul Edit penugasan", assignmentModalAt !== -1 && page.includes("open={editingAssignment !== null}"));
check("modal modul berjudul Edit modul", moduleModalAt !== -1 && page.includes("open={editingModuleMeta}"));
check("modal LKPD berjudul Edit LKPD", worksheetModalAt !== -1 && page.includes("open={editingWorksheetMeta}"));
check(
  "formulir penugasan dirender di panel lipat (buat) dan di modal (edit)",
  page.includes("{editingAssignment ? null : renderAssignmentForm()}") && page.slice(assignmentModalAt, assignmentModalAt + 400).includes("{renderAssignmentForm()}"),
);
check("elemen formulir penugasan tetap satu", page.split("<form onSubmit={editingAssignment ? saveAssignmentEdit : createAssignment}").length - 1 === 1);
check("ringkasan panel lipat tidak berubah", page.includes('<summary>{editingAssignment ? "Edit penugasan" : "+ Buat penugasan"}</summary>'));
check("formulir metadata modul kini sesudah penanda modalnya", moduleModalAt !== -1 && page.indexOf("<form onSubmit={saveModuleMeta}", moduleModalAt) !== -1 && page.indexOf("<form onSubmit={saveModuleMeta}") > moduleModalAt);
check("formulir metadata LKPD kini sesudah penanda modalnya", worksheetModalAt !== -1 && page.indexOf("<form onSubmit={saveWorksheetMeta}", worksheetModalAt) !== -1 && page.indexOf("<form onSubmit={saveWorksheetMeta}") > worksheetModalAt);
check("panel isi materi tidak lagi memuat formulir metadata sebaris", !page.includes("{editingModuleMeta ? (\n            <form onSubmit={saveModuleMeta}"));
check("panel soal LKPD tidak lagi memuat formulir metadata sebaris", !page.includes("{editingWorksheetMeta ? (\n            <form onSubmit={saveWorksheetMeta}"));
check("startEditAssignment tidak lagi membuka panel lipat", !page.includes("assignmentFormRef.current.open = true") && !page.includes("assignmentFormRef.current.scrollIntoView"));
check("titik masuk Edit modul tidak berpindah", page.includes('onClick={startEditModuleMeta}><span className="action-icon" aria-hidden="true">✎</span>Edit modul</button>'));
check("titik masuk Edit LKPD tidak berpindah", page.includes('onClick={startEditWorksheetMeta}><span className="action-icon" aria-hidden="true">✎</span>Edit LKPD</button>'));
check("titik masuk Edit penugasan tidak berpindah", page.includes("onClick={() => startEditAssignment(assignment)}"));
check("Batal formulir penugasan tetap exitAssignmentEdit", page.includes("onClick={exitAssignmentEdit}"));
check("Batal formulir metadata modul tetap cancelEditModuleMeta", page.includes("onClick={cancelEditModuleMeta}"));
check("Batal formulir metadata LKPD memakai cancelEditWorksheetMeta", page.includes("onClick={cancelEditWorksheetMeta}"));
check("Simpan metadata modul tetap saveModuleMeta", page.includes("<form onSubmit={saveModuleMeta}"));
check("Simpan metadata LKPD tetap saveWorksheetMeta", page.includes("<form onSubmit={saveWorksheetMeta}"));

console.log("Case 7: penanda kotor ketiga formulir");
check("garis dasar modul ditangkap saat edit dibuka", page.includes("moduleMetaBaseline.current = {"));
check("garis dasar LKPD ditangkap saat edit dibuka", page.includes("worksheetMetaBaseline.current = {"));
check("garis dasar penugasan ditangkap saat edit dibuka", page.includes("assignmentEditBaseline.current = {"));
check("kotor modul: berkas sampul baru ikut dihitung", page.includes("|| editCover !== null"));
check("kotor modul: kunci sampul dibandingkan ke garis dasar", page.includes("editCoverKey !== moduleMetaBase.coverKey"));
check("kotor penugasan: kelas dibandingkan sebagai himpunan", page.includes("!sameIdList(assignmentClassIds, assignmentBase.classIds)"));
check("kotor penugasan: murid sasaran dibandingkan sebagai himpunan", page.includes("!sameIdList(assignmentStudentIds, assignmentBase.studentIds)"));
check("garis dasar modul dibersihkan saat edit berakhir", page.includes("moduleMetaBaseline.current = null;"));
check("garis dasar LKPD dibersihkan saat edit berakhir", page.includes("worksheetMetaBaseline.current = null;"));
check("garis dasar penugasan dibersihkan saat keluar edit", page.includes("assignmentEditBaseline.current = null;"));
check("jepretan draf buat-baru tetap dipulihkan saat keluar edit", page.includes("assignmentEditSnapshot.current = null;") && page.includes("setAssignmentTitle(snapshot.title)"));

console.log(`\nmodal-edit-tahap-1 (web): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
