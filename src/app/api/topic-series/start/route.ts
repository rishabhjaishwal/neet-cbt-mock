import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import {
  TOPIC_MOCK_QUESTION_COUNT,
  listTopicSequences,
  loadTopicBank,
  pickTopicSequence,
  topicMockDurationMinutes,
} from "@/lib/topic-series";

const schema = z.object({
  topicId: z.string().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  /** 1-based sequential mock: 1 = Q1–30, 2 = Q31–60, … */
  sequence: z.number().int().min(1).max(200).optional(),
  /** Legacy alias — ignored when sequence is set. */
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

  const poolSize = bank.counts[body.difficulty] ?? 0;
  const available = listTopicSequences(bank.id, body.difficulty, poolSize);
  const sequence = body.sequence ?? 1;
  const picked = pickTopicSequence(
    bank,
    body.difficulty,
    sequence,
    TOPIC_MOCK_QUESTION_COUNT,
  );
  if (!picked) {
    return NextResponse.json(
      {
        error: `Mock ${sequence} is not available for ${body.difficulty} (have ${available.length} sequential mocks of ${TOPIC_MOCK_QUESTION_COUNT}).`,
        availableSequences: available,
        poolSize,
      },
      { status: 409 },
    );
  }

  await connectDb();
  const userId = new Types.ObjectId(user.id);
  const durationMin = topicMockDurationMinutes(picked.questions.length);
  const endsAt = new Date(Date.now() + durationMin * 60_000);

  const questions = picked.questions.map((q, i) => ({
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
    sequence: picked.meta.sequence,
    sequenceLabel: picked.meta.label,
    sequenceFrom: picked.meta.from,
    sequenceTo: picked.meta.to,
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
    sequence: picked.meta.sequence,
    sequenceLabel: picked.meta.label,
    range: { from: picked.meta.from, to: picked.meta.to },
    availableSequences: available.length,
    gaps: bank.gaps,
  });
}
