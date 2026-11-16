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
    .map((a: { questionId: unknown; selectedOption?: string | null; status: string }) => {
      const q = byId[String(a.questionId)];
      if (!q) return null;
      return {
        id: String(q._id),
        number: q.number,
        subject: q.subject,
        section: q.section,
        topic: q.topic,
        stem: q.stem,
        options: (q.options ?? {}) as Record<string, string>,
        selectedOption: a.selectedOption ?? null,
        status: a.status as "not_attempted" | "attempted" | "marked",
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
    status: "not_attempted" | "attempted" | "marked";
  }>;

  return (
    <ExamCbt
      attemptId={String(attempt._id)}
      year={attempt.year}
      title={paper.title}
      endsAt={new Date(attempt.endsAt).toISOString()}
      questions={merged}
      initialScreenSwitchCount={attempt.screenSwitchCount ?? 0}
    />
  );
}
