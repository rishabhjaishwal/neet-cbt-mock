export type DashAttemptPoint = {
  id: string;
  label: string;
  kind: "paper" | "topic";
  year?: number;
  score: number;
  totalMarks: number;
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
    kind: "paper" | "topic";
    year?: number;
    score: number;
    totalMarks: number;
    wrongCount?: number | null;
    unattemptedCount?: number | null;
    correctCount?: number | null;
    submittedAt?: string | Date | null;
    startedAt?: string | Date | null;
    subjectStats?: Record<
      string,
      { correct?: number; wrong?: number; partial?: number }
    > | null;
  }>,
): DashAttemptPoint[] {
  return rows
    .map((r) => {
      const at = r.submittedAt || r.startedAt || new Date().toISOString();
      return {
        id: r.id,
        label: r.label,
        kind: r.kind,
        year: r.year,
        score: r.score,
        totalMarks: r.totalMarks,
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
