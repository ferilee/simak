// Pemetaan penugasan → topik RUAS di sisi web (Hub Murid Tahap 2).
//
// Cermin persis aturan server (apps/api/src/lib/ruas-status.ts +
// ruas-hub.ts): tautan kuis RUAS berbentuk ".../quiz/<id-topik>" atau
// ".../topics/<id-topik>" dengan "?subject_id=<id-mapel>" opsional.
// Pemetaan EFEKTIF selalu mendahulukan hasil urai tautan; pilihan guru
// dari pemilih topik hanya berlaku bila tautan tidak terurai. Web
// memakai cermin ini hanya untuk MENAMPILKAN keadaan formulir dan
// menonaktifkan tombol Tarik — keputusan akhir selalu di server.

export type RuasQuizTarget = { topicId: number; subjectId: number | null };

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

export type RuasMappingSource = {
  ruasQuizUrl: string | null;
  ruasTopicId: number | null;
  ruasSubjectId: number | null;
};

/** Pemetaan efektif: urai tautan dulu, pilihan guru sesudahnya, null bila belum terpetakan. */
export function resolveEffectiveRuasTarget(source: RuasMappingSource): RuasQuizTarget | null {
  const parsed = parseRuasQuizUrl(source.ruasQuizUrl);
  if (parsed) return parsed;
  if (source.ruasTopicId !== null && Number.isInteger(source.ruasTopicId) && source.ruasTopicId > 0) {
    return {
      topicId: source.ruasTopicId,
      subjectId:
        source.ruasSubjectId !== null && Number.isInteger(source.ruasSubjectId) && source.ruasSubjectId > 0
          ? source.ruasSubjectId
          : null,
    };
  }
  return null;
}

export type RuasTopicOption = {
  id: number;
  title: string;
  subject_id: number | null;
  subject_name: string | null;
};

/** Label satu topik pada pemilih: judul + nama mapel bila ada. */
export function ruasTopicLabel(topic: RuasTopicOption): string {
  return topic.subject_name ? `${topic.title} · ${topic.subject_name}` : topic.title;
}
