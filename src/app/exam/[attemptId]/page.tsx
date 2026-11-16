import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, Question } from "@/lib/models";
import { getPaper } from "@/lib/papers";
import { ExamCbt } from "@/components/ExamCbt";

export default async function ExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  await ensureSeeded();
  const { attemptId } = await params;
  if (!Types.ObjectId.isValid(attemptId)) redirect("/dashboard");

  const attempt = await Attempt.findById(attemptId).lean();
  if (!attempt || String(attempt.userId) !== user.id) redirect("/dashboard");
  if (attempt.status !== "in_progress") redirect("/dashboard?submitted=1");

  const paper = await getPaper(attempt.year);
  if (!paper) redirect("/dashboard");

  const qids = attempt.answers.map((a: { questionId: unknown }) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));

  const merged = attempt.answers
    .map((a: {
      questionId: unknown;
      selectedOption?: string | null;
      selectedOptions?: string[];
      status: string;
    }) => {
      const q = byId[String(a.questionId)];
      if (!q) return null;
      const selectedOptions =
        Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0
          ? [...a.selectedOptions]
          : a.selectedOption
            ? [a.selectedOption]
            : [];
      return {
        id: String(q._id),
        number: q.number,
        subject: q.subject,
        section: q.section,
        topic: q.topic,
        stem: q.stem,
        options: (q.options ?? {}) as Record<string, string>,
        selectedOption: selectedOptions[0] ?? null,
        selectedOptions,
        status: a.status as "not_attempted" | "attempted" | "marked",
        multiCorrect: Boolean((q as { multiCorrect?: boolean }).multiCorrect),
        figureSrc: (q as { figureSrc?: string }).figureSrc ?? null,
        figureKind: (q as { figureKind?: string }).figureKind ?? null,
        needsFigure: /see figure|as shown in (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|as shown in figure|shown in figure|given figures/i.test(
          q.stem,
        ),
      };
    })
    .filter(Boolean)
    .sort((a: { number: number } | null, b: { number: number } | null) => a!.number - b!.number) as Array<{
    id: string;
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
      initialSubjectFilter={(attempt.subjectFilter as "ALL" | "Physics" | "Chemistry" | "Biology") ?? "ALL"}
      initialSectionFilter={(attempt.sectionFilter as "ALL" | "A" | "B") ?? "ALL"}
      initialCheckpointAt={
        attempt.checkpointAt ? new Date(attempt.checkpointAt).toISOString() : null
      }
    />
  );
}
