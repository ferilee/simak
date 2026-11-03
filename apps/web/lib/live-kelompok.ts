// Penggabungan jawaban live kelompok (versi ringan — polling) untuk halaman
// LKPD murid: jawaban tersimpan teman satu kelompok tiba lewat polling dan
// harus menyatu ke keadaan lokal TANPA menimpa ketikan murid yang sedang
// membuka soal itu. Fungsi murni — diuji di live-kelompok.test.mjs.
//
// Aturannya per butir, membandingkan versi server (remote) dengan snapshot
// terakhir yang diketahui murid ini (saved) dan keadaan lokalnya (local):
// - remote == saved → tidak ada yang baru; lewati.
// - butir TIDAK sedang ditampilkan → terapkan remote diam-diam.
// - butir sedang ditampilkan dan lokalnya bersih (== saved) → terapkan,
//   laporkan sebagai updatedDisplayed agar halaman bisa menyorot kotak
//   jawaban + catatan "Diperbarui oleh …".
// - butir sedang ditampilkan dan lokalnya kotor (!= saved) → JANGAN timpa;
//   laporkan sebagai conflict agar halaman menampilkan catatan konflik.
// - butir unggah_foto dengan pilihan lokal yang belum tersimpan (kunci
//   lampiran lokal != saved) → jangan pernah ditimpa, di posisi mana pun;
//   bila sedang ditampilkan, laporkan sebagai conflict juga.
//
// Hasil nextSaved adalah snapshot acuan baru: entri butir yang diterapkan
// mengikuti remote, sisanya tetap snapshot lama — supaya pemeriksaan
// "kotor" sesudah penggabungan tetap membandingkan dengan versi server
// yang sebenarnya, bukan dengan ketikan lokal.

export type LiveAnswer = {
  item_id: number;
  answer_text: string | null;
  attachment_key: string | null;
  last_edited_by: number | null;
  last_edited_by_name: string | null;
  updated_at: string | null;
};

/** Satu entri payload jawaban — bentuk yang sama dengan buildAnswersPayload halaman. */
export type LivePayloadEntry = {
  itemId: number;
  answerText: string;
  attachmentKey?: string;
};

export type LiveMergePatch = {
  itemId: number;
  answerText: string;
  /** null = kosongkan kunci lampiran lokal (ikuti server). */
  attachmentKey: string | null;
};

export type LiveMergeNotice = {
  itemId: number;
  editorName: string | null;
  remoteUpdatedAt: string | null;
};

export type LiveMergeInput = {
  remote: LiveAnswer[];
  local: LivePayloadEntry[];
  saved: LivePayloadEntry[];
  /** Butir yang sedang tampil di pemutar soal; null di layar tinjauan. */
  displayedItemId: number | null;
  photoItemIds: ReadonlySet<number>;
};

export type LiveMergeResult = {
  patches: LiveMergePatch[];
  nextSaved: LivePayloadEntry[];
  updatedDisplayed: LiveMergeNotice | null;
  conflict: LiveMergeNotice | null;
};

function entryKey(entry: LivePayloadEntry | undefined): string | null {
  return entry?.attachmentKey ?? null;
}

function toSavedEntry(itemId: number, answerText: string, attachmentKey: string | null): LivePayloadEntry {
  return attachmentKey ? { itemId, answerText, attachmentKey } : { itemId, answerText };
}

export function mergeLiveAnswers(input: LiveMergeInput): LiveMergeResult {
  const localById = new Map(input.local.map((entry) => [entry.itemId, entry]));
  const savedById = new Map(input.saved.map((entry) => [entry.itemId, entry]));
  const nextSavedById = new Map(savedById);
  const patches: LiveMergePatch[] = [];
  let updatedDisplayed: LiveMergeNotice | null = null;
  let conflict: LiveMergeNotice | null = null;

  for (const remoteAnswer of input.remote) {
    const itemId = remoteAnswer.item_id;
    const remoteText = remoteAnswer.answer_text ?? "";
    const remoteKey = remoteAnswer.attachment_key ?? null;
    const savedEntry = savedById.get(itemId);
    const savedText = savedEntry?.answerText ?? "";
    const savedKey = entryKey(savedEntry);
    if (remoteText === savedText && remoteKey === savedKey) continue;

    const localEntry = localById.get(itemId);
    const localText = localEntry?.answerText ?? "";
    const localKey = entryKey(localEntry);
    const isDisplayed = input.displayedItemId !== null && itemId === input.displayedItemId;

    // Pilihan foto lokal yang belum tersimpan tidak pernah dikorbankan —
    // server belum tahu kunci ini, jadi versi remote mana pun terlihat
    // "berbeda" padahal yang benar adalah menunggu murid menyimpan drafnya.
    if (input.photoItemIds.has(itemId) && localKey !== savedKey) {
      if (isDisplayed) {
        conflict = { itemId, editorName: remoteAnswer.last_edited_by_name, remoteUpdatedAt: remoteAnswer.updated_at };
      }
      continue;
    }

    const localDirty = localText !== savedText || localKey !== savedKey;
    if (isDisplayed && localDirty) {
      conflict = { itemId, editorName: remoteAnswer.last_edited_by_name, remoteUpdatedAt: remoteAnswer.updated_at };
      continue;
    }

    patches.push({ itemId, answerText: remoteText, attachmentKey: remoteKey });
    nextSavedById.set(itemId, toSavedEntry(itemId, remoteText, remoteKey));
    if (isDisplayed) {
      updatedDisplayed = { itemId, editorName: remoteAnswer.last_edited_by_name, remoteUpdatedAt: remoteAnswer.updated_at };
    }
  }

  // Susun ulang snapshot mengikuti urutan payload lokal (= urutan butir
  // LKPD) agar perbandingan string snapshot halaman tetap konsisten.
  const nextSaved = input.local.map((entry) => nextSavedById.get(entry.itemId) ?? entry);
  return { patches, nextSaved, updatedDisplayed, conflict };
}
