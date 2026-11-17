import Link from "next/link";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, User } from "@/lib/models";
import { ApproveButton } from "@/components/ApproveButton";
import { DeskShell } from "@/components/DeskShell";
import { QuestionStemMarkdown } from "@/components/QuestionMarkdown";
import { displayQuestionNumber, getPaperQuestionMap } from "@/lib/paper-content";
import { getMdQuestionsWithKeys } from "@/lib/md-paper-store";

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

  const [mdQuestions, paperByKey] = await Promise.all([
    getMdQuestionsWithKeys(attempt.year),
    getPaperQuestionMap(attempt.year).catch(() => new Map()),
  ]);
  const byKey = Object.fromEntries(mdQuestions.map((q) => [q.questionKey, q]));
  const byId = Object.fromEntries(mdQuestions.map((q) => [q.id, q]));

  const topicBundle = (attempt.topicStats ?? {}) as { improvements?: string[] };

  const answers = attempt.answers
    .map(
      (
        a: {
          questionId: unknown;
          questionKey?: string;
          selectedOption?: string | null;
          status: string;
        },
        idx: number,
      ) => {
        const q =
          (a.questionKey ? byKey[a.questionKey] : undefined) ||
          byId[String(a.questionId)];
        if (!q) return null;
        const key = a.questionKey || q.questionKey || "";
        const paperQ = key ? paperByKey.get(key) : undefined;
        return {
          number: displayQuestionNumber(paperQ, q.number, idx),
          subject: paperQ?.subject ?? q.subject,
          topic: paperQ?.topic ?? q.topic,
          stem: paperQ?.stem ?? q.stem,
          options: (paperQ?.options ?? q.options ?? {}) as Record<string, string>,
          correct_option: paperQ?.correctOption ?? q.correctOption,
          selected_option: a.selectedOption ?? null,
          status: a.status,
        };
      },
    )
    .filter(Boolean)
    .sort(
      (a: { number: number } | null, b: { number: number } | null) =>
        a!.number - b!.number,
    ) as Array<{
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
    <DeskShell innerClassName="max-w-5xl">
      <Link
        href="/examiner"
        className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]"
      >
        ← Examiner list
      </Link>
      <h1 className="desk-title mt-3">Attempt review — {attempt.year}</h1>
      <p className="desk-kicker">
        {student?.name} · {student?.email} · status {attempt.status}
        {attempt.score != null ? ` · score ${attempt.score}` : ""}
      </p>

      {attempt.status === "submitted" ? (
        <div className="mt-4">
          <ApproveButton attemptId={String(attempt._id)} />
        </div>
      ) : null}

      {(topicBundle.improvements?.length || 0) > 0 && (
        <section className="desk-card mt-6 rounded-xl p-5">
          <h2 className="desk-section-title">Improvements</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {topicBundle.improvements!.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-4">
        {answers.map((a) => (
          <article
            key={`${a.number}-${a.subject}`}
            className="desk-card review-card rounded-xl p-4"
          >
            <h3 className="font-semibold text-[var(--graphite,#243041)]">
              Q{a.number}. {a.subject} · {a.topic}
            </h3>
            <QuestionStemMarkdown stem={a.stem} className="mt-2" />
            <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              <div>
                Selected: <strong>{a.selected_option ?? "—"}</strong> ({a.status})
              </div>
              <div>
                Correct: <strong>{a.correct_option}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </DeskShell>
  );
}
