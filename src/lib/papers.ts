import { ensureSeeded } from "./seed";
import { Paper, Question } from "./models";

export async function listPapers() {
  // Versioned seed (fast no-op once AppMeta matches).
  await ensureSeeded();
  const rows = await Paper.find().sort({ year: -1 }).lean();
  return rows.map((p) => ({
    year: p.year,
    code: p.code,
    title: p.title,
    candidate_count: p.candidateCount,
    duration_minutes: p.durationMinutes,
    total_questions: p.totalQuestions,
    attempt_limit: p.attemptLimit,
    structure: p.structure,
    source_note: p.sourceNote,
    gaps_json: JSON.stringify(p.gaps ?? []),
  }));
}

export async function getPaper(year: number) {
  await ensureSeeded();
  const p = await Paper.findOne({ year }).lean();
  if (!p) return null;
  return {
    year: p.year,
    code: p.code,
    title: p.title,
    candidate_count: p.candidateCount,
    duration_minutes: p.durationMinutes,
    total_questions: p.totalQuestions,
    attempt_limit: p.attemptLimit,
    structure: p.structure,
    source_note: p.sourceNote,
    gaps_json: JSON.stringify(p.gaps ?? []),
  };
}

export async function getQuestionsForStudent(year: number) {
  await ensureSeeded();
  const rows = await Question.find({ year }).sort({ number: 1 }).lean();
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
  const rows = await Question.find({ year }).sort({ number: 1 }).lean();
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
