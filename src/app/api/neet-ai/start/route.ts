import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import {
  loadNeetAiBank,
  pickNeetAiSequence,
  topicMockDurationMinutes,
  listNeetAiCatalog,
} from "@/lib/neet-ai";

const schema = z.object({
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  sequence: z.number().int().min(1).max(200).optional(),
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

  const bank = await loadNeetAiBank(body.difficulty);
  if (!bank) {
    return NextResponse.json({ error: "NEET AI bank not found" }, { status: 404 });
  }

  const catalog = await listNeetAiCatalog();
  const entry = catalog.find((c) => c.difficulty === body.difficulty);
  const sequence = body.sequence ?? 1;
  const picked = pickNeetAiSequence(bank, sequence);
  if (!picked) {
    return NextResponse.json(
      {
        error: `NEET AI ${body.difficulty} mock ${sequence} is not available (have ${entry?.packs ?? 0} packs of ${bank.packSize}).`,
        availableSequences: entry?.sequences ?? [],
        poolSize: bank.questions.length,
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
    difficulty: body.difficulty,
    stem: q.stem,
    options: q.options,
    correctOption: q.correctOption,
    correctOptions: q.correctOptions,
    multiCorrect: Boolean(q.multiCorrect),
    figureSrc: q.figureSrc ?? null,
    figureKind: q.figureKind ?? null,
    answerEstimated: Boolean(q.answerEstimated),
    solution: q.solution ?? null,
    studyLinks: q.studyLinks ?? null,
  }));

  const attempt = await TopicAttempt.create({
    userId,
    topicId: bank.id,
    subject: "NEET AI",
    topic: `NEET AI ${body.difficulty}`,
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
    availableSequences: entry?.packs ?? 0,
    resultsBase: "/neet-ai/results",
  });
}
