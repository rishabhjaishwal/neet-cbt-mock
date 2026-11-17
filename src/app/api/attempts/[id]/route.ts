import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Attempt } from "@/lib/models";
import { getMdQuestionsWithKeys, getMdQuestionsForStudent } from "@/lib/md-paper-store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  await connectDb();
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

  const revealKeys =
    user.role === "examiner" ||
    attempt.status === "approved" ||
    (attempt.status === "submitted" && attempt.score != null);

  const mdQuestions = revealKeys
    ? await getMdQuestionsWithKeys(attempt.year)
    : await getMdQuestionsForStudent(attempt.year);
  const byKey = Object.fromEntries(mdQuestions.map((q) => [q.questionKey, q]));
  const byId = Object.fromEntries(mdQuestions.map((q) => [q.id, q]));

  const merged = attempt.answers
    .map(
      (a: {
        questionId: unknown;
        questionKey?: string;
        selectedOption?: string | null;
        selectedOptions?: string[];
        status: string;
      }) => {
        const q =
          (a.questionKey ? byKey[a.questionKey] : undefined) ||
          byId[String(a.questionId)];
        if (!q) return null;
        const selectedOptions =
          Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0
            ? [...a.selectedOptions]
            : a.selectedOption
              ? [a.selectedOption]
              : [];
        const correctOptions =
          "correctOptions" in q && Array.isArray(q.correctOptions) && q.correctOptions.length
            ? q.correctOptions
            : "correctOption" in q
              ? String(q.correctOption || "")
                  .split(/[,/\s]+/)
                  .filter(Boolean)
              : [];
        return {
          id: q.id,
          questionKey: a.questionKey || q.questionKey,
          number: q.number,
          subject: q.subject,
          section: q.section,
          topic: q.topic,
          stem: q.stem,
          options: q.options as Record<string, string>,
          selectedOption: selectedOptions[0] ?? null,
          selectedOptions,
          status: a.status,
          multiCorrect: Boolean(q.multiCorrect),
          figureSrc: q.figureSrc ?? null,
          figureKind: q.figureKind ?? null,
          needsFigure:
            /see figure|as shown in (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|as shown in figure|shown in figure|given figures|above diagram|following circuit|circuit (diagram )?shown/i.test(
              q.stem,
            ),
          ...(revealKeys
            ? {
                correctOption:
                  "correctOption" in q ? q.correctOption : correctOptions[0],
                correctOptions,
                isCorrect:
                  selectedOptions.length > 0 &&
                  [...selectedOptions].sort().join(",") ===
                    [...correctOptions].sort().join(","),
              }
            : {}),
        };
      },
    )
    .filter(Boolean)
    .sort(
      (
        a: { number?: number; subject?: string } | null,
        b: { number?: number; subject?: string } | null,
      ) => {
        const order = { Physics: 0, Chemistry: 1, Biology: 2 } as Record<
          string,
          number
        >;
        const as = order[a?.subject ?? ""] ?? 9;
        const bs = order[b?.subject ?? ""] ?? 9;
        if (as !== bs) return as - bs;
        return (a!.number as number) - (b!.number as number);
      },
    );

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
