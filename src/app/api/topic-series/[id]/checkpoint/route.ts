import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TopicAttempt } from "@/lib/models";
import { parseOptionList } from "@/lib/multi-correct";

const answerSchema = z.object({
  questionKey: z.string().min(1),
  selectedOption: z.enum(["1", "2", "3", "4"]).nullable().optional(),
  selectedOptions: z.array(z.enum(["1", "2", "3", "4"])).optional(),
  status: z.enum(["not_attempted", "attempted", "marked"]),
});

const schema = z.object({
  answers: z.array(answerSchema).optional(),
  currentQuestionIndex: z.number().int().min(0).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
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
    return NextResponse.json({ error: "Invalid checkpoint" }, { status: 400 });
  }

  await connectDb();
  const attempt = await TopicAttempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt locked" }, { status: 409 });
  }

  const appliedKeys: string[] = [];
  if (body.answers?.length) {
    const byKey = new Map<string, number>();
    attempt.answers.forEach((a: { questionKey: string }, i: number) => {
      byKey.set(a.questionKey, i);
    });
    for (const item of body.answers) {
      const idx = byKey.get(item.questionKey);
      if (idx === undefined) continue;
      let status = item.status;
      let selectedOptions = parseOptionList(
        item.selectedOptions?.length
          ? item.selectedOptions
          : item.selectedOption
            ? [item.selectedOption]
            : [],
      );
      if (status === "not_attempted") selectedOptions = [];
      else if (selectedOptions.length && status !== "marked") status = "attempted";
      const row = attempt.answers[idx] as {
        selectedOption: string | null;
        selectedOptions: string[];
        status: string;
      };
      row.selectedOptions = selectedOptions;
      row.selectedOption = selectedOptions[0] ?? null;
      row.status = status;
      appliedKeys.push(item.questionKey);
    }
    if (appliedKeys.length) attempt.markModified("answers");
  }

  if (typeof body.currentQuestionIndex === "number") {
    const max = Math.max(0, attempt.answers.length - 1);
    attempt.currentQuestionIndex = Math.min(max, body.currentQuestionIndex);
  }
  attempt.checkpointAt = new Date();
  await attempt.save();

  return NextResponse.json({
    ok: true,
    applied: appliedKeys.length,
    appliedKeys,
    checkpointAt: attempt.checkpointAt.toISOString(),
    endsAt: new Date(attempt.endsAt).toISOString(),
  });
}
