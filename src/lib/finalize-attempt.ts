import { Attempt, Question } from "./models";
import { getPaper } from "./papers";
import { scoreAttempt } from "./scoring";
import { isMultiCorrectQuestion, resolveCorrectOptions } from "./multi-correct";

/** Score + lock an in-progress attempt (timer expiry / resume cleanup). */
export async function finalizeInProgressAttempt(attemptId: string) {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.status !== "in_progress") {
    return attempt;
  }

  const paper = await getPaper(attempt.year);
  if (!paper) {
    attempt.status = "submitted";
    attempt.submittedAt = new Date();
    await attempt.save();
    return attempt;
  }

  const qids = attempt.answers.map((a: { questionId: unknown }) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));

  const result = scoreAttempt(
    attempt.answers.map(
      (a: {
        questionId: unknown;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }) => {
        const q = byId[String(a.questionId)] as
          | {
              number?: number;
              subject?: string;
              topic?: string;
              correctOption?: string;
              correctOptions?: string[];
              multiCorrect?: boolean;
            }
          | undefined;
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
      },
    ),
    paper.candidate_count,
  );

  attempt.status = "submitted";
  attempt.submittedAt = new Date();
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
  await attempt.save();
  return attempt;
}
