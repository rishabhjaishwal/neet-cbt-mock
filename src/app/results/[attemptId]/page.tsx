import Link from "next/link";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { getPaper } from "@/lib/papers";
import { scoreBands } from "@/lib/rank";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  await ensureSeeded();
  const { attemptId } = await params;
  if (!Types.ObjectId.isValid(attemptId)) redirect("/dashboard");

  const attempt = await Attempt.findById(attemptId).lean();
  if (!attempt) redirect("/dashboard");
  if (user.role === "student" && String(attempt.userId) !== user.id) {
    redirect("/dashboard");
  }
  if (user.role === "student" && attempt.status !== "approved") {
    redirect("/dashboard?submitted=1");
  }

  const paper = await getPaper(attempt.year);
  const subjectStats = (attempt.subjectStats ?? {}) as Record<
    string,
    { correct: number; wrong: number; unattempted: number; accuracy: number }
  >;
  const topicBundle = (attempt.topicStats ?? {}) as {
    weakTopics?: string[];
    improvements?: string[];
  };
  const bands = scoreBands(paper?.candidate_count ?? 2_000_000);
  const peerHistory =
    user.role === "student"
      ? await Attempt.find({
          userId: attempt.userId,
          status: "approved",
          score: { $ne: null },
        })
          .sort({ year: 1, attemptNumber: 1 })
          .lean()
      : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={user.role === "examiner" ? "/examiner" : "/dashboard"}
        className="text-sm text-[var(--cbt-accent)]"
      >
        ← Back
      </Link>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--header)]">
        Results — NEET {attempt.year}
      </h1>
      <p className="text-slate-600">
        {paper?.title}
        {attempt.attemptNumber ? ` · Attempt #${attempt.attemptNumber}` : ""}
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
          ["Marking", "+4 / −1 / 0"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
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
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Your attempt history
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {peerHistory.map((a) => (
              <li key={String(a._id)}>
                <Link href={`/results/${String(a._id)}`} className="text-[var(--cbt-accent)]">
                  {a.year} #{a.attemptNumber ?? 1}
                </Link>
                : score {a.score} · {a.percentile}%ile · rank ~
                {a.estimatedRank?.toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Subject-wise accuracy
        </h2>
        <div className="mt-3 space-y-2">
          {Object.entries(subjectStats).map(([subject, s]) => (
            <div key={subject} className="flex items-center justify-between text-sm">
              <span className="font-medium">{subject}</span>
              <span>
                {s.accuracy}% · C {s.correct} / W {s.wrong} / U {s.unattempted}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Weak topics
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(topicBundle.weakTopics?.length
            ? topicBundle.weakTopics
            : ["No clear weak-topic signal from this attempt."]
          ).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          What to improve
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(topicBundle.improvements ?? []).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {user.role === "examiner" && (
        <p className="mt-6 text-sm">
          <Link
            href={`/examiner/attempts/${String(attempt._id)}`}
            className="font-semibold text-[var(--cbt-accent)]"
          >
            Open examiner review (per-question)
          </Link>
        </p>
      )}
    </main>
  );
}
