// Gerbang kelengkapan pengumpulan LKPD KELOMPOK: sebuah attempt kelompok
// hanya boleh dikumpulkan bila semua soal yang terhitung sudah terjawab.
// Definisi "terjawab" di sini MENYALIN PERSIS isItemAnswered() +
// answerProgress() + ordinalOf() pada halaman LKPD murid
// (apps/web/app/murid/worksheets/[id]/page.tsx), tetapi dinilai dari jawaban
// TERSIMPAN di basis data, bukan keadaan lokal halaman:
//
// - Butir tautan_ruas tidak terhitung: tidak ada jawaban murid di SIMAK
//   untuk butir itu (kuisnya dikerjakan di RUAS), jadi ia dikeluarkan dari
//   pembilang maupun penyebut.
// - pilihan_ganda / isian_singkat / uraian / refleksi: teks jawaban
//   tersimpan, sesudah trim, tidak kosong.
// - unggah_foto: kunci lampiran tersimpan ada (unggahan langsung terkirim
//   saat berkas dipilih, jadi kunci adalah satu-satunya tanda terjawab).
// - langkah_berurutan: murid dianggap menjawab bila ia MENYUSUN urutan —
//   di halaman, tandanya adalah himpunan touchedSequences. Dari sisi server
//   tanda yang setara adalah teks tersimpan yang tidak kosong DAN berbeda
//   dari urutan tampil bawaan (options.steps digabung "\n") — persis cara
//   halaman menurunkan touchedSequences dari draf tersimpan saat memuat.
//   Satu-satunya celah penyimpangan yang diketahui: murid menyusun lalu
//   mengembalikan urutannya persis ke urutan bawaan dalam satu sesi —
//   halaman menganggapnya terjawab, server membaca teks yang sama dengan
//   bawaan sehingga menganggapnya belum. Sesudah halaman dimuat ulang pun
//   halaman akan sependapat dengan server, jadi gerbang server tidak
//   pernah lebih longgar dari halaman.
// - Jenis lain: belum terjawab (sama seperti default isItemAnswered).
//
// Fungsi-fungsi ini murni agar bisa diuji tanpa basis data
// (lihat submit-gate.test.mjs).

export type SubmitGateItem = {
  id: number;
  itemType: string;
  optionsJson: Record<string, unknown> | null;
};

export type SubmitGateAnswer = {
  answerText: string | null;
  attachmentKey: string | null;
};

/**
 * Jaga jawaban kelompok — sisi simpan: apakah nilai yang dikirim murid
 * PERSIS sama dengan yang sudah tersimpan? Bila ya, baris itu dilewati
 * sepenuhnya oleh PUT /murid/worksheets/:id/answers (tidak ditulis ulang,
 * lastEditedBy tidak berpindah). null dan string kosong dianggap sama-sama
 * "kosong" untuk teks; kunci lampiran yang tidak dikirim (undefined)
 * dianggap null. Pengosongan yang disengaja (tersimpan berisi, terkirim
 * kosong) BUKAN nilai yang sama — ia perubahan sungguhan dan tetap
 * ditulis.
 */
export function isSameAnswerValue(
  stored: SubmitGateAnswer,
  incoming: { answerText?: string | null; attachmentKey?: string | null },
): boolean {
  return (stored.answerText ?? "") === (incoming.answerText ?? "")
    && (stored.attachmentKey ?? null) === (incoming.attachmentKey ?? null);
}

function sequenceSteps(item: SubmitGateItem): string[] {
  const raw = item.optionsJson?.steps;
  return Array.isArray(raw) ? raw.filter((step): step is string => typeof step === "string") : [];
}

export function isStoredAnswerAnswered(item: SubmitGateItem, answer: SubmitGateAnswer | undefined): boolean {
  const text = answer?.answerText ?? "";
  switch (item.itemType) {
    case "pilihan_ganda":
    case "isian_singkat":
    case "uraian":
    case "refleksi":
      return text.trim() !== "";
    case "unggah_foto":
      return Boolean(answer?.attachmentKey);
    case "langkah_berurutan": {
      const steps = sequenceSteps(item);
      return text !== "" && steps.length > 0 && text !== steps.join("\n");
    }
    default:
      return false;
  }
}

/**
 * Label bahasa Indonesia untuk jenis butir — cerminan peta yang sama pada
 * sisi web (apps/web/lib/label-kumpulkan.ts; kedua basis kode terpisah,
 * jadi petanya diduplikasi dan masing-masing dikunci oleh suite-nya).
 * Dipakai gerbang agar murid tahu JENIS soal yang masih kosong, bukan
 * hanya nomornya — pada insiden lapangan, butir unggah foto yang belum
 * terisi tidak dikenali murid hanya dari nomornya.
 */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda",
  isian_singkat: "Isian singkat",
  uraian: "Uraian",
  unggah_foto: "Unggah foto",
  langkah_berurutan: "Langkah berurutan",
  refleksi: "Refleksi",
};

export function itemTypeLabel(itemType: string): string {
  return ITEM_TYPE_LABELS[itemType] ?? "Soal";
}

export type UnansweredDetail = {
  /** Ordinal 1-based di antara butir terhitung (semua kecuali tautan_ruas). */
  ordinal: number;
  itemType: string;
};

/**
 * Butir terhitung yang belum terjawab, sebagai ordinal + jenis butir,
 * mengikuti urutan butir yang diberikan (pemanggil mengurutkan sama
 * seperti halaman: sortOrder naik). Semantik hitungnya identik dengan
 * unansweredOrdinals — yang berbeda hanya data yang dibawa pulang.
 */
export function unansweredDetails(items: SubmitGateItem[], answersByItemId: ReadonlyMap<number, SubmitGateAnswer>): UnansweredDetail[] {
  const missing: UnansweredDetail[] = [];
  let ordinal = 0;
  for (const item of items) {
    if (item.itemType === "tautan_ruas") continue;
    ordinal += 1;
    if (!isStoredAnswerAnswered(item, answersByItemId.get(item.id))) missing.push({ ordinal, itemType: item.itemType });
  }
  return missing;
}

/**
 * Ordinal (1-based, di antara butir terhitung — semua kecuali tautan_ruas)
 * dari butir-butir yang belum terjawab, mengikuti urutan butir yang
 * diberikan (pemanggil mengurutkan sama seperti halaman: sortOrder naik).
 */
export function unansweredOrdinals(items: SubmitGateItem[], answersByItemId: ReadonlyMap<number, SubmitGateAnswer>): number[] {
  return unansweredDetails(items, answersByItemId).map((entry) => entry.ordinal);
}

/**
 * Pesan penolakan gerbang (HTTP 400), menyebut jumlah, nomor, dan JENIS
 * tiap soal yang masih kosong:
 * "Masih ada 3 soal yang belum dijawab: Soal 2 (Isian singkat), Soal 4
 * (Unggah foto), Soal 6 (Refleksi). Lengkapi dulu sebelum mengumpulkan."
 */
export function buildUnansweredMessage(missing: UnansweredDetail[]): string {
  const parts = missing.map((entry) => `Soal ${entry.ordinal} (${itemTypeLabel(entry.itemType)})`);
  return `Masih ada ${missing.length} soal yang belum dijawab: ${parts.join(", ")}. Lengkapi dulu sebelum mengumpulkan.`;
}
