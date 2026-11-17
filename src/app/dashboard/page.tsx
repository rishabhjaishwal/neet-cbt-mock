import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { Attempt } from "@/lib/models";
import { listPapers } from "@/lib/papers";
import { LogoutButton } from "@/components/LogoutButton";
import { StartAttemptButton } from "@/components/StartAttemptButton";
import { InstantLink } from "@/components/InstantLink";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "examiner") redirect("/examiner");
  const params = await searchParams;
  // Parallelize seed+papers with attempts once session is known.
  const [papers, attempts] = await Promise.all([
    listPapers(),
    Attempt.find({ userId: new Types.ObjectId(user.id) })
      .sort({ year: -1, attemptNumber: -1 })
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

  const history = attempts.filter(
    (a) =>
      (a.status === "approved" || a.status === "submitted") && a.score != null,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--header)] px-5 py-4 text-white">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Student dashboard
          </h1>
          <p className="text-sm text-blue-100">
            {user.name} · {user.email}
          </p>
        </div>
        <LogoutButton />
      </header>

      {params.submitted && (
        <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Attempt submitted. Marks, question review, and rank stats are available
          immediately — open <strong>View results</strong> for the year you just finished.
        </div>
      )}

      {history.length > 0 && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Multi-attempt analytics
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Completed attempts across years — percentile uses that year&apos;s published
            candidature (modelled, not official NTA rank).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">%ile</th>
                  <th className="px-3 py-2">Est. rank</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={String(a._id)} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{a.year}</td>
                    <td className="px-3 py-2">{a.attemptNumber ?? 1}</td>
                    <td className="px-3 py-2">{a.score}</td>
                    <td className="px-3 py-2">{a.percentile}</td>
                    <td className="px-3 py-2">
                      {a.estimatedRank?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <InstantLink
                        href={`/results/${String(a._id)}`}
                        className="cbt-btn cbt-btn-sm cbt-btn-secondary font-semibold text-[var(--cbt-accent)]"
                      >
                        Open
                      </InstantLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length >= 2 && (
            <div className="mt-4 flex h-28 items-end gap-2">
              {[...history].reverse().map((a) => {
                const h = Math.max(8, Math.round(((a.score ?? 0) + 180) / 900 * 100));
                return (
                  <div key={String(a._id)} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full max-w-[48px] rounded-t bg-[var(--cbt-accent)]"
                      style={{ height: `${h}%` }}
                      title={`${a.year}: ${a.score}`}
                    />
                    <span className="text-[10px] text-slate-500">{a.year}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="mb-8 rounded-xl border border-sky-200 bg-sky-50/60 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Topic-wise mock series
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Drill Easy / Medium / Hard by subject topic — same analysis + AI solution stack as
          full papers.
        </p>
        <InstantLink href="/topic-series" className="cbt-btn cbt-btn-primary mt-3 inline-flex">
          Open topic series
        </InstantLink>
      </section>

      <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
        Choose a year (last 10 years)
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
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
                <tr key={p.year} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{p.year}</td>
                  <td className="px-4 py-3">
                    <div>{p.title}</div>
                    <div className="text-xs text-slate-500">
                      {p.total_questions} Q · attempt {p.attempt_limit} ·{" "}
                      {p.candidate_count.toLocaleString()} candidates
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.duration_minutes} min</td>
                  <td className="px-4 py-3 capitalize">
                    {a?.status?.replace("_", " ") ?? "Not started"}
                    {a?.attemptNumber ? (
                      <div className="text-xs text-slate-500">Attempt #{a.attemptNumber}</div>
                    ) : null}
                    {(a?.status === "approved" || a?.status === "submitted") &&
                      a.score != null && (
                      <div className="text-xs text-emerald-700">
                        Score {a.score} · ~percentile {a.percentile} · rank ~
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
    </main>
  );
}
