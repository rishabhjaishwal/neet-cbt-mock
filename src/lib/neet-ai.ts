import { readFile } from "node:fs/promises";
import path from "node:path";
import { filterStudentQuestions } from "./content-quality";
import type { TopicBankQuestion, TopicDifficulty, TopicMockSequence } from "./topic-series";
import {
  TOPIC_MOCK_QUESTION_COUNT,
  listTopicSequences,
  topicMockDurationMinutes,
} from "./topic-series";

export { TOPIC_MOCK_QUESTION_COUNT, topicMockDurationMinutes };
export type { TopicDifficulty, TopicMockSequence };

export type NeetAiQuestion = TopicBankQuestion & {
  solution?: string | null;
  studyLinks?: Array<{ label: string; url: string; kind?: string }>;
  keyConfidence?: number;
  keySources?: string[];
};

export type NeetAiBank = {
  id: string;
  label: string;
  subject: string;
  topic: string;
  difficulty: TopicDifficulty;
  counts: Partial<Record<TopicDifficulty, number>>;
  packSize: number;
  packCount: number;
  questions: NeetAiQuestion[];
  gaps: string[];
};

export type NeetAiCatalogEntry = {
  difficulty: TopicDifficulty;
  id: string;
  label: string;
  count: number;
  packs: number;
  sequences: TopicMockSequence[];
  subjects: Record<string, number>;
  ready: boolean;
};

const ROOT = path.join(process.cwd(), "data", "neet-ai");

function curate(bank: NeetAiBank): NeetAiBank {
  const questions = filterStudentQuestions(bank.questions || []) as NeetAiQuestion[];
  const packSize = bank.packSize || TOPIC_MOCK_QUESTION_COUNT;
  const usable = questions.slice(0, Math.floor(questions.length / packSize) * packSize);
  return {
    ...bank,
    questions: usable,
    packSize,
    packCount: Math.floor(usable.length / packSize),
    counts: { [bank.difficulty]: usable.length },
    gaps: usable.length < packSize ? [`Need at least ${packSize} clean items`] : [],
  };
}

export async function loadNeetAiBank(
  difficulty: TopicDifficulty,
): Promise<NeetAiBank | null> {
  try {
    const raw = await readFile(
      path.join(ROOT, "banks", `${difficulty.toLowerCase()}.json`),
      "utf8",
    );
    return curate(JSON.parse(raw) as NeetAiBank);
  } catch {
    return null;
  }
}

export async function listNeetAiCatalog(): Promise<NeetAiCatalogEntry[]> {
  const diffs: TopicDifficulty[] = ["Easy", "Medium", "Hard"];
  const out: NeetAiCatalogEntry[] = [];
  let catalogSubjects: Record<string, Record<string, number>> = {};
  try {
    const raw = await readFile(path.join(ROOT, "catalog.json"), "utf8");
    const cat = JSON.parse(raw) as {
      difficulties?: Record<string, { subjects?: Record<string, number> }>;
    };
    for (const [k, v] of Object.entries(cat.difficulties || {})) {
      if (v?.subjects) catalogSubjects[k] = v.subjects;
    }
  } catch {
    /* optional */
  }

  for (const d of diffs) {
    const bank = await loadNeetAiBank(d);
    if (!bank) {
      out.push({
        difficulty: d,
        id: `neet-ai-${d.toLowerCase()}`,
        label: `NEET AI · ${d}`,
        count: 0,
        packs: 0,
        sequences: [],
        subjects: {},
        ready: false,
      });
      continue;
    }
    const sequences = listTopicSequences("neet-ai", d, bank.questions.length, bank.packSize);
    const subjects =
      catalogSubjects[d] ||
      bank.questions.reduce<Record<string, number>>((acc, q) => {
        acc[q.subject] = (acc[q.subject] || 0) + 1;
        return acc;
      }, {});
    out.push({
      difficulty: d,
      id: `neet-ai-${d.toLowerCase()}`,
      label: bank.label || `NEET AI · ${d}`,
      count: bank.questions.length,
      packs: sequences.length,
      sequences,
      subjects,
      ready: sequences.length > 0,
    });
  }
  return out;
}

export function pickNeetAiSequence(
  bank: NeetAiBank,
  sequence: number,
): { questions: NeetAiQuestion[]; meta: TopicMockSequence } | null {
  if (!Number.isFinite(sequence) || sequence < 1) return null;
  const size = bank.packSize || TOPIC_MOCK_QUESTION_COUNT;
  const seqs = listTopicSequences(bank.id, bank.difficulty, bank.questions.length, size);
  const meta = seqs[sequence - 1];
  if (!meta) return null;
  const start = (sequence - 1) * size;
  const questions = bank.questions.slice(start, start + size);
  if (questions.length < size) return null;
  return { questions, meta };
}
