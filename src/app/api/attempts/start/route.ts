import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { getPaper, getQuestionsForStudent } from "@/lib/papers";

const schema = z.object({ year: z.number().int().min(2016).max(2025) });

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const user = await getSession();
    if (!user || user.role !== "student") {
      return NextResponse.json({ error: "Login as student required" }, { status: 401 });
    }
    const { year } = schema.parse(await req.json());
    const paper = await getPaper(year);
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    const userId = new Types.ObjectId(user.id);
    const existing = await Attempt.findOne({ userId, year }).lean();
    if (existing) {
      if (existing.status === "in_progress") {
        return NextResponse.json({
          attemptId: String(existing._id),
          resumed: true,
          endsAt: existing.endsAt,
        });
      }
      return NextResponse.json(
        {
          error:
            existing.status === "submitted"
              ? "Attempt submitted and locked pending examiner approval"
              : "Attempt already approved — view results from dashboard",
        },
        { status: 409 },
      );
    }

    const ends = new Date(Date.now() + paper.duration_minutes * 60_000);
    const questions = await getQuestionsForStudent(year);
    const attempt = await Attempt.create({
      userId,
      year,
      status: "in_progress",
      endsAt: ends,
      answers: questions.map((q) => ({
        questionId: new Types.ObjectId(q.id),
        questionKey: q.questionKey,
        selectedOption: null,
        status: "not_attempted",
      })),
    });

    return NextResponse.json({
      attemptId: String(attempt._id),
      endsAt: ends.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start attempt" },
      { status: 400 },
    );
  }
}
