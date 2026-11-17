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
  currentQuestionIndex: z.number().int().min(0).optional(),
  subjectFilter: z.string().optional(),
  sectionFilter: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Server-side exam checkpoint. Persists answers + navigation.
 * Never accepts or mutates remaining time / endsAt (anti-cheat).
 * Illegal Section B / budget items are rejected individually — the rest still save.
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

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid checkpoint payload" }, { status: 400 });
  }

  const attempt = await Attempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt locked" }, { status: 409 });
  }

  let applied = 0;
  let rejected: Array<{ questionId?: string; questionKey?: string; reason: string }> =
    [];
  const appliedIds: string[] = [];
  const appliedKeys: string[] = [];

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
      year: attempt.year,
      existingAnswers: attempt.answers as Array<{
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }>,
      incoming: normalizedIncoming,
    });
    rejected = result.rejected;
    applied = applyAnswersToAttempt(
      attempt.answers as Array<{
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }>,
      result.allowed,
    );
    for (const a of result.allowed) {
      appliedIds.push(a.questionId);
      if (a.questionKey) appliedKeys.push(a.questionKey);
    }
    if (applied > 0) {
      attempt.markModified("answers");
    }
  }

  if (typeof body.currentQuestionIndex === "number") {
    const max = Math.max(0, attempt.answers.length - 1);
    attempt.currentQuestionIndex = Math.min(max, Math.max(0, body.currentQuestionIndex));
  }
  if (body.subjectFilter) attempt.subjectFilter = body.subjectFilter.slice(0, 32);
  if (body.sectionFilter) attempt.sectionFilter = body.sectionFilter.slice(0, 8);

  attempt.checkpointAt = new Date();
  await attempt.save();

  const endsAt = new Date(attempt.endsAt);
  const remainingMs = Math.max(0, endsAt.getTime() - Date.now());

  return NextResponse.json({
    ok: true,
    applied,
    appliedIds,
    appliedKeys,
    rejected,
    rejectedCount: rejected.length,
    checkpointAt: attempt.checkpointAt.toISOString(),
    endsAt: endsAt.toISOString(),
    remainingMs,
    currentQuestionIndex: attempt.currentQuestionIndex ?? 0,
    screenSwitchCount: attempt.screenSwitchCount ?? 0,
    subjectFilter: attempt.subjectFilter ?? "ALL",
    sectionFilter: attempt.sectionFilter ?? "ALL",
  });
}

export async function GET(_req: Request, { params }: Params) {
  await connectDb();
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attempt = await Attempt.findById(id).lean();
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const endsAt = new Date(attempt.endsAt);
  return NextResponse.json({
    ok: true,
    status: attempt.status,
    endsAt: endsAt.toISOString(),
    remainingMs: Math.max(0, endsAt.getTime() - Date.now()),
    currentQuestionIndex: attempt.currentQuestionIndex ?? 0,
    subjectFilter: attempt.subjectFilter ?? "ALL",
    sectionFilter: attempt.sectionFilter ?? "ALL",
    screenSwitchCount: attempt.screenSwitchCount ?? 0,
    checkpointAt: attempt.checkpointAt
      ? new Date(attempt.checkpointAt).toISOString()
      : null,
    answers: attempt.answers.map(
      (a: {
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }) => ({
        questionId: String(a.questionId),
        questionKey: a.questionKey ?? undefined,
        selectedOption: a.selectedOption ?? null,
        selectedOptions:
          a.selectedOptions ?? (a.selectedOption ? [a.selectedOption] : []),
        status: a.status,
      }),
    ),
  });
}
