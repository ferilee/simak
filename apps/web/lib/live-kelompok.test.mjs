// Tests for Live Kelompok (versi ringan — polling) on the murid worksheet
// page: the pure merge of polled group answers into local state, plus the
// static wiring of heartbeat/polling/presence UI in the page source.
// Run with bun from apps/web:  bun lib/live-kelompok.test.mjs
import { readFileSync } from "node:fs";
import { mergeLiveAnswers } from "./live-kelompok.ts";

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

// Butir 1 & 2 teks, butir 3 unggah foto. Payload mengikuti urutan butir,
// seperti buildAnswersPayload halaman.
function baseState() {
  return {
    saved: [
      { itemId: 1, answerText: "jawaban satu" },
      { itemId: 2, answerText: "" },
      { itemId: 3, answerText: "", attachmentKey: "foto-lama.jpg" },
    ],
    photoItemIds: new Set([3]),
  };
}

function remoteAnswer(itemId, text, extra = {}) {
  return {
    item_id: itemId,
    answer_text: text,
    attachment_key: null,
    last_edited_by: 7,
    last_edited_by_name: "Budi",
    updated_at: "2026-11-03T03:00:00.000Z",
    ...extra,
  };
}

console.log("Case 1: remote sama dengan saved → tidak ada perubahan");
{
  const { saved, photoItemIds } = baseState();
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(1, "jawaban satu"), remoteAnswer(3, "", { attachment_key: "foto-lama.jpg" })],
    local: saved,
    saved,
    displayedItemId: 1,
    photoItemIds,
  });
  check("tanpa patch", result.patches.length === 0);
  check("tanpa sorotan/konflik", result.updatedDisplayed === null && result.conflict === null);
  check("nextSaved identik isinya", JSON.stringify(result.nextSaved) === JSON.stringify(saved));
}

console.log("Case 2: butir tak ditampilkan berubah → terapkan diam-diam");
{
  const { saved, photoItemIds } = baseState();
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(2, "jawaban dua dari Budi")],
    local: saved,
    saved,
    displayedItemId: 1,
    photoItemIds,
  });
  check("satu patch untuk butir 2", result.patches.length === 1 && result.patches[0].itemId === 2);
  check("patch membawa teks remote", result.patches[0]?.answerText === "jawaban dua dari Budi");
  check("bukan sorotan (bukan butir tampil)", result.updatedDisplayed === null);
  check("tanpa konflik", result.conflict === null);
  check(
    "nextSaved butir 2 mengikuti remote, butir lain tetap",
    result.nextSaved.find((e) => e.itemId === 2)?.answerText === "jawaban dua dari Budi"
      && result.nextSaved.find((e) => e.itemId === 1)?.answerText === "jawaban satu",
  );
  check("urutan nextSaved mengikuti urutan payload", JSON.stringify(result.nextSaved.map((e) => e.itemId)) === "[1,2,3]");
}

console.log("Case 3: butir tampil + bersih → terapkan + sorotan 'Diperbarui oleh'");
{
  const { saved, photoItemIds } = baseState();
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(1, "jawaban satu versi Budi")],
    local: saved,
    saved,
    displayedItemId: 1,
    photoItemIds,
  });
  check("patch diterapkan", result.patches.length === 1 && result.patches[0].answerText === "jawaban satu versi Budi");
  check(
    "updatedDisplayed menunjuk butir 1 dengan nama pengedit",
    result.updatedDisplayed?.itemId === 1 && result.updatedDisplayed?.editorName === "Budi",
  );
  check("tanpa konflik", result.conflict === null);
}

console.log("Case 4: butir tampil + kotor → jangan timpa, tandai konflik");
{
  const { saved, photoItemIds } = baseState();
  const local = [
    { itemId: 1, answerText: "ketikan saya yang belum tersimpan" },
    { itemId: 2, answerText: "" },
    { itemId: 3, answerText: "", attachmentKey: "foto-lama.jpg" },
  ];
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(1, "jawaban satu versi Budi"), remoteAnswer(2, "jawaban dua dari Budi")],
    local,
    saved,
    displayedItemId: 1,
    photoItemIds,
  });
  check("butir 1 tidak di-patch", !result.patches.some((p) => p.itemId === 1));
  check(
    "konflik tercatat untuk butir 1 dengan nama pengedit",
    result.conflict?.itemId === 1 && result.conflict?.editorName === "Budi",
  );
  check("butir lain tetap diterapkan diam-diam", result.patches.some((p) => p.itemId === 2));
  check(
    "nextSaved butir 1 tetap versi simpanan sendiri (acuan kotor tidak bergeser)",
    result.nextSaved.find((e) => e.itemId === 1)?.answerText === "jawaban satu",
  );
}

console.log("Case 5: foto — pilihan lokal belum tersimpan tidak pernah ditimpa");
{
  const { saved, photoItemIds } = baseState();
  const local = [
    { itemId: 1, answerText: "jawaban satu" },
    { itemId: 2, answerText: "" },
    { itemId: 3, answerText: "", attachmentKey: "foto-baru-saya.jpg" },
  ];
  const notDisplayed = mergeLiveAnswers({
    remote: [remoteAnswer(3, "", { attachment_key: "foto-teman.jpg" })],
    local,
    saved,
    displayedItemId: 1,
    photoItemIds,
  });
  check("tak ditampilkan: tanpa patch untuk foto", notDisplayed.patches.length === 0);
  check("tak ditampilkan: tanpa konflik", notDisplayed.conflict === null);
  check(
    "nextSaved foto tetap kunci tersimpan (pilihan lokal utuh)",
    notDisplayed.nextSaved.find((e) => e.itemId === 3)?.attachmentKey === "foto-lama.jpg",
  );
  const displayed = mergeLiveAnswers({
    remote: [remoteAnswer(3, "", { attachment_key: "foto-teman.jpg" })],
    local,
    saved,
    displayedItemId: 3,
    photoItemIds,
  });
  check("ditampilkan: tetap tanpa patch", displayed.patches.length === 0);
  check("ditampilkan: konflik tercatat", displayed.conflict?.itemId === 3);
}

