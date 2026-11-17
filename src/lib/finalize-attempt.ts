import { Attempt, Question } from "./models";
import { getPaper } from "./papers";
import { scoreAttempt } from "./scoring";
import { isMultiCorrectQuestion, resolveCorrectOptions } from "./multi-correct";

type AnswerLike = {
  questionId: unknown;
  selectedOption?: string | null;
  selectedOptions?: string[];
  status: string;
};

function buildScoreInput(
  answers: AnswerLike[],
  byId: Record<
    string,
    {
      number?: number;
      subject?: string;
      topic?: string;
      correctOption?: string;
      correctOptions?: string[];
      multiCorrect?: boolean;
    }
  >,
) {
  return answers.map((a) => {
    const q = byId[String(a.questionId)];
    const correctOptions = resolveCorrectOptions({
      correctOption: q?.correctOption,
      correctOptions: q?.correctOptions,
    });
    const selectedOptions =
      a.selectedOptions && a.selectedOptions.length
        ? a.selectedOptions
        : a.selectedOption
          ? [a.selectedOption]
          : [];
    return {
      questionId: String(a.questionId),
      number: q?.number ?? 0,
      subject: q?.subject ?? "Unknown",
      topic: q?.topic ?? "General",
      correctOption: correctOptions.join(",") || "1",
      correctOptions,
      multiCorrect: isMultiCorrectQuestion({
        multiCorrect: q?.multiCorrect,
        correctOptions,
        correctOption: q?.correctOption,
      }),
      selectedOption: selectedOptions[0] ?? null,
      selectedOptions,
      status: a.status as "not_attempted" | "attempted" | "marked",
    };
  });
}

function applyScoreResult(
  attempt: {
    status: string;
    submittedAt?: Date;
    approvedAt?: Date | null;
    approvedBy?: unknown;
    score?: number | null;
    correctCount?: number | null;
    wrongCount?: number | null;
    unattemptedCount?: number | null;
    subjectStats?: unknown;
    topicStats?: unknown;
    percentile?: number | null;
    estimatedRank?: number | null;
    save: () => Promise<unknown>;
  },
  result: ReturnType<typeof scoreAttempt>,
) {
  const now = new Date();
  // Instant results: submit is finalized/approved — no examiner gate.
  attempt.status = "approved";
  attempt.submittedAt = now;
  attempt.approvedAt = now;
  attempt.approvedBy = undefined;
  attempt.score = result.score;
  attempt.correctCount = result.correctCount;
  attempt.wrongCount = result.wrongCount;
  attempt.unattemptedCount = result.unattemptedCount;
  attempt.subjectStats = result.subjectStats;
  attempt.topicStats = {
    topics: result.topicStats,
    weakTopics: result.weakTopics,
    strongTopics: result.strongTopics,
    improvements: result.improvements,
    partialCount: result.partialCount,
  };
  attempt.percentile = result.percentile;
  attempt.estimatedRank = result.estimatedRank;
}

/** Score + immediately release results for an in-progress attempt. */
export async function finalizeInProgressAttempt(attemptId: string) {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.status !== "in_progress") {
    return attempt;
  }

  const paper = await getPaper(attempt.year);
  if (!paper) {
    const now = new Date();
    attempt.status = "approved";
    attempt.submittedAt = now;
    attempt.approvedAt = now;
    attempt.approvedBy = undefined;
    await attempt.save();
    return attempt;
  }

  const qids = attempt.answers.map((a: { questionId: unknown }) => a.questionId);
  const keys = attempt.answers
    .map((a: { questionKey?: string }) => a.questionKey)
    .filter(Boolean) as string[];
  const questions = await Question.find({
    $or: [
      { _id: { $in: qids } },
      ...(keys.length ? [{ questionKey: { $in: keys } }] : []),
    ],
  }).lean();
  type QLean = {
    _id: unknown;
    questionKey?: string;
    number?: number;
    subject?: string;
    topic?: string;
    correctOption?: string;
    correctOptions?: string[];
    multiCorrect?: boolean;
  };
  const qList = questions as QLean[];
  const byId = Object.fromEntries(qList.map((q) => [String(q._id), q]));
  const byKey = Object.fromEntries(
    qList.filter((q) => q.questionKey).map((q) => [q.questionKey!, q]),
  );

  // Remap stale ObjectIds onto live docs via questionKey before scoring.
  for (const a of attempt.answers as Array<{
    questionId: unknown;
    questionKey?: string;
  }>) {
    if (byId[String(a.questionId)]) continue;
    const live = a.questionKey ? byKey[a.questionKey] : undefined;
    if (live) a.questionId = live._id;
  }
  attempt.markModified("answers");

  const scoreById: Record<string, QLean> = {};
  for (const a of attempt.answers as Array<{
    questionId: unknown;
    questionKey?: string;
  }>) {
    const q =
      byId[String(a.questionId)] ||
      (a.questionKey ? byKey[a.questionKey] : undefined);
    if (q) scoreById[String(a.questionId)] = q;
  }

  const result = scoreAttempt(
    buildScoreInput(attempt.answers as AnswerLike[], scoreById),
    paper.candidate_count,
  );
  applyScoreResult(attempt, result);
  await attempt.save();
  return attempt;
}

/** Score + immediately release results (manual student submit). */
export async function finalizeAndReleaseAttempt(attemptId: string) {
  return finalizeInProgressAttempt(attemptId);
}
