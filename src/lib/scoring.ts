export type AnswerRow = {
  questionId: string;
  number: number;
  subject: string;
  topic: string;
  correctOption: string;
  selectedOption: string | null;
  status: "not_attempted" | "attempted" | "marked";
};

export type ScoreResult = {
  score: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  subjectStats: Record<
    string,
    { correct: number; wrong: number; unattempted: number; accuracy: number }
  >;
  topicStats: Array<{
    topic: string;
    subject: string;
    correct: number;
    wrong: number;
    unattempted: number;
    accuracy: number;
  }>;
  weakTopics: string[];
  improvements: string[];
  percentile: number;
  estimatedRank: number;
};

export { estimateRankPercentile } from "./rank";
import { estimateRankPercentile } from "./rank";

export function scoreAttempt(
  answers: AnswerRow[],
  candidateCount: number,
): ScoreResult {
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  const subjectMap: ScoreResult["subjectStats"] = {};
  const topicMap = new Map<
    string,
    {
      topic: string;
      subject: string;
      correct: number;
      wrong: number;
      unattempted: number;
    }
  >();

  for (const a of answers) {
    const attempted =
      a.status !== "not_attempted" &&
      a.selectedOption != null &&
      a.selectedOption !== "";
    subjectMap[a.subject] ??= {
      correct: 0,
      wrong: 0,
      unattempted: 0,
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
      });
    }
    const t = topicMap.get(key)!;
    if (!attempted) {
      unattemptedCount += 1;
      subjectMap[a.subject].unattempted += 1;
      t.unattempted += 1;
      continue;
    }
    if (a.selectedOption === a.correctOption) {
      correctCount += 1;
      subjectMap[a.subject].correct += 1;
      t.correct += 1;
    } else {
      wrongCount += 1;
      subjectMap[a.subject].wrong += 1;
      t.wrong += 1;
    }
  }

  for (const s of Object.values(subjectMap)) {
    const tried = s.correct + s.wrong;
    s.accuracy = tried ? Math.round((1000 * s.correct) / tried) / 10 : 0;
  }

  const topicStats = [...topicMap.values()]
    .map((t) => {
      const tried = t.correct + t.wrong;
      return {
        ...t,
        accuracy: tried ? Math.round((1000 * t.correct) / tried) / 10 : 0,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong);

  const weakTopics = topicStats
    .filter((t) => t.correct + t.wrong >= 2 && t.accuracy < 50)
    .slice(0, 6)
    .map((t) => `${t.topic} (${t.subject})`);

  const improvements: string[] = [];
  for (const [subject, s] of Object.entries(subjectMap)) {
    if (s.accuracy < 55 && s.correct + s.wrong > 0) {
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
  if (weakTopics.length) {
    improvements.push(`Priority weak topics: ${weakTopics.join("; ")}.`);
  }
  if (!improvements.length) {
    improvements.push(
      "Solid attempt. Focus on Section B selection strategy and speed for rank gains.",
    );
  }

  const score = correctCount * 4 + wrongCount * -1;
  const { percentile, estimatedRank } = estimateRankPercentile(
    score,
    candidateCount,
  );

  return {
    score,
    correctCount,
    wrongCount,
    unattemptedCount,
    subjectStats: subjectMap,
    topicStats,
    weakTopics,
    improvements,
    percentile,
    estimatedRank,
  };
}
