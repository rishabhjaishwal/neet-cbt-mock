import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { filterStudentQuestions } from "./content-quality";

export type TopicDifficulty = "Easy" | "Medium" | "Hard";

/** Fixed length for each Easy/Medium/Hard topic mock. */
export const TOPIC_MOCK_QUESTION_COUNT = 30;

/**
 * Proportional timer: ~1.2 min/Q, clamped to a 30–40 min student-friendly band
 * for the standard 30-question mock (~36 min).
 */
export function topicMockDurationMinutes(
  questionCount = TOPIC_MOCK_QUESTION_COUNT,
): number {
  const raw = Math.round(questionCount * 1.2);
  if (questionCount <= 0) return 30;
  return Math.min(40, Math.max(30, raw));
}

export type TopicBankQuestion = {
  id: string;
  sourceYear?: number;
  sourceNumber?: number;
  subject: string;
  topic: string;
  difficulty: TopicDifficulty;
  stem: string;
  options: Record<string, string>;
  correctOption?: string;
  correctOptions?: string[];
  multiCorrect?: boolean;
  figureSrc?: string | null;
  figureKind?: string | null;
  answerEstimated?: boolean;
  solutionSource?: string;
};

export type TopicMockSequence = {
  /** 1-based mock index: `<topicSlug>_1`, `_2`, … */
  sequence: number;
  /** Stable label e.g. `mechanics_easy_1` */
  label: string;
  /** Inclusive 1-based bank positions */
  from: number;
  to: number;
  questionCount: number;
};

export type TopicCatalogEntry = {
  id: string;
  subject: string;
  topic: string;
  counts: Record<TopicDifficulty, number>;
  /** Full 30-Q sequential mocks available per difficulty. */
  sequences: Record<TopicDifficulty, TopicMockSequence[]>;
  gaps: string[];
  ready: boolean;
};

type TopicBankFile = {
  id: string;
  subject: string;
  topic: string;
  counts: Record<TopicDifficulty, number>;
  questions: Record<TopicDifficulty, TopicBankQuestion[]>;
  gaps: string[];
};

const ROOT = path.join(process.cwd(), "data", "topic-series");

function curateBank(bank: TopicBankFile): TopicBankFile {
  const questions = {
    Easy: filterStudentQuestions(bank.questions?.Easy || []),
    Medium: filterStudentQuestions(bank.questions?.Medium || []),
    Hard: filterStudentQuestions(bank.questions?.Hard || []),
  } as Record<TopicDifficulty, TopicBankQuestion[]>;
  const counts = {
    Easy: questions.Easy.length,
    Medium: questions.Medium.length,
    Hard: questions.Hard.length,
  };
  const gaps = [...(bank.gaps || [])];
  for (const d of ["Easy", "Medium", "Hard"] as const) {
    if (counts[d] < 50) {
      gaps.push(`${d}: have ${counts[d]} clean items (need 50+)`);
    }
  }
  return {
    ...bank,
    questions,
    counts,
    gaps: [...new Set(gaps)],
  };
}

/** `physics-mechanics` + Easy → `mechanics_easy` */
export function topicSequenceSlug(topicId: string, difficulty: TopicDifficulty): string {
  const short = topicId
    .replace(/^physics-|^chemistry-|^biology-/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return `${short}_${difficulty.toLowerCase()}`;
}

/** How many full 30-Q sequential mocks fit in a pool (remainder discarded). */
export function sequenceCountForPool(
  poolSize: number,
  size = TOPIC_MOCK_QUESTION_COUNT,
): number {
  return Math.floor(Math.max(0, poolSize) / size);
}

export function listTopicSequences(
  topicId: string,
  difficulty: TopicDifficulty,
  poolSize: number,
  size = TOPIC_MOCK_QUESTION_COUNT,
): TopicMockSequence[] {
  const n = sequenceCountForPool(poolSize, size);
  const slug = topicSequenceSlug(topicId, difficulty);
  const out: TopicMockSequence[] = [];
  for (let sequence = 1; sequence <= n; sequence++) {
    const from = (sequence - 1) * size + 1;
    const to = sequence * size;
    out.push({
      sequence,
      label: `${slug}_${sequence}`,
      from,
      to,
      questionCount: size,
    });
  }
  return out;
}

export async function listTopicCatalog(): Promise<TopicCatalogEntry[]> {
  const raw = await readFile(path.join(ROOT, "catalog.json"), "utf8");
  const data = JSON.parse(raw) as { topics: TopicCatalogEntry[] };
  // Recompute counts from curated banks so UI never advertises garbage pools.
  const topics: TopicCatalogEntry[] = [];
  for (const t of data.topics || []) {
    const bank = await loadTopicBank(t.id);
    if (!bank) {
      topics.push({
        ...t,
        sequences: { Easy: [], Medium: [], Hard: [] },
        ready: false,
      });
      continue;
    }
    const sequences = {
      Easy: listTopicSequences(bank.id, "Easy", bank.counts.Easy),
      Medium: listTopicSequences(bank.id, "Medium", bank.counts.Medium),
      Hard: listTopicSequences(bank.id, "Hard", bank.counts.Hard),
    };
    topics.push({
      id: bank.id,
      subject: bank.subject,
      topic: bank.topic,
      counts: bank.counts,
      sequences,
      gaps: bank.gaps,
      ready:
        sequences.Easy.length + sequences.Medium.length + sequences.Hard.length >
        0,
    });
  }
  return topics;
}

export async function loadTopicBank(topicId: string): Promise<TopicBankFile | null> {
  try {
    const raw = await readFile(path.join(ROOT, "banks", `${topicId}.json`), "utf8");
    return curateBank(JSON.parse(raw) as TopicBankFile);
  } catch {
    return null;
  }
}

export async function listBankFiles(): Promise<string[]> {
  try {
    const files = await readdir(path.join(ROOT, "banks"));
    return files.filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/**
 * Sequential mock slice: sequence 1 → Q1–30, 2 → Q31–60, …
 * Bank order is stable (no shuffle) so students can progress through the pool.
 */
export function pickTopicSequence(
  bank: TopicBankFile,
  difficulty: TopicDifficulty,
  sequence: number,
  size = TOPIC_MOCK_QUESTION_COUNT,
): { questions: TopicBankQuestion[]; meta: TopicMockSequence } | null {
  if (!Number.isFinite(sequence) || sequence < 1) return null;
  const pool = bank.questions[difficulty] || [];
  const seqs = listTopicSequences(bank.id, difficulty, pool.length, size);
  const meta = seqs[sequence - 1];
  if (!meta) return null;
  const start = (sequence - 1) * size;
  const questions = pool.slice(start, start + size);
  if (questions.length < size) return null;
  return { questions, meta };
}

/** @deprecated Prefer pickTopicSequence — kept for any legacy callers. */
export function pickTopicQuestions(
  bank: TopicBankFile,
  difficulty: TopicDifficulty,
  limit = TOPIC_MOCK_QUESTION_COUNT,
  seed = Date.now(),
): TopicBankQuestion[] {
  const pool = [...(bank.questions[difficulty] || [])];
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(limit, pool.length));
}
