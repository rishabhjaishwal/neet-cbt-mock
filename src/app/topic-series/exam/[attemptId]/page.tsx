import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import { TopicQuizCbt } from "@/components/TopicQuizCbt";

export default async function TopicExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const { attemptId } = await params;
  if (!Types.ObjectId.isValid(attemptId)) redirect("/topic-series");

  await connectDb();
  const attempt = await TopicAttempt.findById(attemptId).lean();
  if (!attempt || String(attempt.userId) !== user.id) redirect("/topic-series");
  if (attempt.status !== "in_progress") redirect(`/topic-series/results/${attemptId}`);

  const ansByKey = Object.fromEntries(
    (attempt.answers as Array<{
      questionKey: string;
      selectedOption?: string | null;
      selectedOptions?: string[];
      status: string;
    }>).map((a) => [a.questionKey, a]),
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

  const seqLabel =
    typeof attempt.sequenceLabel === "string" && attempt.sequenceLabel
      ? attempt.sequenceLabel
      : null;
  const seqRange =
    typeof attempt.sequenceFrom === "number" &&
    typeof attempt.sequenceTo === "number"
      ? `Q${attempt.sequenceFrom}–${attempt.sequenceTo}`
      : null;
  const title = [
    attempt.subject,
    attempt.topic,
    attempt.difficulty,
    seqLabel,
    seqRange,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TopicQuizCbt
      attemptId={attemptId}
      title={title}
      endsAt={new Date(attempt.endsAt).toISOString()}
      questions={questions}
    />
  );
}
