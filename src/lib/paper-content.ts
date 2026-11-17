import { readFile } from "node:fs/promises";
import path from "node:path";

export type PaperQuestionMeta = {
  id: string;
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  correctOption: string;
  correctOptions?: string[];
  multiCorrect?: boolean;
  answerEstimated?: boolean;
  figureSrc?: string | null;
  figureKind?: string | null;
  solution?: string;
  studyLinks?: Array<{ label: string; url: string }>;
};

type PaperFile = {
  year: number;
  totalQuestions: number;
  questions: PaperQuestionMeta[];
};

const cache = new Map<number, Map<string, PaperQuestionMeta>>();

/** Canonical paper JSON metadata keyed by questionKey (authoritative for display numbers). */
export async function getPaperQuestionMap(
  year: number,
): Promise<Map<string, PaperQuestionMeta>> {
  const hit = cache.get(year);
  if (hit) return hit;

  const file = path.join(process.cwd(), "data", "papers", `neet-${year}.json`);
  const raw = JSON.parse(await readFile(file, "utf8")) as PaperFile;
  const map = new Map<string, PaperQuestionMeta>();
  for (const q of raw.questions ?? []) {
    if (q?.id) map.set(q.id, q);
  }
  cache.set(year, map);
  return map;
}

/** Prefer paper.number; never surface parked seed sentinels (20xxx/30xxx). */
export function displayQuestionNumber(
  paperQ: PaperQuestionMeta | undefined,
  dbNumber: number | undefined,
  fallbackIndex: number,
): number {
  if (paperQ && paperQ.number >= 1 && paperQ.number <= 500) return paperQ.number;
  if (dbNumber != null && dbNumber >= 1 && dbNumber <= 500) return dbNumber;
  return fallbackIndex + 1;
}
