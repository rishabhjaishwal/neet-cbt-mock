import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { CompetitionAttempt } from "@/lib/models";
import { mapQuestionsForExamView } from "@/lib/exam-secrets";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await connectDb();
  const attempt = await CompetitionAttempt.findById(id).lean();
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const revealKeys = attempt.status === "submitted";
  const questions = mapQuestionsForExamView(
    (attempt.questions || []) as Array<Record<string, unknown>>,
    revealKeys,
  );

  const res = NextResponse.json({
    ok: true,
    attempt: {
      id: String(attempt._id),
      competitionId: String(attempt.competitionId),
      status: attempt.status,
      endsAt: attempt.endsAt,
      score: attempt.score ?? null,
      questions,
      answers: attempt.answers,
      currentQuestionIndex: attempt.currentQuestionIndex ?? 0,
    },
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
