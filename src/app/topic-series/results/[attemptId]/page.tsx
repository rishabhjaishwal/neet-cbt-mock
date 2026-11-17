import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import { buildLearningAid } from "@/lib/learning-aid";
import {
  isMultiCorrectQuestion,
  resolveCorrectOptions,
  scoreSelection,
} from "@/lib/multi-correct";
import { QuestionReviewList, type ReviewItem } from "@/components/QuestionReviewList";
import { ResultsMetrics } from "@/components/ResultsMetrics";
import { InstantLink } from "@/components/InstantLink";

export default async function TopicResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const { attemptId } = await params;
  if (!Types.ObjectId.isValid(attemptId)) redirect("/topic-series");

  await connectDb();
  const attempt = await TopicAttempt.findById(attemptId).lean();
  if (!attempt || String(attempt.userId) !== user.id) redirect("/topic-series");
  if (attempt.status === "in_progress") redirect(`/topic-series/exam/${attemptId}`);

  const ansByKey = Object.fromEntries(
    (attempt.answers as Array<{
      questionKey: string;
      selectedOption?: string | null;
      selectedOptions?: string[];
      status: string;
    }>).map((a) => [a.questionKey, a]),
  );

  const reviewItems: ReviewItem[] = (
    attempt.questions as Array<{
      questionKey: string;
      number: number;
      subject: string;
      section?: string;
      topic: string;
      stem: string;
      options: Record<string, string>;
      correctOption?: string;
      correctOptions?: string[];
      multiCorrect?: boolean;
      figureSrc?: string | null;
      figureKind?: string | null;
      answerEstimated?: boolean;
    }>
  ).map((q) => {
    const a = ansByKey[q.questionKey];
    const correct = resolveCorrectOptions({
      correctOption: q.correctOption,
      correctOptions: q.correctOptions,
    });
    const multi = isMultiCorrectQuestion({
      multiCorrect: q.multiCorrect,
      correctOptions: correct,
      correctOption: q.correctOption,
    });
    const picked =
      a?.selectedOptions?.length
        ? a.selectedOptions
        : a?.selectedOption
          ? [a.selectedOption]
          : [];
    const selected =
      a?.status === "not_attempted" && picked.length === 0 ? [] : picked;
    const { marks, outcome } = scoreSelection(selected, correct, multi);
    const learning = buildLearningAid({
      number: q.number,
      subject: q.subject,
      section: q.section || "A",
      topic: q.topic,
      stem: q.stem,
      options: q.options || {},
      correct,
      multiCorrect: multi,
      answerEstimated: Boolean(q.answerEstimated),
    });
    return {
      id: q.questionKey,
      number: q.number,
      subject: q.subject,
      section: q.section || "A",
      topic: q.topic,
      stem: q.stem,
      options: q.options || {},
      selected,
      correct,
      outcome,
      marks,
      multiCorrect: multi,
      figureSrc: q.figureSrc ?? null,
      figureKind: q.figureKind ?? null,
      needsFigure: /figure|diagram|as shown/i.test(q.stem),
      learning,
    } satisfies ReviewItem;
  });

  const topicBundle = (attempt.topicStats || {}) as {
    topics?: Array<{
      topic: string;
      subject: string;
      correct: number;
      wrong: number;
      unattempted: number;
      partial?: number;
      accuracy: number;
    }>;
    weakTopics?: string[];
    strongTopics?: string[];
    improvements?: string[];
  };
  const subjectStats = (attempt.subjectStats || {}) as Record<
    string,
    {
      correct: number;
      wrong: number;
      unattempted: number;
      partial?: number;
      accuracy: number;
    }
  >;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm font-semibold text-[var(--cbt-accent)]">
        <InstantLink href="/topic-series" className="hover:underline">
          ← Topic series
        </InstantLink>
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
        {attempt.subject} · {attempt.topic}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {attempt.difficulty} mock
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Score", String(attempt.score ?? "—")],
          ["Correct", String(attempt.correctCount ?? "—")],
          ["Wrong", String(attempt.wrongCount ?? "—")],
          ["Unattempted", String(attempt.unattemptedCount ?? "—")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {(topicBundle.improvements?.length || 0) > 0 && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Improvements
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {topicBundle.improvements!.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        <ResultsMetrics
          subjectStats={subjectStats}
          topicStats={topicBundle.topics ?? []}
          weakTopics={topicBundle.weakTopics ?? []}
          strongTopics={topicBundle.strongTopics ?? []}
        />
      </div>

      <QuestionReviewList items={reviewItems} />
    </main>
  );
}
