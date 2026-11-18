import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import { mapQuestionsForExamView } from "@/lib/exam-secrets";

type Params = { params: Promise<{ id: string }> };

/** Student attempt payload (no answer keys / solutions while in progress). */
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
  const attempt = await TopicAttempt.findById(id).lean();
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const revealKeys = attempt.status !== "in_progress";
  const questions = mapQuestionsForExamView(
    (attempt.questions || []) as Array<Record<string, unknown>>,
    revealKeys,
  );

  const res = NextResponse.json({
    ok: true,
    attempt: {
      id: String(attempt._id),
      status: attempt.status,
      endsAt: attempt.endsAt,
      score: attempt.score ?? null,
      subject: attempt.subject,
      topic: attempt.topic,
      difficulty: attempt.difficulty,
      sequenceLabel: attempt.sequenceLabel ?? null,
    },
    questions,
    answers: attempt.answers,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
