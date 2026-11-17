import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition, CompetitionAttempt } from "@/lib/models";
import { buildLearningAid } from "@/lib/learning-aid";
import {
  isMultiCorrectQuestion,
  resolveCorrectOptions,
  scoreSelection,
  type Outcome,
} from "@/lib/multi-correct";
import { QuestionReviewList, type ReviewItem } from "@/components/QuestionReviewList";
import { InstantLink } from "@/components/InstantLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeskShell } from "@/components/DeskShell";
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

export default async function CompetitionResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ page?: string; subject?: string; outcome?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const [{ attemptId }, rawQuery] = await Promise.all([params, searchParams]);
  if (!Types.ObjectId.isValid(attemptId)) redirect("/competitions");

  await connectDb();
  const attempt = await CompetitionAttempt.findById(attemptId).lean();
  if (!attempt || String(attempt.userId) !== user.id) redirect("/competitions");
  if (attempt.status === "in_progress") {
    redirect(`/competitions/exam/${attemptId}`);
  }

  const comp = await Competition.findById(attempt.competitionId).lean();
  const query = parseReviewQuery(rawQuery);
  const basePath = `/competitions/results/${attemptId}`;

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
  const reviewItems = slice.map(({ q }) =>
    outcomeFor(q, ansByKey[q.questionKey]).item,
  );

  const standings = [...(comp?.members || [])]
    .map((m) => ({
      name: m.name,
      score: typeof m.score === "number" ? m.score : null,
      status: m.status,
      isYou: String(m.userId) === user.id,
    }))
    .sort((a, b) => (b.score ?? -9999) - (a.score ?? -9999));

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
    <DeskShell innerClassName="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
          <InstantLink
            href={comp ? `/competitions/${String(comp._id)}` : "/competitions"}
            className="hover:underline"
          >
            ← Lobby
          </InstantLink>
        </p>
        <ThemeToggle />
      </div>
      <h1 className="desk-title mt-2">
        {comp?.title || "Competition results"}
      </h1>
      <p className="desk-kicker">
        {comp?.scope === "ALL" ? "All subjects" : comp?.scope} · {comp?.difficulty} ·{" "}
        {comp?.size} Q · ~{comp?.durationMin} min
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Your score", String(attempt.score ?? "—")],
          ["Correct", String(attempt.correctCount ?? "—")],
          ["Wrong", String(attempt.wrongCount ?? "—")],
          ["Unattempted", String(attempt.unattemptedCount ?? "—")],
        ].map(([k, v]) => (
          <div key={k} className="desk-card desk-card--pad rounded-xl">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--graphite,#243041)]">
              {v}
            </div>
          </div>
        ))}
      </div>

      <section className="desk-card mt-6 rounded-xl p-5">
        <h2 className="desk-section-title">Standings</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {standings.map((m, i) => (
            <li
              key={`${m.name}-${i}`}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="font-semibold text-slate-800">
                #{i + 1} {m.name}
                {m.isYou ? " (you)" : ""}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {typeof m.score === "number" ? m.score : m.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <QuestionReviewList items={reviewItems} toolbar={pager} footer={pager} />
    </DeskShell>
  );
}
