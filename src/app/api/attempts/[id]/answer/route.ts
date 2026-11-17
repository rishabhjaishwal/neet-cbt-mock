import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { parseOptionList } from "@/lib/multi-correct";
import { validateAttemptAnswerUpdates } from "@/lib/server-attempt-limits";

const schema = z.object({
  questionId: z.string().min(1),
  selectedOption: z.enum(["1", "2", "3", "4"]).nullable().optional(),
  selectedOptions: z.array(z.enum(["1", "2", "3", "4"])).optional(),
  status: z.enum(["not_attempted", "attempted", "marked"]),
});

type Params = { params: Promise<{ id: string }> };

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
  const body = schema.parse(await req.json());

  const attempt = await Attempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt locked" }, { status: 409 });
  }
  if (new Date(attempt.endsAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "Time expired — submit now" }, { status: 409 });
  }

  let status = body.status;
  let selectedOptions = parseOptionList(
    body.selectedOptions?.length
      ? body.selectedOptions
      : body.selectedOption
        ? [body.selectedOption]
        : [],
  );

  if (status === "not_attempted") {
    selectedOptions = [];
  } else if (selectedOptions.length) {
    if (status !== "marked") status = "attempted";
  } else if (status === "marked") {
    selectedOptions = [];
  }

  const ans = attempt.answers.find(
    (a: { questionId: unknown }) => String(a.questionId) === body.questionId,
  );
  if (!ans) {
    return NextResponse.json({ error: "Question not in attempt" }, { status: 404 });
  }

  const gate = await validateAttemptAnswerUpdates({
    year: attempt.year,
    existingAnswers: attempt.answers as Array<{
      questionId: unknown;
      selectedOption?: string | null;
      selectedOptions?: string[];
      status: string;
    }>,
    incoming: [
      {
        questionId: body.questionId,
        selectedOption: selectedOptions[0] ?? null,
        selectedOptions,
        status,
      },
    ],
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 409 });
  }

  ans.selectedOptions = selectedOptions;
  ans.selectedOption = selectedOptions[0] ?? null;
  ans.status = status;
  attempt.checkpointAt = new Date();
  await attempt.save();
  const endsAt = new Date(attempt.endsAt);
  return NextResponse.json({
    ok: true,
    checkpointAt: attempt.checkpointAt.toISOString(),
    endsAt: endsAt.toISOString(),
    remainingMs: Math.max(0, endsAt.getTime() - Date.now()),
  });
}
