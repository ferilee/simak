import { env } from "./env";
import { parseRuasQuizUrl, type RuasQuizTarget } from "./ruas-status";

// Jembatan Hub Murid (Tahap 2) ke endpoint internal RUAS — satu pipa
// server-ke-server untuk empat kebutuhan: daftar topik RUAS (pemilih
// pemetaan guru), skor per topik (tarik nilai otomatis), daftar asesmen
// seorang murid (bagian Asesmen beranda), dan penerbitan URL serah-
// terima (tombol "Buka di RUAS" tanpa login ulang).
//
// Alamat semua endpoint ini DITURUNKAN dari env yang sudah ada —
// RUAS_STATUS_ENDPOINT adalah URL lengkap endpoint attempt-status
// (".../api/internal/simak/attempt-status"); endpoint lain tinggal di
// awalan yang sama, jadi basisnya = origin URL itu + prefiks
// "/api/internal/simak". TIDAK ada env baru: rahasia bersama tetap
// RUAS_INTERNAL_SECRET, dikirim sebagai header x-internal-secret,
// persis pola lib/ruas-status.ts.
//
// Semua panggilan GAGAL-LEMBUT: konfigurasi kosong, jaringan putus,
// timeout, status bukan 2xx, atau badan tak berbentuk → null, dan
// pemanggil memutuskan tampilan cadangannya. Jembatan ini tidak boleh
// pernah menggagalkan halaman mana pun.

export type RuasTopicRef = { topicId: number; subjectId: number | null };

export type RuasTopic = {
  id: number;
  title: string;
  subjectId: number | null;
  subjectName: string | null;
};

export type RuasScoreEntry = { score: number; finishedAt: string | null };

export type RuasAssessmentStatus = "not_started" | "in_progress" | "finished";

export type RuasAssessmentEntry = {
  topicId: number;
  title: string;
  status: RuasAssessmentStatus;
  score: number | null;
  finishedAt: string | null;
};

const INTERNAL_PREFIX = "/api/internal/simak";
const DEFAULT_TIMEOUT_MS = 4000;
const SCORES_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Penurunan alamat + konfigurasi.
// ---------------------------------------------------------------------------

/**
 * Basis endpoint internal RUAS dari URL endpoint attempt-status:
 * origin-nya + prefiks internal. Null bila nilai kosong/bukan URL —
 * jembatan dianggap belum disetel.
 */
export function deriveRuasInternalBase(statusEndpoint: string | null | undefined): string | null {
  if (!statusEndpoint) return null;
  let url: URL;
  try {
    url = new URL(statusEndpoint);
  } catch {
    return null;
  }
  return `${url.origin}${INTERNAL_PREFIX}`;
}

/** Basis dari env proses; null bila jembatan belum disetel penuh. */
export function ruasInternalBaseUrl(): string | null {
  if (!env.RUAS_INTERNAL_SECRET) return null;
  return deriveRuasInternalBase(env.RUAS_STATUS_ENDPOINT);
}

/** Apakah jembatan internal RUAS tersetel (env lengkap + URL sah)? */
export function ruasBridgeConfigured(): boolean {
  return ruasInternalBaseUrl() !== null;
}

async function ruasInternalRequest(path: string, init: { method: "GET" | "POST"; body?: unknown }, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, unknown> | null> {
  const base = ruasInternalBaseUrl();
  if (!base || !env.RUAS_INTERNAL_SECRET) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-internal-secret": env.RUAS_INTERNAL_SECRET,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    // Jaringan/timeout/badan tidak valid — jembatan dianggap tak terjangkau.
    return null;
  }
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function scoreOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Klien endpoint internal RUAS (kontrak dibangun paralel di sisi RUAS).
// ---------------------------------------------------------------------------

/** GET /topics → daftar topik RUAS untuk pemilih pemetaan guru. */
export async function fetchRuasTopics(): Promise<RuasTopic[] | null> {
  const body = await ruasInternalRequest("/topics", { method: "GET" });
  if (!body || !Array.isArray(body.topics)) return null;
  const topics: RuasTopic[] = [];
  for (const raw of body.topics) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = positiveInt(row.id);
    if (id === null) continue;
    topics.push({
      id,
      title: typeof row.title === "string" ? row.title : "",
      subjectId: positiveInt(row.subject_id),
      subjectName: stringOrNull(row.subject_name),
    });
  }
  return topics;
}

