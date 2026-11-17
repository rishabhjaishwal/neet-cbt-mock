import {
  getMdPaper,
  getMdQuestionsForStudent,
  getMdQuestionsWithKeys,
  listMdPapers,
} from "./md-paper-store";

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
  student_ready: boolean;
};

function mapMeta(p: {
  year: number;
  code: string;
  title: string;
  candidateCount: number;
  durationMinutes: number;
  totalQuestions: number;
  attemptLimit: number;
  structure: string;
  source: string;
  gaps: string[];
  studentReady: boolean;
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
    source_note: p.source,
    gaps_json: JSON.stringify(p.gaps ?? []),
    student_ready: Boolean(p.studentReady),
  };
}

export async function listPapers() {
  const rows = await listMdPapers();
  return rows.map(mapMeta);
}

export async function getPaper(year: number) {
  const p = await getMdPaper(year);
  return p ? mapMeta(p) : null;
}

export async function getQuestionsForStudent(year: number) {
  return getMdQuestionsForStudent(year);
}

export async function getQuestionsWithKeys(year: number) {
  const rows = await getMdQuestionsWithKeys(year);
  return rows.map((q) => ({
    id: q.id,
    questionKey: q.questionKey,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options_json: q.options_json,
    correct_option: q.correctOption,
  }));
}
