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
  type Outcome,
} from "@/lib/multi-correct";
import { QuestionReviewList, type ReviewItem } from "@/components/QuestionReviewList";
import { ResultsMetrics } from "@/components/ResultsMetrics";
import { InstantLink } from "@/components/InstantLink";
import { ReviewPagination } from "@/components/ReviewPagination";
import {
  parseReviewQuery,
  REVIEW_PAGE_SIZE,
  type ReviewFilterOutcome,
  type ReviewFilterSubject,
  type ReviewQuery,
} from "@/lib/review-page";

type EmbeddedQ = {
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
};

function outcomeFor(
  q: EmbeddedQ,
  a:
    | {
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }
    | undefined,
): { item: ReviewItem; outcome: Outcome } {
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
    outcome,
    item: {
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
    },
  };
}

export default async function TopicResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ page?: string; subject?: string; outcome?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const [{ attemptId }, rawQuery] = await Promise.all([params, searchParams]);
  if (!Types.ObjectId.isValid(attemptId)) redirect("/topic-series");

  await connectDb();
  const attempt = await TopicAttempt.findById(attemptId).lean();
  if (!attempt || String(attempt.userId) !== user.id) redirect("/topic-series");
  if (attempt.status === "in_progress") redirect(`/topic-series/exam/${attemptId}`);

  const query = parseReviewQuery(rawQuery);
  const basePath = `/topic-series/results/${attemptId}`;

  const ansByKey = Object.fromEntries(
    (
      attempt.answers as Array<{
        questionKey: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }>
    ).map((a) => [a.questionKey, a]),
  );

  const questions = (attempt.questions as EmbeddedQ[])
    .slice()
    .sort((a, b) => a.number - b.number);

  // Light index for filters/counts without building AI solutions yet.
  const index = questions.map((q) => {
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
    const { outcome } = scoreSelection(selected, correct, multi);
    return { q, outcome, subject: q.subject };
  });

  const subjectCounts = {
    ALL: index.length,
    Physics: index.filter((r) => r.subject === "Physics").length,
    Chemistry: index.filter((r) => r.subject === "Chemistry").length,
    Biology: index.filter((r) => r.subject === "Biology").length,
  } satisfies Record<ReviewFilterSubject, number>;
  const outcomeCounts = {
    ALL: index.length,
    correct: index.filter((r) => r.outcome === "correct").length,
    partial: index.filter((r) => r.outcome === "partial").length,
    wrong: index.filter((r) => r.outcome === "wrong").length,
    unattempted: index.filter((r) => r.outcome === "unattempted").length,
  } satisfies Record<ReviewFilterOutcome, number>;

  const filtered = index.filter((r) => {
    if (query.subject !== "ALL" && r.subject !== query.subject) return false;
    if (query.outcome !== "ALL" && r.outcome !== query.outcome) return false;
    return true;
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const safeQuery: ReviewQuery = { ...query, page };
  const slice = filtered.slice(
    (page - 1) * REVIEW_PAGE_SIZE,
    page * REVIEW_PAGE_SIZE,
  );

  // Hydrate solutions only for the visible page.
  const reviewItems = slice.map(({ q }) =>
    outcomeFor(q, ansByKey[q.questionKey]).item,
  );

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

  const pager = (
    <ReviewPagination
      basePath={basePath}
      query={safeQuery}
      total={total}
      totalPages={totalPages}
      pageSize={REVIEW_PAGE_SIZE}
      subjectCounts={subjectCounts}
      outcomeCounts={outcomeCounts}
    />
  );

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8">
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

      <QuestionReviewList items={reviewItems} toolbar={pager} footer={pager} />
    </main>
  );
}
