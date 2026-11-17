import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { getPaper, getQuestionsForStudent } from "@/lib/papers";
import { finalizeInProgressAttempt } from "@/lib/finalize-attempt";
import { objectIdFromQuestionKey } from "@/lib/md-paper-store";

const schema = z.object({
  year: z.number().int().min(2016).max(2025),
  /** Start a fresh attempt even if an older approved/submitted one exists. */
  retake: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    // Users only — papers load from content/papers/*.md
    await ensureSeeded();
    const user = await getSession();
    if (!user || user.role !== "student") {
      return NextResponse.json({ error: "Login as student required" }, { status: 401 });
    }
    const { year, retake } = schema.parse(await req.json());
    const paper = await getPaper(year);
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    const userId = new Types.ObjectId(user.id);
    const inProgress = await Attempt.findOne({ userId, year, status: "in_progress" });
    if (inProgress) {
      const endsAt = new Date(inProgress.endsAt);
      const remainingMs = endsAt.getTime() - Date.now();
      if (remainingMs <= 0) {
        await finalizeInProgressAttempt(String(inProgress._id));
      } else {
        // Remap answer ids to deterministic MD-derived ObjectIds on resume.
        let changed = 0;
        for (const row of inProgress.answers as Array<{
          questionId: unknown;
          questionKey?: string;
        }>) {
          if (!row.questionKey) continue;
          const liveId = objectIdFromQuestionKey(row.questionKey);
          if (String(row.questionId) !== String(liveId)) {
            row.questionId = liveId;
            changed += 1;
          }
        }
        if (changed) {
          inProgress.markModified("answers");
          await inProgress.save();
        }
        return NextResponse.json({
          attemptId: String(inProgress._id),
          resumed: true,
          endsAt: endsAt.toISOString(),
          remainingMs: Math.max(0, remainingMs),
          currentQuestionIndex: inProgress.currentQuestionIndex ?? 0,
          screenSwitchCount: inProgress.screenSwitchCount ?? 0,
          attemptNumber: inProgress.attemptNumber ?? 1,
        });
      }
    }

    const prior = await Attempt.find({ userId, year }).sort({ attemptNumber: -1 }).limit(1).lean();
    const latest = prior[0];
    if (latest && latest.status === "submitted" && !retake) {
      if (latest.score != null) {
        return NextResponse.json(
          {
            error: "Attempt already completed. Open results or choose Retake.",
            attemptId: String(latest._id),
            resultsUrl: `/results/${String(latest._id)}`,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: "Attempt already submitted. Open results or choose Retake.",
          attemptId: String(latest._id),
          resultsUrl: `/results/${String(latest._id)}`,
        },
        { status: 409 },
      );
    }

    const nextNum = latest ? (latest.attemptNumber ?? 1) + 1 : 1;
    const ends = new Date(Date.now() + paper.duration_minutes * 60_000);
    const questions = await getQuestionsForStudent(year);
    if (!questions.length) {
      return NextResponse.json({ error: "Paper content missing" }, { status: 500 });
    }

    const attempt = await Attempt.create({
      userId,
      year,
      attemptNumber: nextNum,
      status: "in_progress",
      endsAt: ends,
      answers: questions.map((q) => ({
        questionId: new Types.ObjectId(q.id),
        questionKey: q.questionKey,
        number: q.number,
        subject: q.subject,
        section: q.section,
        selectedOption: null,
        selectedOptions: [],
        status: "not_attempted",
      })),
    });

    return NextResponse.json({
      attemptId: String(attempt._id),
      endsAt: ends.toISOString(),
      attemptNumber: nextNum,
      attemptLimit: paper.attempt_limit,
      totalQuestions: paper.total_questions,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start attempt" },
      { status: 400 },
    );
  }
}
