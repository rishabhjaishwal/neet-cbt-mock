import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { getPaper, getQuestionsForStudent } from "@/lib/papers";
import { ExamCbt } from "@/components/ExamCbt";

export default async function ExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const { attemptId } = await params;
  if (!Types.ObjectId.isValid(attemptId)) redirect("/dashboard");

  const [, attempt] = await Promise.all([
    ensureSeeded(),
    Attempt.findById(attemptId).lean(),
  ]);
  if (!attempt || String(attempt.userId) !== user.id) redirect("/dashboard");
  if (attempt.status !== "in_progress") {
    if (attempt.score != null || attempt.status === "approved" || attempt.status === "submitted") {
      redirect(`/results/${attemptId}`);
    }
    redirect("/dashboard");
  }

  const [paper, mdQuestions] = await Promise.all([
    getPaper(attempt.year),
    getQuestionsForStudent(attempt.year),
  ]);
  if (!paper || !mdQuestions.length) redirect("/dashboard");

  const byKey = Object.fromEntries(mdQuestions.map((q) => [q.questionKey, q]));
  const byId = Object.fromEntries(mdQuestions.map((q) => [q.id, q]));

  const merged = attempt.answers
    .map(
      (a: {
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }) => {
        const q =
          (a.questionKey ? byKey[a.questionKey] : undefined) ||
          byId[String(a.questionId)];
        if (!q) return null;
        const selectedOptions =
          Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0
            ? [...a.selectedOptions]
            : a.selectedOption
              ? [a.selectedOption]
              : [];
        return {
          id: q.id,
          questionKey: q.questionKey,
          number: q.number,
          subject: q.subject,
          section: q.section,
          topic: q.topic,
          stem: q.stem,
          options: (q.options ?? {}) as Record<string, string>,
          selectedOption: selectedOptions[0] ?? null,
          selectedOptions,
          status: a.status as "not_attempted" | "attempted" | "marked",
          multiCorrect: Boolean(q.multiCorrect),
          figureSrc: q.figureSrc ?? null,
          figureKind: q.figureKind ?? null,
          needsFigure:
            /see figure|as shown in (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|as shown in figure|shown in figure|given figures|above diagram|following circuit|circuit (diagram )?shown|from the given figure|figure below/i.test(
              q.stem,
            ),
        };
      },
    )
    .filter(Boolean)
    .sort(
      (
        a: { number: number; subject?: string } | null,
        b: { number: number; subject?: string } | null,
      ) => {
        const order = { Physics: 0, Chemistry: 1, Biology: 2 } as Record<string, number>;
        const as = order[a!.subject ?? ""] ?? 9;
        const bs = order[b!.subject ?? ""] ?? 9;
        if (as !== bs) return as - bs;
        return a!.number - b!.number;
      },
    ) as Array<{
      id: string;
      questionKey: string;
      number: number;
      subject: string;
      section: string;
      topic: string;
      stem: string;
      options: Record<string, string>;
      selectedOption: string | null;
      selectedOptions: string[];
      status: "not_attempted" | "attempted" | "marked";
      multiCorrect: boolean;
      figureSrc: string | null;
      figureKind: string | null;
      needsFigure: boolean;
    }>;

  return (
    <ExamCbt
      attemptId={String(attempt._id)}
      year={attempt.year}
      title={paper.title}
      endsAt={new Date(attempt.endsAt).toISOString()}
      questions={merged}
      attemptLimit={paper.attempt_limit}
      totalQuestions={paper.total_questions}
      initialScreenSwitchCount={attempt.screenSwitchCount ?? 0}
      initialQuestionIndex={attempt.currentQuestionIndex ?? 0}
      initialSubjectFilter={
        (attempt.subjectFilter as "ALL" | "Physics" | "Chemistry" | "Biology") ?? "ALL"
      }
      initialSectionFilter={(attempt.sectionFilter as "ALL" | "A" | "B") ?? "ALL"}
      initialCheckpointAt={
        attempt.checkpointAt ? new Date(attempt.checkpointAt).toISOString() : null
      }
    />
  );
}
