import { InstantLink } from "@/components/InstantLink";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { getPaper } from "@/lib/papers";
import { scoreBands } from "@/lib/rank";
import { ResultsMetrics } from "@/components/ResultsMetrics";
import { QuestionReviewList } from "@/components/QuestionReviewList";
import { ReviewPagination } from "@/components/ReviewPagination";
import { getPaperQuestionMap } from "@/lib/paper-content";
import { getMdQuestionsByKeys } from "@/lib/md-paper-store";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeskShell } from "@/components/DeskShell";
import { SectionBCapSummary } from "@/components/SectionBCapSummary";
import { buildAttemptLimitInfo, type RuleQuestion } from "@/lib/attempt-rules";
import {
  buildReviewIndex,
  filterReviewIndex,
  hydrateReviewPage,
  paginateReviewIndex,
  parseReviewQuery,
  REVIEW_PAGE_SIZE,
  type AttemptAnswerLite,
  type DbQuestionLite,
  type ReviewFilterOutcome,
  type ReviewFilterSubject,
} from "@/lib/review-page";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ page?: string; subject?: string; outcome?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const [{ attemptId }, rawQuery] = await Promise.all([params, searchParams]);
  if (!Types.ObjectId.isValid(attemptId)) redirect("/dashboard");

  await ensureSeeded();
  const query = parseReviewQuery(rawQuery);

  const attempt = await Attempt.findById(attemptId).lean();
  if (!attempt) redirect("/dashboard");
  if (user.role === "student" && String(attempt.userId) !== user.id) {
    redirect("/dashboard");
  }
  if (
    user.role === "student" &&
    attempt.status !== "approved" &&
    !(attempt.status === "submitted" && attempt.score != null)
  ) {
    redirect("/dashboard");
  }

  const answers = attempt.answers as AttemptAnswerLite[];
  const basePath = `/results/${attemptId}`;

  const [paper, peerHistory, paperByKey] = await Promise.all([
    getPaper(attempt.year),
    user.role === "student"
      ? Attempt.find({
          userId: attempt.userId,
          status: { $in: ["approved", "submitted"] },
          score: { $ne: null },
        })
          .sort({ year: 1, attemptNumber: 1 })
          .select("_id year attemptNumber score percentile estimatedRank")
          .lean()
      : Promise.resolve([]),
    getPaperQuestionMap(attempt.year).catch(() => new Map()),
  ]);

  const subjectStats = (attempt.subjectStats ?? {}) as Record<
    string,
    {
      correct: number;
      wrong: number;
      unattempted: number;
      partial?: number;
      accuracy: number;
    }
  >;
  const topicBundle = (attempt.topicStats ?? {}) as {
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
  const bands = scoreBands(paper?.candidate_count ?? 2_000_000);

  // Index from paper JSON + denorm answer meta — no 200-doc Mongo stem load.
  const indexAll = buildReviewIndex(answers, paperByKey);
  const subjectCounts = {
    ALL: indexAll.length,
    Physics: indexAll.filter((r) => r.subject === "Physics").length,
    Chemistry: indexAll.filter((r) => r.subject === "Chemistry").length,
    Biology: indexAll.filter((r) => r.subject === "Biology").length,
  } satisfies Record<ReviewFilterSubject, number>;
  const outcomeCounts = {
    ALL: indexAll.length,
    correct: indexAll.filter((r) => r.outcome === "correct").length,
    partial: indexAll.filter((r) => r.outcome === "partial").length,
    wrong: indexAll.filter((r) => r.outcome === "wrong").length,
    unattempted: indexAll.filter((r) => r.outcome === "unattempted").length,
  } satisfies Record<ReviewFilterOutcome, number>;

  const filtered = filterReviewIndex(indexAll, query);
  const pageInfo = paginateReviewIndex(filtered, query.page, REVIEW_PAGE_SIZE);
  const safeQuery = { ...query, page: pageInfo.page };

  // O(k) hydrate — only the current results page keys, not the full year map.
  const pageKeys = pageInfo.slice
    .map((r) => r.questionKey)
    .filter((k): k is string => Boolean(k));
  const pageQuestions = await getMdQuestionsByKeys(attempt.year, pageKeys, true);
  const byId = Object.fromEntries(
    pageQuestions.map((q) => [
      q.id,
      {
        questionKey: q.questionKey,
        number: q.number,
        subject: q.subject,
        section: q.section,
        topic: q.topic,
        stem: q.stem,
        options: q.options,
        correctOption: q.correctOption,
        correctOptions: q.correctOptions,
        multiCorrect: q.multiCorrect,
        answerEstimated: q.answerEstimated,
        figureSrc: q.figureSrc,
        figureKind: q.figureKind,
      } satisfies DbQuestionLite,
    ]),
  );
  const byKey = Object.fromEntries(
    pageQuestions.map((q) => [
      q.questionKey,
      {
        questionKey: q.questionKey,
        number: q.number,
        subject: q.subject,
        section: q.section,
        topic: q.topic,
        stem: q.stem,
        options: q.options,
        correctOption: q.correctOption,
        correctOptions: q.correctOptions,
        multiCorrect: q.multiCorrect,
        answerEstimated: q.answerEstimated,
        figureSrc: q.figureSrc,
        figureKind: q.figureKind,
      } satisfies DbQuestionLite,
    ]),
  );

  const reviewItems = hydrateReviewPage({
    answers,
    slice: pageInfo.slice,
    paperByKey,
    byId,
    byKey,
  });

  const ruleQuestions: RuleQuestion[] = answers.map((a, i) => {
    const paperQ = a.questionKey ? paperByKey.get(a.questionKey) : undefined;
    const selectedOptions = Array.isArray(a.selectedOptions) ? a.selectedOptions : [];
    const selectedOption = a.selectedOption ?? selectedOptions[0] ?? null;
    const status =
      a.status === "marked" || a.status === "attempted" || a.status === "not_attempted"
        ? a.status
        : selectedOption || selectedOptions.length
          ? "attempted"
          : "not_attempted";
    return {
      id: String(a.questionId ?? a.questionKey ?? i),
      number: paperQ?.number ?? a.number ?? i + 1,
      subject: paperQ?.subject ?? a.subject ?? "Unknown",
      section: paperQ?.section ?? a.section ?? "A",
      selectedOption,
      selectedOptions,
      status,
    };
  });
  const sectionBCaps = buildAttemptLimitInfo(
    ruleQuestions,
    paper?.attempt_limit ?? Math.min(180, ruleQuestions.length || 180),
    paper?.total_questions ?? ruleQuestions.length,
  ).sectionBCaps;

  const pager = (
    <ReviewPagination
      basePath={basePath}
      query={safeQuery}
      total={pageInfo.total}
      totalPages={pageInfo.totalPages}
      pageSize={pageInfo.pageSize}
      subjectCounts={subjectCounts}
      outcomeCounts={outcomeCounts}
    />
  );

  return (
    <DeskShell innerClassName="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <InstantLink
          href={user.role === "examiner" ? "/examiner" : "/dashboard"}
          className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]"
        >
          ← Back
        </InstantLink>
        <ThemeToggle />
      </div>
      <h1 className="desk-title mt-3">
        Results — {attempt.year === 2026 ? "RE-NEET 2026" : `NEET ${attempt.year}`}
      </h1>
      <p className="desk-kicker">
        {paper?.title}
        {attempt.attemptNumber ? ` · Attempt #${attempt.attemptNumber}` : ""}
        {" · "}
        Answer keys and solutions are available below (exam View paper stayed
        question-only).
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Score", `${attempt.score}/720`],
          ["Correct", String(attempt.correctCount)],
          ["Wrong", String(attempt.wrongCount)],
          ["Unattempted", String(attempt.unattemptedCount)],
          ["Est. percentile", String(attempt.percentile)],
          ["Est. rank", attempt.estimatedRank?.toLocaleString() ?? "—"],
          ["Candidates", paper?.candidate_count.toLocaleString() ?? "—"],
          ["Marking", "+4 / −1 / 0 (+partial multi)"],
        ].map(([k, v]) => (
          <div key={k} className="desk-card desk-card--pad rounded-xl">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--graphite,#243041)]">
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <ResultsMetrics
          subjectStats={subjectStats}
          topicStats={topicBundle.topics ?? []}
          weakTopics={topicBundle.weakTopics ?? []}
          strongTopics={topicBundle.strongTopics ?? []}
        />
      </div>

      <SectionBCapSummary caps={sectionBCaps} />

      <section className="desk-card mt-8 rounded-xl p-5">
        <h2 className="desk-section-title">
          Rank realism vs {attempt.year} candidature
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Modelled score bands using {paper?.candidate_count.toLocaleString()} candidates —
          not an official NTA rank list.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Est. %ile</th>
                <th className="px-3 py-2">Est. rank</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => (
                <tr
                  key={b.score}
                  className={`border-t border-slate-100 ${
                    attempt.score != null && Math.abs((attempt.score as number) - b.score) <= 25
                      ? "bg-blue-50 font-semibold"
                      : ""
                  }`}
                >
                  <td className="px-3 py-2">{b.score}</td>
                  <td className="px-3 py-2">{b.percentile}</td>
                  <td className="px-3 py-2">{b.estimatedRank.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {peerHistory.length > 1 && (
        <section className="desk-card mt-6 rounded-xl p-5">
          <h2 className="desk-section-title">Your attempt history</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {peerHistory.map((a) => (
              <li key={String(a._id)}>
                <InstantLink href={`/results/${String(a._id)}`} className="text-[var(--cbt-accent)]">
                  {a.year} #{a.attemptNumber ?? 1}
                </InstantLink>
                : score {a.score} · {a.percentile}%ile · rank ~
                {a.estimatedRank?.toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="desk-card mt-6 rounded-xl p-5">
        <h2 className="desk-section-title">What to improve</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(topicBundle.improvements ?? []).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <QuestionReviewList items={reviewItems} toolbar={pager} footer={pager} />

      {user.role === "examiner" && (
        <p className="mt-6 text-sm">
          <InstantLink
            href={`/examiner/attempts/${String(attempt._id)}`}
            className="font-semibold text-[var(--ink-blue,#1e4d7b)]"
          >
            Open examiner review (per-question)
          </InstantLink>
        </p>
      )}
    </DeskShell>
  );
}
