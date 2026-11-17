import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition, CompetitionAttempt } from "@/lib/models";
import { scoreAttempt } from "@/lib/scoring";
import {
  isMultiCorrectQuestion,
  resolveCorrectOptions,
} from "@/lib/multi-correct";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDb();
  const attempt = await CompetitionAttempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({
      ok: true,
      score: attempt.score,
      resultsUrl: `/competitions/results/${id}`,
    });
  }

  type QSnap = {
    questionKey: string;
    number?: number;
    subject?: string;
    topic?: string;
    correctOption?: string;
    correctOptions?: string[];
    multiCorrect?: boolean;
  };
  type ASnap = {
    questionKey: string;
    selectedOption?: string | null;
    selectedOptions?: string[];
    status: string;
  };
  const qByKey = Object.fromEntries(
    ((attempt.questions || []) as QSnap[]).map((q) => [q.questionKey, q]),
  );
  const scoreInput = ((attempt.answers || []) as ASnap[]).map((a, i) => {
    const q = qByKey[a.questionKey];
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
      a.status === "not_attempted" && selectedOptions.length === 0
        ? []
        : selectedOptions;
    return {
      questionId: a.questionKey,
      number: q?.number ?? i + 1,
      subject: q?.subject ?? "General",
      topic: q?.topic ?? "General",
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
  attempt.status = "submitted";
  attempt.submittedAt = now;
  attempt.score = result.score;
  attempt.correctCount = result.correctCount;
  attempt.wrongCount = result.wrongCount;
  attempt.unattemptedCount = result.unattemptedCount;
  await attempt.save();

  await Competition.updateOne(
    { _id: attempt.competitionId, "members.userId": attempt.userId },
    {
      $set: {
        "members.$.status": "submitted",
        "members.$.score": result.score,
      },
    },
  );

  return NextResponse.json({
    ok: true,
    score: result.score,
    correctCount: result.correctCount,
    wrongCount: result.wrongCount,
    unattemptedCount: result.unattemptedCount,
    resultsUrl: `/competitions/results/${id}`,
  });
}
