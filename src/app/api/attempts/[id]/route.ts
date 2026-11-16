import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, Question } from "@/lib/models";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureSeeded();
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attempt = await Attempt.findById(id).lean();
  if (!attempt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (user.role === "student" && String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const qids = attempt.answers.map((a: { questionId: unknown }) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));
  const revealKeys = user.role === "examiner" || attempt.status === "approved";

  const merged = attempt.answers
    .map((a: { questionId: unknown; selectedOption?: string | null; status: string }) => {
      const q = byId[String(a.questionId)];
      if (!q) return null;
      return {
        id: String(q._id),
        number: q.number,
        subject: q.subject,
        section: q.section,
        topic: q.topic,
        stem: q.stem,
        options: q.options as Record<string, string>,
        selectedOption: a.selectedOption,
        status: a.status,
        figureSrc: (q as { figureSrc?: string | null }).figureSrc ?? null,
        figureKind: (q as { figureKind?: string | null }).figureKind ?? null,
        needsFigure:
          /see figure|as shown in (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|as shown in figure|shown in figure|given figures|above diagram|following circuit|circuit (diagram )?shown/i.test(
            q.stem,
          ),
        ...(revealKeys
          ? {
              correctOption: q.correctOption,
              isCorrect:
                a.selectedOption != null &&
                a.selectedOption !== "" &&
                a.selectedOption === q.correctOption,
            }
          : {}),
      };
    })
    .filter(Boolean)
    .sort((a: { number?: number } | null, b: { number?: number } | null) => (a!.number as number) - (b!.number as number));

  return NextResponse.json({
    attempt: {
      id: String(attempt._id),
      user_id: String(attempt.userId),
      year: attempt.year,
      status: attempt.status,
      started_at: attempt.startedAt,
      ends_at: attempt.endsAt,
      submitted_at: attempt.submittedAt ?? null,
      score: attempt.score ?? null,
      correct_count: attempt.correctCount ?? null,
      wrong_count: attempt.wrongCount ?? null,
      unattempted_count: attempt.unattemptedCount ?? null,
      subject_stats: attempt.subjectStats ?? null,
      topic_stats: attempt.topicStats ?? null,
      percentile: attempt.percentile ?? null,
      estimated_rank: attempt.estimatedRank ?? null,
      screenSwitchCount: attempt.screenSwitchCount ?? 0,
      screenSwitchEvents: attempt.screenSwitchEvents ?? [],
      currentQuestionIndex: attempt.currentQuestionIndex ?? 0,
      subjectFilter: attempt.subjectFilter ?? "ALL",
      sectionFilter: attempt.sectionFilter ?? "ALL",
      checkpointAt: attempt.checkpointAt
        ? new Date(attempt.checkpointAt).toISOString()
        : null,
    },
    questions: merged,
  });
}
