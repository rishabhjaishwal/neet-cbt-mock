import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, Question } from "@/lib/models";
import { getPaper } from "@/lib/papers";
import { scoreAttempt } from "@/lib/scoring";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  await ensureSeeded();
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attempt = await Attempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  const paper = await getPaper(attempt.year);
  if (!paper) {
    return NextResponse.json({ error: "Paper missing" }, { status: 500 });
  }

  const qids = attempt.answers.map((a: { questionId: unknown }) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));

  const result = scoreAttempt(
    attempt.answers.map((a: { questionId: unknown; selectedOption?: string | null; status: string }) => {
      const q = byId[String(a.questionId)];
      return {
        questionId: String(a.questionId),
        number: q?.number ?? 0,
        subject: q?.subject ?? "Unknown",
        topic: q?.topic ?? "General",
        correctOption: q?.correctOption ?? "1",
        selectedOption: a.selectedOption ?? null,
        status: a.status as "not_attempted" | "attempted" | "marked",
      };
    }),
    paper.candidate_count,
  );

  attempt.status = "submitted";
  attempt.submittedAt = new Date();
  attempt.score = result.score;
  attempt.correctCount = result.correctCount;
  attempt.wrongCount = result.wrongCount;
  attempt.unattemptedCount = result.unattemptedCount;
  attempt.subjectStats = result.subjectStats;
  attempt.topicStats = {
    topics: result.topicStats,
    weakTopics: result.weakTopics,
    improvements: result.improvements,
  };
  attempt.percentile = result.percentile;
  attempt.estimatedRank = result.estimatedRank;
  await attempt.save();

  return NextResponse.json({
    ok: true,
    locked: true,
    message:
      "Submitted. Your attempt is locked until an examiner reviews and approves the result.",
  });
}
