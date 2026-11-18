export type DashAttemptPoint = {
  id: string;
  label: string;
  kind: "paper" | "topic" | "neet-ai";
  year?: number;
  score: number;
  totalMarks: number;
  /** 0–100 score as % of that attempt's total marks (fair across paper vs 30Q mocks). */
  scorePct: number;
  wrong: number;
  unattempted: number;
  correct: number;
  at: string; // ISO
  subjectScores: {
    Physics: number;
    Chemistry: number;
    Biology: number;
  };
};

/** Client-safe shape for `/api/dashboard/charts` (no mongoose imports). */
export type DashboardChartsClientPayload = {
  paperPoints: DashAttemptPoint[];
  topicPoints: DashAttemptPoint[];
  neetAiPoints: DashAttemptPoint[];
  allPoints: DashAttemptPoint[];
  topicAnalytics: import("./topic-dashboard").TopicDashboardAnalytics;
  counts: {
    papers: number;
    topics: number;
    neetAi: number;
  };
};

/** Attempts with no answered items pollute strength charts — exclude them. */
export function isMeaningfulAttempt(row: {
  correctCount?: number | null;
  wrongCount?: number | null;
  partialCount?: number | null;
  subjectStats?: Record<string, { partial?: number }> | null;
}): boolean {
  const partial =
    row.partialCount ??
    Object.values(row.subjectStats || {}).reduce(
      (s, v) => s + (v?.partial || 0),
      0,
    );
  return (row.correctCount || 0) + (row.wrongCount || 0) + partial > 0;
}

function subjectScoreFromStats(
  stats:
    | Record<
        string,
        {
          correct?: number;
          wrong?: number;
          partial?: number;
        }
      >
    | null
    | undefined,
  subject: string,
) {
  const s = stats?.[subject];
  if (!s) return 0;
  return (s.correct || 0) * 4 - (s.wrong || 0) + (s.partial || 0);
}

export function toDashPoints(
  rows: Array<{
    id: string;
    label: string;
    kind: "paper" | "topic" | "neet-ai";
    year?: number;
    score: number;
    totalMarks: number;
    wrongCount?: number | null;
    unattemptedCount?: number | null;
    correctCount?: number | null;
    partialCount?: number | null;
    submittedAt?: string | Date | null;
    startedAt?: string | Date | null;
    subjectStats?: Record<
      string,
      { correct?: number; wrong?: number; partial?: number }
    > | null;
  }>,
): DashAttemptPoint[] {
  return rows
    .filter((r) =>
      isMeaningfulAttempt({
        correctCount: r.correctCount,
        wrongCount: r.wrongCount,
        partialCount: r.partialCount,
        subjectStats: r.subjectStats,
      }),
    )
    .map((r) => {
      const at = r.submittedAt || r.startedAt || new Date().toISOString();
      const totalMarks = Math.max(1, r.totalMarks || 1);
      const scorePct = Math.round((1000 * r.score) / totalMarks) / 10;
      return {
        id: r.id,
        label: r.label,
        kind: r.kind,
        year: r.year,
        score: r.score,
        totalMarks,
        scorePct,
        wrong: r.wrongCount ?? 0,
        unattempted: r.unattemptedCount ?? 0,
        correct: r.correctCount ?? 0,
        at: typeof at === "string" ? at : new Date(at).toISOString(),
        subjectScores: {
          Physics: subjectScoreFromStats(r.subjectStats, "Physics"),
          Chemistry: subjectScoreFromStats(r.subjectStats, "Chemistry"),
          Biology: subjectScoreFromStats(r.subjectStats, "Biology"),
        },
      };
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
