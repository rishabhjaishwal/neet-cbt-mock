import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition, CompetitionAttempt } from "@/lib/models";
import { TopicQuizCbt } from "@/components/TopicQuizCbt";

export default async function CompetitionExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const { attemptId } = await params;
  if (!Types.ObjectId.isValid(attemptId)) redirect("/competitions");

  await connectDb();
  const attempt = await CompetitionAttempt.findById(attemptId).lean();
  if (!attempt || String(attempt.userId) !== user.id) redirect("/competitions");
  if (attempt.status !== "in_progress") {
    redirect(`/competitions/results/${attemptId}`);
  }

  const comp = await Competition.findById(attempt.competitionId)
    .select("title scope difficulty size durationMin")
    .lean();

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

  const questions = (
    attempt.questions as Array<{
      questionKey: string;
      number: number;
      subject: string;
      section?: string;
      topic: string;
      stem: string;
      options: Record<string, string>;
      multiCorrect?: boolean;
      figureSrc?: string | null;
      figureKind?: string | null;
    }>
  ).map((q) => {
    const a = ansByKey[q.questionKey];
    const selectedOptions =
      a?.selectedOptions?.length
        ? [...a.selectedOptions]
        : a?.selectedOption
          ? [a.selectedOption]
          : [];
    return {
      id: q.questionKey,
      number: q.number,
      subject: q.subject,
      section: q.section || "A",
      topic: q.topic,
      stem: q.stem,
      options: q.options || {},
      selectedOption: selectedOptions[0] ?? null,
      selectedOptions,
      status: (a?.status as "not_attempted" | "attempted" | "marked") || "not_attempted",
      multiCorrect: Boolean(q.multiCorrect),
      figureSrc: q.figureSrc ?? null,
      figureKind: q.figureKind ?? null,
    };
  });

  const title = [
    comp?.title || "Competition",
    comp?.scope === "ALL" ? "All subjects" : comp?.scope,
    comp?.difficulty,
    comp ? `${comp.size}Q` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TopicQuizCbt
      attemptId={attemptId}
      title={title}
      endsAt={new Date(attempt.endsAt).toISOString()}
      questions={questions}
      apiBase="/api/competitions/attempts"
      submitConfirm="Submit this competition attempt?"
    />
  );
}
