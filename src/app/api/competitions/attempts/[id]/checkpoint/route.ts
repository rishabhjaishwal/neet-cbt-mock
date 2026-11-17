import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { CompetitionAttempt } from "@/lib/models";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  currentQuestionIndex: z.number().int().min(0).optional(),
  answers: z
    .array(
      z.object({
        questionKey: z.string(),
        selectedOption: z.string().nullable().optional(),
        selectedOptions: z.array(z.string()).optional(),
        status: z.enum(["not_attempted", "attempted", "marked"]),
      }),
    )
    .optional(),
});

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
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await connectDb();
  const attempt = await CompetitionAttempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  if (typeof body.currentQuestionIndex === "number") {
    attempt.currentQuestionIndex = body.currentQuestionIndex;
  }
  if (body.answers?.length) {
    const byKey = Object.fromEntries(
      body.answers.map((a) => [a.questionKey, a]),
    );
    attempt.answers = attempt.answers.map(
      (a: {
        questionKey: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }) => {
        const next = byKey[a.questionKey];
        if (!next) return a;
        return {
          questionKey: a.questionKey,
          selectedOption: next.selectedOption ?? null,
          selectedOptions: next.selectedOptions ?? [],
          status: next.status,
        };
      },
    ) as typeof attempt.answers;
  }
  await attempt.save();
  return NextResponse.json({ ok: true });
}
