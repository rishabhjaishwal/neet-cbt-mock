import { estimateRankPercentile } from "./rank";
import {
  isMultiCorrectQuestion,
  resolveCorrectOptions,
  scoreSelection,
  type Outcome,
} from "./multi-correct";

export { estimateRankPercentile } from "./rank";

export type AnswerRow = {
  questionId: string;
  number: number;
  subject: string;
  topic: string;
  correctOption: string;
  correctOptions?: string[];
  multiCorrect?: boolean;
  selectedOption: string | null;
  selectedOptions?: string[] | null;
  status: "not_attempted" | "attempted" | "marked";
};

export type ScoreResult = {
  score: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  partialCount: number;
  subjectStats: Record<
    string,
    {
      correct: number;
      wrong: number;
      unattempted: number;
      partial: number;
      accuracy: number;
    }
  >;
  topicStats: Array<{
    topic: string;
    subject: string;
    correct: number;
    wrong: number;
    unattempted: number;
    partial: number;
    accuracy: number;
  }>;
  weakTopics: string[];
  strongTopics: string[];
  improvements: string[];
  percentile: number;
  estimatedRank: number;
};

function selectedFor(a: AnswerRow): string[] {
  if (a.selectedOptions && a.selectedOptions.length) return a.selectedOptions;
  if (a.selectedOption) return [a.selectedOption];
  return [];
}

export function scoreAttempt(
  answers: AnswerRow[],
  candidateCount: number,
): ScoreResult {
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  let partialCount = 0;
  let score = 0;

  const subjectMap: ScoreResult["subjectStats"] = {};
  const topicMap = new Map<
    string,
    {
      topic: string;
      subject: string;
      correct: number;
      wrong: number;
      unattempted: number;
      partial: number;
    }
  >();

  for (const a of answers) {
    subjectMap[a.subject] ??= {
      correct: 0,
      wrong: 0,
      unattempted: 0,
      partial: 0,
      accuracy: 0,
    };
    const key = `${a.subject}::${a.topic}`;
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        topic: a.topic,
        subject: a.subject,
        correct: 0,
        wrong: 0,
        unattempted: 0,
        partial: 0,
      });
    }
    const t = topicMap.get(key)!;
    const multi = isMultiCorrectQuestion(a);
    const correct = resolveCorrectOptions(a);
    const selected =
      a.status === "not_attempted" ? [] : selectedFor(a);

    const { marks, outcome } = scoreSelection(selected, correct, multi);
    score += marks;

    const bump = (o: Outcome) => {
      if (o === "unattempted") {
        unattemptedCount += 1;
        subjectMap[a.subject].unattempted += 1;
        t.unattempted += 1;
      } else if (o === "correct") {
        correctCount += 1;
        subjectMap[a.subject].correct += 1;
        t.correct += 1;
      } else if (o === "partial") {
        partialCount += 1;
        subjectMap[a.subject].partial += 1;
        t.partial += 1;
      } else {
        wrongCount += 1;
        subjectMap[a.subject].wrong += 1;
        t.wrong += 1;
      }
    };
    bump(outcome);
  }

  for (const s of Object.values(subjectMap)) {
    const tried = s.correct + s.wrong + s.partial;
    s.accuracy = tried
      ? Math.round((1000 * (s.correct + 0.5 * s.partial)) / tried) / 10
      : 0;
  }

  const topicStats = [...topicMap.values()]
    .map((t) => {
      const tried = t.correct + t.wrong + t.partial;
      return {
        ...t,
        accuracy: tried
          ? Math.round((1000 * (t.correct + 0.5 * t.partial)) / tried) / 10
          : 0,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong);

  const weakTopics = topicStats
    .filter((t) => t.correct + t.wrong + t.partial >= 2 && t.accuracy < 50)
    .slice(0, 8)
    .map((t) => `${t.topic} (${t.subject})`);

  const strongTopics = [...topicStats]
    .filter((t) => t.correct + t.wrong + t.partial >= 2 && t.accuracy >= 70)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 8)
    .map((t) => `${t.topic} (${t.subject})`);

  const improvements: string[] = [];
  for (const [subject, s] of Object.entries(subjectMap)) {
    if (s.accuracy < 55 && s.correct + s.wrong + s.partial > 0) {
      improvements.push(
        `Strengthen ${subject}: accuracy ${s.accuracy}% — revise NCERT examples and timed drills.`,
      );
    }
    if (s.unattempted > 8) {
      improvements.push(
        `Reduce unattempted in ${subject} (${s.unattempted}). Practice skipping only after a 60s triage.`,
      );
    }
  }
  if (wrongCount > correctCount * 0.45) {
    improvements.push(
      "Negative marking is hurting you — eliminate two options before guessing.",
    );
  }
  if (partialCount > 0) {
    improvements.push(
      `You earned partial credit on ${partialCount} multi-correct item(s). Aim to select the full correct set for +4.`,
    );
  }
  if (weakTopics.length) {
    improvements.push(`Priority weak topics: ${weakTopics.join("; ")}.`);
  }
  if (!improvements.length) {
    improvements.push(
      "Solid attempt. Focus on Section B selection strategy and speed for rank gains.",
    );
  }

  const { percentile, estimatedRank } = estimateRankPercentile(
    score,
    candidateCount,
  );

  return {
    score,
    correctCount,
    wrongCount,
    unattemptedCount,
    partialCount,
    subjectStats: subjectMap,
    topicStats,
    weakTopics,
    strongTopics,
    improvements,
    percentile,
    estimatedRank,
  };
}