console.log("Case 6: foto — tanpa pilihan lokal menggantung, kunci remote diterapkan");
{
  const { saved, photoItemIds } = baseState();
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(3, "", { attachment_key: "foto-teman.jpg" })],
    local: saved,
    saved,
    displayedItemId: 1,
    photoItemIds,
  });
  check(
    "patch mengganti kunci lampiran ke versi teman",
    result.patches.length === 1 && result.patches[0].attachmentKey === "foto-teman.jpg",
  );
  check(
    "nextSaved foto mengikuti remote",
    result.nextSaved.find((e) => e.itemId === 3)?.attachmentKey === "foto-teman.jpg",
  );
}

console.log("Case 7: remote mengosongkan lampiran pada keadaan bersih → kunci lokal dibersihkan");
{
  const { saved, photoItemIds } = baseState();
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(3, "", { attachment_key: null })],
    local: saved,
    saved,
    displayedItemId: 3,
    photoItemIds,
  });
  check("patch membawa attachmentKey null (bersihkan)", result.patches.length === 1 && result.patches[0].attachmentKey === null);
  check("butir tampil bersih → sorotan, bukan konflik", result.updatedDisplayed?.itemId === 3 && result.conflict === null);
}

console.log("Case 8: layar tinjauan (displayedItemId null) — semua diterapkan diam-diam");
{
  const { saved, photoItemIds } = baseState();
  const result = mergeLiveAnswers({
    remote: [remoteAnswer(1, "satu baru"), remoteAnswer(2, "dua baru")],
    local: saved,
    saved,
    displayedItemId: null,
    photoItemIds,
  });
  check("dua patch", result.patches.length === 2);
  check("tanpa sorotan/konflik di tinjauan", result.updatedDisplayed === null && result.conflict === null);
}

console.log("Case 9: wiring halaman LKPD murid (statis)");
{
  const page = readFileSync(new URL("../app/murid/worksheets/[id]/page.tsx", import.meta.url), "utf8");
  check("halaman mengimpor mergeLiveAnswers", page.includes('import { mergeLiveAnswers, type LiveAnswer } from "../../../../lib/live-kelompok";'));
  check("heartbeat POST ke endpoint presence", page.includes("/presence`, {") && page.includes("currentItemId: displayedItemIdRef.current"));
  check("heartbeat berkala 3 detik", page.includes("}, 3000);"));
  check("polling GET live dengan assignmentId", page.includes("/live?assignmentId=${assignmentId}`"));
  check("polling berkala 4 detik", page.includes("}, 4000);"));
  check(
    "polling dan heartbeat berhenti saat tab tersembunyi",
    page.includes('document.visibilityState === "visible") void pollLiveRef.current()')
      && page.includes('if (document.visibilityState === "visible") sendHeartbeatRef.current();'),
  );
  check(
    "gerbang liveActive: hanya kelompok + masih draf",
    page.includes('const liveActive = Boolean(groupInfo) && Boolean(assignmentId) && status === "draf" && Boolean(data);'),
  );
  check("heartbeat terkirim saat fokus masuk ke kartu soal", page.includes("onFocus={() => { if (liveActive) sendHeartbeatRef.current(); }}"));
  check("garis 'Aktif sekarang' di kartu kelompok", page.includes("Aktif sekarang: {livePresence.map((entry) => entry.name).join(\", \")}"));
  check(
    "chip presensi pada butir yang sedang tampil",
    page.includes("sedang mengerjakan soal ini") && page.includes("entry.current_item_id === currentItem.id"),
  );
  check("catatan 'Diperbarui oleh' sesudah pembaruan bersih", page.includes("Diperbarui oleh {liveFlash.editorName ?? \"temanmu\"}"));
  check(
    "teks konflik persis seperti yang dirancang",
    page.includes("Jawaban soal ini baru diperbarui oleh {liveConflict.editorName ?? \"temanmu\"} — salin dulu jawabanmu bila perlu, lalu muat ulang halaman untuk melihat versi terbaru."),
  );
  check("konflik bisa ditutup (dismiss)", page.includes("function dismissLiveConflict()") && page.includes("liveConflictDismissedKeyRef"));
  check(
    "catatan kartu kelompok diganti dengan bunyi live",
    page.includes("Jawaban di halaman ini dikerjakan bersama — perubahan temanmu tampil otomatis dalam beberapa detik."),
  );
  check(
    "bunyi lama 'dimuat ulang' sudah tidak ada",
    !page.includes("perubahan anggota lain akan terlihat saat halaman dimuat ulang"),
  );
  check(
    "transisi terkumpul oleh teman memakai pesan khusus",
    page.includes('setMessage("LKPD ini sudah dikumpulkan atas nama kelompok.");'),
  );
  check(
    "keadaan akhir sesudah terkumpul diambil lewat applyLoadedAttempt yang sama",
    page.includes("if (!attempt.data.ungrouped) applyLoadedAttempt(data, attempt.data);"),
  );
  check("simpan sendiri menyelesaikan konflik", page.includes("setLiveConflict(null);"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