/**
 * POST /scores → skor attempt SELESAI TERAKHIR tiap username pada satu
 * topik (aturan skor yang diputuskan pemilik). Peta hasil hanya memuat
 * username yang dikirim; nilai null berarti murid itu belum punya skor
 * (belum selesai / tidak dikenal RUAS — keduanya diperlakukan sama).
 */
export async function fetchRuasScores(
  target: RuasTopicRef,
  usernames: string[],
): Promise<Record<string, RuasScoreEntry | null> | null> {
  const body = await ruasInternalRequest(
    "/scores",
    {
      method: "POST",
      body: {
        topic_id: target.topicId,
        ...(target.subjectId !== null ? { subject_id: target.subjectId } : {}),
        usernames,
      },
    },
    SCORES_TIMEOUT_MS,
  );
  if (!body || !body.scores || typeof body.scores !== "object" || Array.isArray(body.scores)) return null;
  const rawScores = body.scores as Record<string, unknown>;
  const result: Record<string, RuasScoreEntry | null> = {};
  for (const username of usernames) {
    const raw = rawScores[username];
    if (!raw || typeof raw !== "object") {
      result[username] = null;
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const score = scoreOrNull(entry.score);
    result[username] = score === null ? null : { score, finishedAt: stringOrNull(entry.finished_at) };
  }
  return result;
}

/** POST /student-assessments → status + skor murid pada topik-topik terpetakan. */
export async function fetchStudentAssessments(
  username: string,
  topics: RuasTopicRef[],
): Promise<RuasAssessmentEntry[] | null> {
  const body = await ruasInternalRequest("/student-assessments", {
    method: "POST",
    body: {
      username,
      topics: topics.map((topic) => ({
        topic_id: topic.topicId,
        ...(topic.subjectId !== null ? { subject_id: topic.subjectId } : {}),
      })),
    },
  });
  if (!body || !Array.isArray(body.assessments)) return null;
  const entries: RuasAssessmentEntry[] = [];
  for (const raw of body.assessments) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const topicId = positiveInt(row.topic_id);
    if (topicId === null) continue;
    const status: RuasAssessmentStatus =
      row.status === "in_progress" || row.status === "finished" ? row.status : "not_started";
    entries.push({
      topicId,
      title: typeof row.title === "string" ? row.title : "",
      status,
      score: scoreOrNull(row.score),
      finishedAt: stringOrNull(row.finished_at),
    });
  }
  return entries;
}

export type RuasHandoffTarget =
  | { type: "dashboard" }
  | { type: "topic"; topicId: number; subjectId: number | null };

/** POST /handoff → URL penukaran sekali pakai untuk membuka RUAS tanpa login. */
export async function requestRuasHandoff(username: string, target: RuasHandoffTarget): Promise<string | null> {
  const body = await ruasInternalRequest("/handoff", {
    method: "POST",
    body: {
      username,
      target: target.type === "topic"
        ? { type: "topic", topic_id: target.topicId, ...(target.subjectId !== null ? { subject_id: target.subjectId } : {}) }
        : { type: "dashboard" },
    },
  });
  if (!body) return null;
  return stringOrNull(body.url);
}

// ---------------------------------------------------------------------------
// Pemetaan efektif penugasan → topik RUAS (murni).
// ---------------------------------------------------------------------------

export type RuasMappingSource = {
  ruasQuizUrl: string | null;
  ruasTopicId: number | null;
  ruasSubjectId: number | null;
};

/**
 * Pemetaan efektif sebuah penugasan: hasil urai tautan kuis RUAS selalu
 * didahulukan (tautan adalah yang benar-benar dibuka murid); pilihan
 * guru (ruas_topic_id/ruas_subject_id) hanya berlaku bila tautan tidak
 * terurai. Null = penugasan belum terpetakan.
 */
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

export type MappedTopic = RuasTopicRef & { assignmentId: number; assignmentTitle: string };

