import { env } from "./env";

// Jembatan server-ke-server ke endpoint internal RUAS untuk menjawab satu
// pertanyaan: apakah murid ini sudah menyelesaikan (status attempt
// "completed") kuis RUAS pada topik yang ditautkan sebuah penugasan?
// Dipakai sebagai sinyal langkah "Kuis RUAS" di halaman rincian penugasan
// murid. Semua kegagalan bersifat lunak (false) — cek ini tidak boleh
// pernah menggagalkan pemuatan halaman penugasan.

export type RuasQuizTarget = {
  topicId: number;
  subjectId: number | null;
};

// Tautan kuis RUAS berbentuk ".../quiz/<id-topik>?subject_id=<id-mapel>"
// (halaman topiknya ".../topics/<id-topik>"). Id topik dibaca dari segmen
// path tersebut; tautan tanpa pola itu tidak terurai dan tidak dicek.
export function parseRuasQuizUrl(value: string | null | undefined): RuasQuizTarget | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  let topicId: number | null = null;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] !== "quiz" && segments[index] !== "topics") continue;
    const candidate = Number(segments[index + 1]);
    if (Number.isInteger(candidate) && candidate > 0) {
      topicId = candidate;
      break;
    }
  }
  if (topicId === null) return null;

  const subjectParam = url.searchParams.get("subject_id");
  const subjectCandidate = subjectParam !== null && /^\d+$/.test(subjectParam) ? Number(subjectParam) : null;

  return { topicId, subjectId: subjectCandidate !== null && subjectCandidate > 0 ? subjectCandidate : null };
}

export async function fetchRuasQuizCompleted(username: string, target: RuasQuizTarget): Promise<boolean> {
  if (!env.RUAS_STATUS_ENDPOINT || !env.RUAS_INTERNAL_SECRET) return false;

  try {
    const response = await fetch(env.RUAS_STATUS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-internal-secret": env.RUAS_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        username,
        topic_id: target.topicId,
        ...(target.subjectId !== null ? { subject_id: target.subjectId } : {}),
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return false;

    const body: unknown = await response.json().catch(() => null);
    if (!body || typeof body !== "object") return false;
    return (body as Record<string, unknown>).completed === true;
  } catch {
    // Jaringan/timeout/badan tidak valid — langkah tampil belum selesai.
    return false;
  }
}
