import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition, CompetitionAttempt } from "@/lib/models";
import {
  pickCompetitionQuestions,
  type CompetitionDifficulty,
  type CompetitionScope,
  type CompetitionSize,
} from "@/lib/competition";

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
  const comp = await Competition.findById(id);
  if (!comp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (String(comp.hostId) !== user.id) {
    return NextResponse.json({ error: "Only the host can start" }, { status: 403 });
  }
  if (comp.status !== "open") {
    return NextResponse.json({ error: "Already started" }, { status: 409 });
  }
  if ((comp.members || []).length < 1) {
    return NextResponse.json({ error: "Need at least one member" }, { status: 409 });
  }

  let picked;
  try {
    picked = await pickCompetitionQuestions({
      scope: comp.scope as CompetitionScope,
      difficulty: comp.difficulty as CompetitionDifficulty,
      size: comp.size as CompetitionSize,
      seed: `${comp.inviteCode}:${Date.now()}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not build paper" },
      { status: 409 },
    );
  }

  const questions = picked.map((q, i) => ({
    questionKey: q.id,
    number: i + 1,
    subject: q.subject,
    section: "A",
    topic: q.topic,
    difficulty: q.difficulty,
    stem: q.stem,
    options: q.options,
    correctOption: q.correctOption,
    correctOptions: q.correctOptions,
    multiCorrect: Boolean(q.multiCorrect),
    figureSrc: q.figureSrc ?? null,
    figureKind: q.figureKind ?? null,
    answerEstimated: Boolean(q.answerEstimated),
  }));

  const now = new Date();
  const endsAt = new Date(now.getTime() + comp.durationMin * 60_000);
  comp.questions = questions as typeof comp.questions;
  comp.status = "live";
  comp.startedAt = now;
  comp.endsAt = endsAt;

  const attemptIds: Record<string, string> = {};
  for (const m of comp.members) {
    const attempt = await CompetitionAttempt.create({
      competitionId: comp._id,
      userId: m.userId,
      status: "in_progress",
      startedAt: now,
      endsAt,
      questions,
      answers: questions.map((q) => ({
        questionKey: q.questionKey,
        selectedOption: null,
        selectedOptions: [],
        status: "not_attempted",
      })),
    });
    m.status = "started";
    m.attemptId = attempt._id;
    attemptIds[String(m.userId)] = String(attempt._id);
  }
  await comp.save();

  return NextResponse.json({
    ok: true,
    endsAt: endsAt.toISOString(),
    myAttemptId: attemptIds[user.id],
    attemptIds,
  });
}
