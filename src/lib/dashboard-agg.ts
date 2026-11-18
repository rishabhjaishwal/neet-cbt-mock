import { Types } from "mongoose";
import { Attempt, TopicAttempt } from "@/lib/models";
import {
  isMeaningfulAttempt,
  toDashPoints,
  type DashboardChartsClientPayload,
} from "@/lib/dashboard-points";
import { buildTopicDashboardAnalytics } from "@/lib/topic-dashboard";

export type DashboardChartsPayload = DashboardChartsClientPayload;

/**
 * Dashboard chart data via Mongo aggregations (projection + meaningful filter).
 * Keeps year-paper vs topic-mock vs NEET AI series separate for the UI.
 */
export async function aggregateDashboardCharts(
  userId: string,
): Promise<DashboardChartsPayload> {
  const uid = new Types.ObjectId(userId);

  const [paperRows, topicRows] = await Promise.all([
    Attempt.aggregate([
      {
        $match: {
          userId: uid,
          status: { $in: ["submitted", "approved"] },
          score: { $ne: null },
        },
      },
      { $sort: { submittedAt: -1, startedAt: -1 } },
      { $limit: 80 },
      {
        $project: {
          year: 1,
          attemptNumber: 1,
          score: 1,
          wrongCount: 1,
          unattemptedCount: 1,
          correctCount: 1,
          subjectStats: 1,
          topicStats: 1,
          submittedAt: 1,
          startedAt: 1,
        },
      },
    ]),
    TopicAttempt.aggregate([
      {
        $match: {
          userId: uid,
          status: { $in: ["submitted", "approved"] },
          score: { $ne: null },
        },
      },
      { $sort: { submittedAt: -1, startedAt: -1 } },
      { $limit: 120 },
      {
        $project: {
          topicId: 1,
          subject: 1,
          topic: 1,
          difficulty: 1,
          sequenceLabel: 1,
          score: 1,
          wrongCount: 1,
          unattemptedCount: 1,
          correctCount: 1,
          subjectStats: 1,
          topicStats: 1,
          submittedAt: 1,
          startedAt: 1,
        },
      },
    ]),
  ]);

  const scoredPapers = paperRows.filter((a) =>
    isMeaningfulAttempt({
      correctCount: a.correctCount,
      wrongCount: a.wrongCount,
      subjectStats: a.subjectStats as Record<string, { partial?: number }> | null,
    }),
  );

  const topicMocks = topicRows.filter(
    (a) => !String(a.topicId || "").startsWith("neet-ai"),
  );
  const neetAiMocks = topicRows.filter((a) =>
    String(a.topicId || "").startsWith("neet-ai"),
  );

  const paperPoints = toDashPoints(
    scoredPapers.map((a) => ({
      id: String(a._id),
      label: `NEET ${a.year} #${a.attemptNumber ?? 1}`,
      kind: "paper" as const,
      year: a.year,
      score: a.score as number,
      totalMarks: 720,
      wrongCount: a.wrongCount,
      unattemptedCount: a.unattemptedCount,
      correctCount: a.correctCount,
      submittedAt: a.submittedAt,
      startedAt: a.startedAt,
      subjectStats: a.subjectStats as Record<
        string,
        { correct?: number; wrong?: number; partial?: number }
      > | null,
    })),
  );

  const mapTopic = (a: (typeof topicRows)[number], kind: "topic" | "neet-ai") => {
    const isNeetAi = kind === "neet-ai";
    return {
      id: String(a._id),
      label: isNeetAi
        ? `NEET AI · ${a.difficulty}${a.sequenceLabel ? ` · ${a.sequenceLabel}` : ""}`
        : `${a.subject} · ${a.topic} (${a.difficulty})`,
      kind,
      score: a.score as number,
      totalMarks: Math.max(
        40,
        ((a.correctCount || 0) + (a.wrongCount || 0) + (a.unattemptedCount || 0)) *
          4,
      ),
      wrongCount: a.wrongCount,
      unattemptedCount: a.unattemptedCount,
      correctCount: a.correctCount,
      submittedAt: a.submittedAt,
      startedAt: a.startedAt,
      subjectStats: a.subjectStats as Record<
        string,
        { correct?: number; wrong?: number; partial?: number }
      > | null,
    };
  };

  const topicPoints = toDashPoints(topicMocks.map((a) => mapTopic(a, "topic")));
  const neetAiPoints = toDashPoints(
    neetAiMocks.map((a) => mapTopic(a, "neet-ai")),
  );

  const allPoints = [...paperPoints, ...topicPoints, ...neetAiPoints].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  const topicAnalytics = buildTopicDashboardAnalytics(
    scoredPapers.map((a) => ({
      subjectStats: a.subjectStats as Record<
        string,
        { correct?: number; wrong?: number; unattempted?: number; partial?: number }
      > | null,
      topicStats: a.topicStats as {
        topics?: Array<{
          topic: string;
          subject: string;
          correct?: number;
          wrong?: number;
          unattempted?: number;
          partial?: number;
        }>;
      } | null,
    })),
    topicRows.map((a) => ({
      subject: a.subject,
      topic: a.topic,
      correctCount: a.correctCount,
      wrongCount: a.wrongCount,
      unattemptedCount: a.unattemptedCount,
      subjectStats: a.subjectStats as Record<
        string,
        { correct?: number; wrong?: number; unattempted?: number; partial?: number }
      > | null,
      topicStats: a.topicStats as {
        topics?: Array<{
          topic: string;
          subject: string;
          correct?: number;
          wrong?: number;
          unattempted?: number;
          partial?: number;
        }>;
      } | null,
    })),
  );

  return {
    paperPoints,
    topicPoints,
    neetAiPoints,
    allPoints,
    topicAnalytics,
    counts: {
      papers: paperPoints.length,
      topics: topicPoints.length,
      neetAi: neetAiPoints.length,
    },
  };
}
