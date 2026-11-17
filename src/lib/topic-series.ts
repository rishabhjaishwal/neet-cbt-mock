import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { filterStudentQuestions } from "./content-quality";

export type TopicDifficulty = "Easy" | "Medium" | "Hard";

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

export type TopicCatalogEntry = {
  id: string;
  subject: string;
  topic: string;
  counts: Record<TopicDifficulty, number>;
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

export async function listTopicCatalog(): Promise<TopicCatalogEntry[]> {
  const raw = await readFile(path.join(ROOT, "catalog.json"), "utf8");
  const data = JSON.parse(raw) as { topics: TopicCatalogEntry[] };
  // Recompute counts from curated banks so UI never advertises garbage pools.
  const topics: TopicCatalogEntry[] = [];
  for (const t of data.topics || []) {
    const bank = await loadTopicBank(t.id);
    if (!bank) {
      topics.push({ ...t, ready: false });
      continue;
    }
    topics.push({
      id: bank.id,
      subject: bank.subject,
      topic: bank.topic,
      counts: bank.counts,
      gaps: bank.gaps,
      ready: bank.counts.Easy + bank.counts.Medium + bank.counts.Hard >= 10,
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

/** Pick up to `limit` questions for a difficulty, shuffled deterministically by seed. */
export function pickTopicQuestions(
  bank: TopicBankFile,
  difficulty: TopicDifficulty,
  limit = 50,
  seed = Date.now(),
): TopicBankQuestion[] {
  const pool = [...(bank.questions[difficulty] || [])];
  // Simple LCG shuffle
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(limit, pool.length));
}
