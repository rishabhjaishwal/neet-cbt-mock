import Link from "next/link";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, Question, User } from "@/lib/models";
import { ApproveButton } from "@/components/ApproveButton";

export default async function ExaminerAttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "examiner") redirect("/login");
  await ensureSeeded();
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) redirect("/examiner");

  const attempt = await Attempt.findById(id).lean();
  if (!attempt) redirect("/examiner");
  const student = await User.findById(attempt.userId).lean();

  const qids = attempt.answers.map((a: { questionId: unknown }) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));

  const topicBundle = (attempt.topicStats ?? {}) as { improvements?: string[] };

  const answers = attempt.answers
    .map((a: { questionId: unknown; selectedOption?: string | null; status: string }) => {
      const q = byId[String(a.questionId)];
      if (!q) return null;
      return {
        number: q.number,
        subject: q.subject,
        topic: q.topic,
        stem: q.stem,
        options: (q.options ?? {}) as Record<string, string>,
        correct_option: q.correctOption,
        selected_option: a.selectedOption ?? null,
        status: a.status,
      };
    })
    .filter(Boolean)
    .sort((a: { number: number } | null, b: { number: number } | null) => a!.number - b!.number) as Array<{
    number: number;
    subject: string;
    topic: string;
    stem: string;
    options: Record<string, string>;
    correct_option: string;
    selected_option: string | null;
    status: string;
  }>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/examiner" className="text-sm text-[var(--cbt-accent)]">
        ← Examiner list
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--header)]">
            Attempt review · {attempt.year}
          </h1>
          <p className="text-slate-600">
            {student?.name} ({student?.email})
          </p>
          <p className="mt-2 text-sm">
            Score <strong>{attempt.score}</strong> · Correct {attempt.correctCount} · Wrong{" "}
            {attempt.wrongCount} · Unattempted {attempt.unattemptedCount} · Est. rank{" "}
            {attempt.estimatedRank?.toLocaleString()} ({attempt.percentile} %ile)
          </p>
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Screen switches: <strong>{attempt.screenSwitchCount ?? 0}</strong>
            {(attempt.screenSwitchEvents?.length ?? 0) > 0 && (
              <span className="ml-2 text-xs text-amber-800">
                (latest:{" "}
                {String(
                  (attempt.screenSwitchEvents as { reason?: string }[])[
                    (attempt.screenSwitchEvents as unknown[]).length - 1
                  ]?.reason ?? "—",
                ).replaceAll("_", " ")}
                )
              </span>
            )}
          </p>
        </div>
        {attempt.status === "submitted" ? (
          <div className="space-y-2">
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Legacy submitted row (pre instant-results). Student can already open results if
              scored; optional mark as approved for consistency.
            </div>
            <ApproveButton attemptId={String(attempt._id)} />
          </div>
        ) : (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Results released on submit — student can view marks &amp; review. Approval is not
            required.
          </div>
        )}
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Improvement suggestions</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(topicBundle.improvements ?? []).map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </section>

      <div className="mt-6 space-y-3">
        {answers.map((a) => {
          const attempted = a.selected_option != null && a.selected_option !== "";
          const correct = attempted && a.selected_option === a.correct_option;
          return (
            <article
              key={a.number}
              className={`rounded-xl border p-4 ${
                !attempted
                  ? "border-slate-200 bg-slate-50"
                  : correct
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-rose-200 bg-rose-50/40"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <strong>
                  Q{a.number} · {a.subject}
                </strong>
                <span>
                  {!attempted ? "Unattempted" : correct ? "Correct" : "Incorrect"}
                  {a.status === "marked" ? " · marked" : ""}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{a.stem}</p>
              <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(a.options).map(([k, v]) => (
                  <div
                    key={k}
                    className={`${
                      k === a.correct_option
                        ? "font-semibold text-emerald-800"
                        : k === a.selected_option
                          ? "font-semibold text-rose-800"
                          : ""
                    }`}
                  >
                    ({k}) {v}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Selected: {a.selected_option ?? "—"} · Key: {a.correct_option} · Topic:{" "}
                {a.topic}
              </p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
