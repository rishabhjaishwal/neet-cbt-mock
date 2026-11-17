import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import { parseOptionList } from "@/lib/multi-correct";
import { scoreAttempt } from "@/lib/scoring";
import { isMultiCorrectQuestion, resolveCorrectOptions } from "@/lib/multi-correct";

const answerSchema = z.object({
  questionKey: z.string().min(1),
  selectedOption: z.enum(["1", "2", "3", "4"]).nullable().optional(),
  selectedOptions: z.array(z.enum(["1", "2", "3", "4"])).optional(),
  status: z.enum(["not_attempted", "attempted", "marked"]),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let incoming: z.infer<typeof answerSchema>[] = [];
  try {
    const text = await req.text();
    if (text) {
      const body = z.object({ answers: z.array(answerSchema).optional() }).parse(JSON.parse(text));
      incoming = body.answers || [];
    }
  } catch {
    return NextResponse.json({ error: "Invalid submit payload" }, { status: 400 });
  }

  await connectDb();
  const attempt = await TopicAttempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      { error: "Already submitted", resultsUrl: `/topic-series/results/${id}` },
      { status: 409 },
    );
  }

  if (incoming.length) {
    const byKey = new Map<string, number>();
    attempt.answers.forEach((a: { questionKey: string }, i: number) => {
      byKey.set(a.questionKey, i);
    });
    for (const item of incoming) {
      const idx = byKey.get(item.questionKey);
      if (idx === undefined) continue;
      let status = item.status;
      let selectedOptions = parseOptionList(
        item.selectedOptions?.length
          ? item.selectedOptions
          : item.selectedOption
            ? [item.selectedOption]
            : [],
      );
      if (status === "not_attempted") selectedOptions = [];
      else if (selectedOptions.length && status !== "marked") status = "attempted";
      const row = attempt.answers[idx] as {
        selectedOption: string | null;
        selectedOptions: string[];
        status: string;
      };
      row.selectedOptions = selectedOptions;
      row.selectedOption = selectedOptions[0] ?? null;
      row.status = status;
    }
    attempt.markModified("answers");
  }

  const qByKey = Object.fromEntries(
    (attempt.questions as Array<{ questionKey: string }>).map((q) => [q.questionKey, q]),
  );

  const scoreInput = (attempt.answers as Array<{
    questionKey: string;
    selectedOption?: string | null;
    selectedOptions?: string[];
    status: string;
  }>).map((a, i) => {
    const q = qByKey[a.questionKey] as {
      number?: number;
      subject?: string;
      topic?: string;
      correctOption?: string;
      correctOptions?: string[];
      multiCorrect?: boolean;
    };
    const correctOptions = resolveCorrectOptions({
      correctOption: q?.correctOption,
      correctOptions: q?.correctOptions,
    });
    const selectedOptions =
      a.selectedOptions && a.selectedOptions.length
        ? a.selectedOptions
        : a.selectedOption
          ? [a.selectedOption]
          : [];
    const picked =
      a.status === "not_attempted" && selectedOptions.length === 0 ? [] : selectedOptions;
    return {
      questionId: a.questionKey,
      number: q?.number ?? i + 1,
      subject: q?.subject ?? attempt.subject,
      topic: q?.topic ?? attempt.topic,
      correctOption: correctOptions.join(",") || "1",
      correctOptions,
      multiCorrect: isMultiCorrectQuestion({
        multiCorrect: q?.multiCorrect,
        correctOptions,
        correctOption: q?.correctOption,
      }),
      selectedOption: picked[0] ?? null,
      selectedOptions: picked,
      status: a.status as "not_attempted" | "attempted" | "marked",
    };
  });

  const result = scoreAttempt(scoreInput, 100_000);
  const now = new Date();
  attempt.status = "approved";
  attempt.submittedAt = now;
  attempt.score = result.score;
  attempt.correctCount = result.correctCount;
  attempt.wrongCount = result.wrongCount;
  attempt.unattemptedCount = result.unattemptedCount;
  attempt.subjectStats = result.subjectStats;
  attempt.topicStats = {
    topics: result.topicStats,
    weakTopics: result.weakTopics,
    strongTopics: result.strongTopics,
    improvements: result.improvements,
    partialCount: result.partialCount,
  };
  await attempt.save();

  return NextResponse.json({
    ok: true,
    attemptId: id,
    status: attempt.status,
    score: attempt.score,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    unattemptedCount: attempt.unattemptedCount,
    resultsUrl: `/topic-series/results/${id}`,
  });
}
