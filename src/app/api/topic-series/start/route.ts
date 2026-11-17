import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import { loadTopicBank, pickTopicQuestions } from "@/lib/topic-series";

const schema = z.object({
  topicId: z.string().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  limit: z.number().int().min(10).max(50).optional(),
});

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const bank = await loadTopicBank(body.topicId);
  if (!bank) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const limit = body.limit ?? 50;
  const picked = pickTopicQuestions(bank, body.difficulty, limit);
  if (picked.length < 10) {
    return NextResponse.json(
      {
        error: `Not enough ${body.difficulty} questions yet (${picked.length}). See topic gaps.`,
        available: picked.length,
      },
      { status: 409 },
    );
  }

  await connectDb();
  const userId = new Types.ObjectId(user.id);
  const durationMin = Math.max(20, Math.round(picked.length * 1.2));
  const endsAt = new Date(Date.now() + durationMin * 60_000);

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

  const attempt = await TopicAttempt.create({
    userId,
    topicId: bank.id,
    subject: bank.subject,
    topic: bank.topic,
    difficulty: body.difficulty,
    status: "in_progress",
    endsAt,
    questions,
    answers: questions.map((q) => ({
      questionKey: q.questionKey,
      selectedOption: null,
      selectedOptions: [],
      status: "not_attempted",
    })),
  });

  return NextResponse.json({
    ok: true,
    attemptId: String(attempt._id),
    count: questions.length,
    endsAt: endsAt.toISOString(),
    durationMin,
    gaps: bank.gaps,
  });
}
