import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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

export async function listTopicCatalog(): Promise<TopicCatalogEntry[]> {
  const raw = await readFile(path.join(ROOT, "catalog.json"), "utf8");
  const data = JSON.parse(raw) as { topics: TopicCatalogEntry[] };
  return data.topics || [];
}

export async function loadTopicBank(topicId: string): Promise<TopicBankFile | null> {
  try {
    const raw = await readFile(path.join(ROOT, "banks", `${topicId}.json`), "utf8");
    return JSON.parse(raw) as TopicBankFile;
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
