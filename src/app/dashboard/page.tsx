import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { Attempt, TopicAttempt } from "@/lib/models";
import { listPapers } from "@/lib/papers";
import { LogoutButton } from "@/components/LogoutButton";
import { StartAttemptButton } from "@/components/StartAttemptButton";
import { InstantLink } from "@/components/InstantLink";
import { DashboardCharts } from "@/components/DashboardCharts";
import { PaperContentPrefetch } from "@/components/PaperContentPrefetch";
import { toDashPoints } from "@/lib/dashboard-points";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "examiner") redirect("/examiner");
  const params = await searchParams;
  const userOid = new Types.ObjectId(user.id);

  const [papers, attempts, topicAttempts] = await Promise.all([
    listPapers(),
    Attempt.find({ userId: userOid })
      .sort({ year: -1, attemptNumber: -1 })
      .select(
        "year status score percentile estimatedRank attemptNumber wrongCount unattemptedCount correctCount subjectStats submittedAt startedAt",
      )
      .lean(),
    TopicAttempt.find({
      userId: userOid,
      status: { $in: ["submitted", "approved"] },
      score: { $ne: null },
    })
      .sort({ submittedAt: -1 })
      .select(
        "subject topic difficulty score wrongCount unattemptedCount correctCount subjectStats submittedAt startedAt",
      )
      .limit(40)
      .lean(),
  ]);

  const latestByYear: Record<
    number,
    {
      id: string;
      year: number;
      status: string;
      score: number | null;
      percentile: number | null;
      estimated_rank: number | null;
      attemptNumber: number;
    }
  > = {};
  for (const a of attempts) {
    const y = a.year;
    if (latestByYear[y]) continue;
    latestByYear[y] = {
      id: String(a._id),
      year: a.year,
      status: a.status,
      score: a.score ?? null,
      percentile: a.percentile ?? null,
      estimated_rank: a.estimatedRank ?? null,
      attemptNumber: a.attemptNumber ?? 1,
    };
  }

  const scoredPapers = attempts.filter(
    (a) =>
      (a.status === "approved" || a.status === "submitted") && a.score != null,
  );

  const chartPoints = toDashPoints([
    ...scoredPapers.map((a) => ({
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
    ...topicAttempts.map((a) => ({
      id: String(a._id),
      label: `${a.subject} · ${a.topic} (${a.difficulty})`,
      kind: "topic" as const,
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
    })),
  ]);

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <PaperContentPrefetch years={papers.map((p) => p.year)} />
      <div className="desk-shell__inner">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
              NEET CBT Mock
            </p>
            <h1 className="desk-title">Hey, {user.name.split(" ")[0]}</h1>
            <p className="desk-kicker max-w-xl">
              Your notebook desk — track every scored mock, drill topics, and
              open last-10-year papers when you are ready for full CBT.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-xs text-slate-500">{user.email}</p>
            <LogoutButton />
          </div>
        </header>

        <nav className="desk-nav mb-6" aria-label="Dashboard sections">
          <a href="#performance">Performance</a>
          <a href="#topic-mocks">Topic-wise mocks</a>
          <a href="#year-papers">Last 10-year papers</a>
        </nav>

        {params.submitted && (
          <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
            Attempt submitted. Marks and solutions are ready — jump to{" "}
            <strong>Last 10-year papers</strong> and open{" "}
            <strong>View results</strong>.
          </div>
        )}

        <section id="performance" className="mb-10 scroll-mt-6">
          <DashboardCharts points={chartPoints} />
        </section>

        <section id="topic-mocks" className="mb-10 scroll-mt-6">
          <div className="desk-card desk-card--pad relative overflow-hidden">
            <span
              className="desk-sticky-chip desk-sticky-chip--pink absolute right-4 top-4 hidden sm:inline-flex"
              aria-hidden
            >
              Easy / Med / Hard
            </span>
            <h2 className="desk-section-title">Topic-wise mocks</h2>
            <p className="desk-kicker max-w-2xl">
              Short timed drills by subject topic — same AI solution stack and
              charts as full papers, without the 3-hour sit.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <InstantLink
                href="/topic-series"
                className="btn-pencil"
                showPending={false}
              >
                <span className="btn-pencil__lead">Open topic series</span>
                <span className="btn-pencil__tip" aria-hidden />
              </InstantLink>
              <InstantLink
                href="/topic-series"
                className="btn-ink-link"
                showPending={false}
              >
                Browse 17 banks →
              </InstantLink>
            </div>
          </div>
        </section>

        <section id="year-papers" className="scroll-mt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="desk-section-title">Last 10-year papers</h2>
              <p className="desk-kicker">
                Full NTA-style CBT — palette, figures, checkpoint, instant marks.
              </p>
            </div>
            <span className="desk-sticky-chip desk-sticky-chip--butter" aria-hidden>
              2016 → 2025
            </span>
          </div>

          <div className="desk-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Paper</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((p) => {
                    const a = latestByYear[p.year];
                    return (
                      <tr key={p.year} className="border-t border-slate-100/80">
                        <td className="px-4 py-3 font-semibold text-[var(--ink-blue,#1e4d7b)]">
                          {p.year}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.title}</div>
                          <div className="text-xs text-slate-500">
                            {p.total_questions} Q · attempt {p.attempt_limit} ·{" "}
                            {p.candidate_count.toLocaleString()} candidates
                          </div>
                        </td>
                        <td className="px-4 py-3">{p.duration_minutes} min</td>
                        <td className="px-4 py-3 capitalize">
                          {a?.status?.replace("_", " ") ?? "Not started"}
                          {a?.attemptNumber ? (
                            <div className="text-xs text-slate-500">
                              Attempt #{a.attemptNumber}
                            </div>
                          ) : null}
                          {(a?.status === "approved" || a?.status === "submitted") &&
                            a.score != null && (
                              <div className="text-xs text-emerald-700">
                                Score {a.score} · ~%ile {a.percentile} · rank ~
                                {a.estimated_rank?.toLocaleString()}
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            {!a || a.status === "in_progress" ? (
                              <StartAttemptButton year={p.year} />
                            ) : (
                              <>
                                <InstantLink
                                  href={`/results/${a.id}`}
                                  className="cbt-btn cbt-btn-sm cbt-btn-secondary text-sm font-semibold"
                                >
                                  View results
                                </InstantLink>
                                <StartAttemptButton year={p.year} mode="retake" />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
