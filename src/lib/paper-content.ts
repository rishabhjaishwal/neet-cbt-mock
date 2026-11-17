import {
  getMdQuestionMap,
  type MdQuestion,
} from "./md-paper-store";

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

/** Canonical paper markdown metadata keyed by questionKey. */
export async function getPaperQuestionMap(
  year: number,
): Promise<Map<string, PaperQuestionMeta>> {
  const src = await getMdQuestionMap(year);
  const map = new Map<string, PaperQuestionMeta>();
  for (const [key, q] of src.entries()) {
    map.set(key, toMeta(q));
  }
  return map;
}

function toMeta(q: MdQuestion): PaperQuestionMeta {
  return {
    id: q.id,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options: q.options,
    correctOption: q.correctOption || "1",
    correctOptions: q.correctOptions,
    multiCorrect: q.multiCorrect,
    answerEstimated: q.answerEstimated,
    figureSrc: q.figureSrc,
    figureKind: q.figureKind,
    solution: q.solution ?? undefined,
    studyLinks: q.studyLinks ?? undefined,
  };
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
