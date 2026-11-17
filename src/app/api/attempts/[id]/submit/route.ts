import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Attempt } from "@/lib/models";
import { parseOptionList } from "@/lib/multi-correct";
import {
  applyAnswersToAttempt,
  filterAllowedAnswerUpdates,
} from "@/lib/server-attempt-limits";
import { finalizeInProgressAttempt } from "@/lib/finalize-attempt";

const answerSchema = z.object({
  questionId: z.string().min(1).optional(),
  questionKey: z.string().min(1).optional(),
  selectedOption: z.enum(["1", "2", "3", "4"]).nullable().optional(),
  selectedOptions: z.array(z.enum(["1", "2", "3", "4"])).optional(),
  status: z.enum(["not_attempted", "attempted", "marked"]),
}).refine((v) => Boolean(v.questionId || v.questionKey), {
  message: "questionId or questionKey required",
});

const schema = z.object({
  answers: z.array(answerSchema).optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Final submit. Optionally merges any still-pending client answers so a
 * failed/late checkpoint cannot orphan selections as "Unattempted".
 */
export async function POST(req: Request, { params }: Params) {
  await connectDb();
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: z.infer<typeof schema> = {};
  try {
    const text = await req.text();
    if (text) body = schema.parse(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Invalid submit payload" }, { status: 400 });
  }

  const existing = await Attempt.findById(id);
  if (!existing || String(existing.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "in_progress") {
    return NextResponse.json(
      {
        error: "Already submitted",
        attemptId: id,
        status: existing.status,
        resultsUrl: `/results/${id}`,
      },
      { status: 409 },
    );
  }

  let merged = 0;
  if (body.answers?.length) {
    const normalizedIncoming = body.answers.map((item) => {
      let status = item.status;
      let selectedOptions = parseOptionList(
        item.selectedOptions?.length
          ? item.selectedOptions
          : item.selectedOption
            ? [item.selectedOption]
            : [],
      );
      if (status === "not_attempted") {
        selectedOptions = [];
      } else if (selectedOptions.length) {
        if (status !== "marked") status = "attempted";
      } else if (status === "marked") {
        selectedOptions = [];
      }
      return {
        questionId: item.questionId,
        questionKey: item.questionKey,
        selectedOption: selectedOptions[0] ?? null,
        selectedOptions,
        status,
      };
    });

    const result = await filterAllowedAnswerUpdates({
      year: existing.year,
      existingAnswers: existing.answers as Array<{
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }>,
      incoming: normalizedIncoming,
    });
    merged = applyAnswersToAttempt(
      existing.answers as Array<{
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }>,
      result.allowed,
    );
    if (merged > 0) {
      existing.markModified("answers");
      existing.checkpointAt = new Date();
      await existing.save();
    }
  }

  const attempt = await finalizeInProgressAttempt(id);
  if (!attempt) {
    return NextResponse.json({ error: "Finalize failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    locked: true,
    released: true,
    merged,
    attemptId: String(attempt._id),
    status: attempt.status,
    score: attempt.score ?? null,
    correctCount: attempt.correctCount ?? null,
    wrongCount: attempt.wrongCount ?? null,
    unattemptedCount: attempt.unattemptedCount ?? null,
    resultsUrl: `/results/${String(attempt._id)}`,
    message: "Submitted. Your marks, review, and rank stats are ready.",
  });
}
