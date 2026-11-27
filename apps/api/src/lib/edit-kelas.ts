// Aturan murni PATCH kelas (fitur Edit Kelas): menerjemahkan badan JSON
// mentah menjadi rencana pembaruan yang aman, tanpa menyentuh basis data
// — rute tinggal menjalankan rencananya. Dipisah ke lib agar bisa diuji
// perilaku (konvensi repo: tanpa basis data uji).
//
// Semantik yang dijaga:
// - Badan kosong / tanpa bidang yang dikenal sama sekali ({}) → rencana
//   "alihkan arsip" (toggle), persis perilaku lama endpoint ini yang
//   mengabaikan badan dan membalik is_archived. Klien lama yang memanggil
//   PATCH tanpa badan tidak berubah perilakunya.
// - is_archived boolean eksplisit → tetapkan nilai itu (bukan toggle).
// - name / subject / academic_year (alias academicYear diterima, mengikuti
//   nama bidang pada skema buat kelas) → divalidasi: harus string,
//   di-trim, tidak boleh kosong; name ≤ 100, subject ≤ 100 (samakan
//   createClassSchema + lebar kolom), academic_year ≤ 20.
// - Bidang tak dikenal diabaikan HANYA bila setidaknya satu bidang dikenal
//   ikut terkirim; objek yang seluruh kuncinya tak dikenal ditolak agar
//   kesalahan ketik klien tidak diam-diam memicu toggle arsip.

export type ClassPatchUpdates = {
  name?: string;
  subject?: string;
  academicYear?: string;
};

export type ClassPatchPlan =
  | { ok: true; updates: ClassPatchUpdates; isArchived?: boolean; toggleArchived: boolean }
  | { ok: false; message: string };

function fail(message: string): ClassPatchPlan {
  return { ok: false, message };
}

function readTextField(
  body: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
): { value: string } | { error: string } | null {
  if (!(key in body)) return null;
  const raw = body[key];
  if (typeof raw !== "string") return { error: `${label} tidak valid.` };
  const value = raw.trim();
  if (value === "") return { error: `${label} tidak boleh kosong.` };
  if (value.length > maxLength) return { error: `${label} maksimal ${maxLength} karakter.` };
  return { value };
}

export function planClassPatch(body: unknown): ClassPatchPlan {
  if (body === null || body === undefined) {
    return { ok: true, updates: {}, toggleArchived: true };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return fail("Format data tidak valid.");
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return { ok: true, updates: {}, toggleArchived: true };
  }

  const updates: ClassPatchUpdates = {};
  let recognized = false;

  const name = readTextField(record, "name", "Nama kelas", 100);
  if (name !== null) {
    recognized = true;
    if ("error" in name) return fail(name.error);
    updates.name = name.value;
  }

  const subject = readTextField(record, "subject", "Mata pelajaran", 100);
  if (subject !== null) {
    recognized = true;
    if ("error" in subject) return fail(subject.error);
    updates.subject = subject.value;
  }

  const yearKey = "academic_year" in record ? "academic_year" : "academicYear" in record ? "academicYear" : null;
  if (yearKey !== null) {
    const year = readTextField(record, yearKey, "Tahun ajaran", 20);
    if (year !== null) {
      recognized = true;
      if ("error" in year) return fail(year.error);
      updates.academicYear = year.value;
    }
  }

  let isArchived: boolean | undefined;
  if ("is_archived" in record) {
    recognized = true;
    if (typeof record.is_archived !== "boolean") return fail("Status arsip tidak valid.");
    isArchived = record.is_archived;
  } else if ("isArchived" in record) {
    recognized = true;
    if (typeof record.isArchived !== "boolean") return fail("Status arsip tidak valid.");
    isArchived = record.isArchived;
  }

  if (!recognized) return fail("Tidak ada perubahan yang dikenali.");

  return { ok: true, updates, isArchived, toggleArchived: false };
}
