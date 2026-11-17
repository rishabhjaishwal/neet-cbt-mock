import { ensureSeeded } from "./seed";
import { Paper, Question } from "./models";

export type PaperRow = {
  year: number;
  code: string;
  title: string;
  candidate_count: number;
  duration_minutes: number;
  total_questions: number;
  attempt_limit: number;
  structure: string;
  source_note: string;
  gaps_json: string;
};

const paperByYear = new Map<number, PaperRow>();
let paperListCache: PaperRow[] | null = null;

function mapPaper(p: {
  year: number;
  code: string;
  title: string;
  candidateCount: number;
  durationMinutes: number;
  totalQuestions: number;
  attemptLimit: number;
  structure: string;
  sourceNote?: string;
  gaps?: string[];
}): PaperRow {
  return {
    year: p.year,
    code: p.code,
    title: p.title,
    candidate_count: p.candidateCount,
    duration_minutes: p.durationMinutes,
    total_questions: p.totalQuestions,
    attempt_limit: p.attemptLimit,
    structure: p.structure,
    source_note: p.sourceNote ?? "",
    gaps_json: JSON.stringify(p.gaps ?? []),
  };
}

export async function listPapers() {
  // Versioned seed (fast no-op once AppMeta matches).
  await ensureSeeded();
  if (paperListCache) return paperListCache;
  const rows = await Paper.find().sort({ year: -1 }).lean();
  const mapped = rows.map(mapPaper);
  paperListCache = mapped;
  for (const row of mapped) paperByYear.set(row.year, row);
  return mapped;
}

export async function getPaper(year: number) {
  const hit = paperByYear.get(year);
  if (hit) return hit;
  await ensureSeeded();
  const cached = paperByYear.get(year);
  if (cached) return cached;
  const p = await Paper.findOne({ year }).lean();
  if (!p) return null;
  const row = mapPaper(p);
  paperByYear.set(year, row);
  return row;
}

const QUESTION_STUDENT_SELECT =
  "questionKey number subject section topic stem options multiCorrect figureSrc figureKind";

export async function getQuestionsForStudent(year: number) {
  await ensureSeeded();
  const rows = await Question.find({ year })
    .select(QUESTION_STUDENT_SELECT)
    .sort({ number: 1 })
    .lean();
  return rows.map((q) => ({
    id: String(q._id),
    questionKey: q.questionKey,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options_json: JSON.stringify(q.options ?? {}),
  }));
}

export async function getQuestionsWithKeys(year: number) {
  await ensureSeeded();
  const rows = await Question.find({ year })
    .select(`${QUESTION_STUDENT_SELECT} correctOption`)
    .sort({ number: 1 })
    .lean();
  return rows.map((q) => ({
    id: String(q._id),
    questionKey: q.questionKey,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options_json: JSON.stringify(q.options ?? {}),
    correct_option: q.correctOption,
  }));
}