/**
 * Daftar topik terpetakan seorang murid dari penugasan-penugasannya:
 * hanya penugasan yang pemetaan efektifnya ada, didedup per
 * (topic_id, subject_id) — penugasan pertama pada urutan masukan yang
 * membawa topik itu yang tercatat sebagai konteks kartunya.
 */
export function collectMappedTopics(
  assignments: readonly (RuasMappingSource & { id: number; title: string })[],
): MappedTopic[] {
  const seen = new Set<string>();
  const mapped: MappedTopic[] = [];
  for (const assignment of assignments) {
    const target = resolveEffectiveRuasTarget(assignment);
    if (!target) continue;
    const key = `${target.topicId}|${target.subjectId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push({ topicId: target.topicId, subjectId: target.subjectId, assignmentId: assignment.id, assignmentTitle: assignment.title });
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// Kartu asesmen beranda murid (murni).
// ---------------------------------------------------------------------------

export type AssessmentCard = {
  topic_id: number;
  subject_id: number | null;
  title: string;
  status: RuasAssessmentStatus;
  score: number | null;
  finished_at: string | null;
  assignment_id: number;
  assignment_title: string;
};

/**
 * Kartu asesmen dari topik terpetakan + jawaban RUAS. Topik yang tidak
 * dijawab RUAS (tidak ada entrinya) tampil sebagai belum dikerjakan
 * dengan judul cadangan dari konteks penugasannya — daftar hub hanya
 * memuat topik terpetakan, tidak pernah menebak topik lain.
 */
export function planAssessmentCards(mapped: readonly MappedTopic[], entries: readonly RuasAssessmentEntry[]): AssessmentCard[] {
  const byTopicId = new Map<number, RuasAssessmentEntry[]>();
  for (const entry of entries) {
    const bucket = byTopicId.get(entry.topicId) ?? [];
    bucket.push(entry);
    byTopicId.set(entry.topicId, bucket);
  }
  return mapped.map((topic) => {
    const bucket = byTopicId.get(topic.topicId) ?? [];
    const entry = bucket.shift();
    return {
      topic_id: topic.topicId,
      subject_id: topic.subjectId,
      title: entry?.title ? entry.title : topic.assignmentTitle,
      status: entry?.status ?? "not_started",
      score: entry?.score ?? null,
      finished_at: entry?.finishedAt ?? null,
      assignment_id: topic.assignmentId,
      assignment_title: topic.assignmentTitle,
    };
  });
}

// ---------------------------------------------------------------------------
// Ringkasan tarik nilai RUAS (murni).
// ---------------------------------------------------------------------------

export type PullStudent = { id: number; username: string; name: string };

export type PullSummary = {
  /** Baris yang akan ditulis ke ruas_scores (hanya murid berskor). */
  rows: { studentId: number; username: string; studentName: string; score: number }[];
  terbarui: number;
  /** Murid sasaran yang belum punya skor selesai di RUAS. */
  belumAdaSkor: number;
  /** Username pada jawaban RUAS yang bukan murid sasaran penugasan. */
  tidakDikenal: number;
};

/**
 * Ringkas hasil /scores menjadi baris ruas_scores + hitungan laporan.
 * Murid tanpa skor tidak ditulis sama sekali (rekapnya membaca "belum
 * ada nilai RUAS"), sama seperti baris CSV yang tidak pernah masuk.
 */
export function summarizeRuasPull(
  students: readonly PullStudent[],
  scores: Record<string, RuasScoreEntry | null>,
): PullSummary {
  const knownUsernames = new Set(students.map((student) => student.username));
  const rows: PullSummary["rows"] = [];
  let belumAdaSkor = 0;
  for (const student of students) {
    const entry = scores[student.username] ?? null;
    if (entry === null) {
      belumAdaSkor += 1;
      continue;
    }
    rows.push({ studentId: student.id, username: student.username, studentName: student.name, score: entry.score });
  }
  const tidakDikenal = Object.keys(scores).filter((username) => !knownUsernames.has(username)).length;
  return { rows, terbarui: rows.length, belumAdaSkor, tidakDikenal };
}

// ---------------------------------------------------------------------------
// Progres per rantai untuk beranda murid (murni).
// ---------------------------------------------------------------------------

export type ChainProgressInput = {
  assignmentId: number;
  /** Kunci rantai dari rencana lib/rantai-penugasan; null = penugasan bebas (tidak ikut progres). */
  chainKey: string | null;
  subject: string | null;
  topicGroup: string | null;
  moduleId: number | null;
  materialCompleted: boolean;
  worksheetId: number | null;
  /** Status attempt efektif; null bila penugasan tanpa LKPD. */
  attemptStatus: "belum" | "draf" | "terkumpul" | "dinilai" | null;
  ruasTarget: RuasTopicRef | null;
};

export type ChainProgress = {
  chain_key: string;
  subject: string;
  topic_group: string;
  assignment_count: number;
  materials_total: number;
  materials_completed: number;
  materials_pct: number;
  lkpd_total: number;
  lkpd_submitted: number;
  lkpd_graded: number;
  assessment: {
    topic_id: number;
    subject_id: number | null;
    title: string | null;
    status: RuasAssessmentStatus | null;
    score: number | null;
  } | null;
};

/**
 * Progres per rantai (mapel + kelompok materi) dari masukan yang sudah
 * terurut mengikuti rencana global murid: urutan rantai pada hasil
 * mengikuti kemunculan pertamanya. Penugasan bebas (chainKey null)
 * tidak membentuk rantai dan tidak ikut. Asesmen yang ditempel adalah
 * topik terpetakan pertama pada rantai itu; judul/status/skornya dari
 * kartu asesmen bila data RUAS tersedia, null bila tidak.
 */
export function planChainProgress(
  inputs: readonly ChainProgressInput[],
  cards: readonly AssessmentCard[] | null,
): ChainProgress[] {
  const cardByTopicId = new Map<number, AssessmentCard>();
  for (const card of cards ?? []) {
    if (!cardByTopicId.has(card.topic_id)) cardByTopicId.set(card.topic_id, card);
  }
  const order: string[] = [];
  const byChain = new Map<string, { inputs: ChainProgressInput[]; subject: string; topicGroup: string }>();
  for (const input of inputs) {
    if (input.chainKey === null) continue;
    let bucket = byChain.get(input.chainKey);
    if (!bucket) {
      bucket = { inputs: [], subject: input.subject ?? "", topicGroup: input.topicGroup ?? "" };
      byChain.set(input.chainKey, bucket);
      order.push(input.chainKey);
    }
    bucket.inputs.push(input);
  }
  return order.map((chainKey) => {
    const bucket = byChain.get(chainKey)!;
    const moduleIds = new Set<number>();
    const completedModuleIds = new Set<number>();
    let lkpdTotal = 0;
    let lkpdSubmitted = 0;
    let lkpdGraded = 0;
    let assessment: ChainProgress["assessment"] = null;
    for (const input of bucket.inputs) {
      if (input.moduleId !== null) {
        moduleIds.add(input.moduleId);
        if (input.materialCompleted) completedModuleIds.add(input.moduleId);
      }
      if (input.worksheetId !== null) {
        lkpdTotal += 1;
        if (input.attemptStatus === "terkumpul" || input.attemptStatus === "dinilai") lkpdSubmitted += 1;
        if (input.attemptStatus === "dinilai") lkpdGraded += 1;
      }
      if (assessment === null && input.ruasTarget !== null) {
        const card = cardByTopicId.get(input.ruasTarget.topicId);
        assessment = {
          topic_id: input.ruasTarget.topicId,
          subject_id: input.ruasTarget.subjectId,
          title: card?.title ?? null,
          status: card?.status ?? null,
          score: card?.score ?? null,
        };
      }
    }
    const materialsTotal = moduleIds.size;
    const materialsCompleted = completedModuleIds.size;
    return {
      chain_key: chainKey,
      subject: bucket.subject,
      topic_group: bucket.topicGroup,
      assignment_count: bucket.inputs.length,
      materials_total: materialsTotal,
      materials_completed: materialsCompleted,
      materials_pct: materialsTotal === 0 ? 0 : Math.round((materialsCompleted / materialsTotal) * 100),
      lkpd_total: lkpdTotal,
      lkpd_submitted: lkpdSubmitted,
      lkpd_graded: lkpdGraded,
      assessment,
    };
  });
}
