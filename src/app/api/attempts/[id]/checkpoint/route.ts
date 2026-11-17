import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { parseOptionList } from "@/lib/multi-correct";
import { validateAttemptAnswerUpdates } from "@/lib/server-attempt-limits";

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOption: z.enum(["1", "2", "3", "4"]).nullable().optional(),
  selectedOptions: z.array(z.enum(["1", "2", "3", "4"])).optional(),
  status: z.enum(["not_attempted", "attempted", "marked"]),
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
 */
export async function POST(req: Request, { params }: Params) {
  await ensureSeeded();
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

  if (body.answers?.length) {
    const byId = new Map<string, number>();
    attempt.answers.forEach((a: { questionId: unknown }, i: number) => {
      byId.set(String(a.questionId), i);
    });

    const normalizedIncoming = body.answers
      .filter((item) => byId.has(item.questionId))
      .map((item) => {
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
          selectedOption: selectedOptions[0] ?? null,
          selectedOptions,
          status,
        };
      });

    const gate = await validateAttemptAnswerUpdates({
      year: attempt.year,
      existingAnswers: attempt.answers as Array<{
        questionId: unknown;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }>,
      incoming: normalizedIncoming,
    });
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: 409 });
    }

    for (const item of normalizedIncoming) {
      const idx = byId.get(item.questionId);
      if (idx === undefined) continue;
      const row = attempt.answers[idx] as {
        selectedOption: string | null;
        selectedOptions?: string[];
        status: string;
      };
      row.selectedOptions = item.selectedOptions;
      row.selectedOption = item.selectedOption;
      row.status = item.status;
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
  await ensureSeeded();
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
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }) => ({
        questionId: String(a.questionId),
        selectedOption: a.selectedOption ?? null,
        selectedOptions: a.selectedOptions ?? (a.selectedOption ? [a.selectedOption] : []),
        status: a.status,
      }),
    ),
  });
}
