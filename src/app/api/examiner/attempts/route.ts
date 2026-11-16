import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, User } from "@/lib/models";

export async function GET() {
  await ensureSeeded();
  const user = await getSession();
  if (!user || user.role !== "examiner") {
    return NextResponse.json({ error: "Examiner only" }, { status: 403 });
  }

  const attempts = await Attempt.find({
    status: { $in: ["submitted", "approved"] },
  })
    .sort({ submittedAt: -1 })
    .lean();

  const userIds = [...new Set(attempts.map((a) => String(a.userId)))];
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const byUser = Object.fromEntries(users.map((u) => [String(u._id), u]));

  return NextResponse.json({
    attempts: attempts.map((a) => {
      const u = byUser[String(a.userId)];
      return {
        id: String(a._id),
        year: a.year,
        status: a.status,
        submitted_at: a.submittedAt ?? null,
        approved_at: a.approvedAt ?? null,
        score: a.score ?? null,
        correct_count: a.correctCount ?? null,
        wrong_count: a.wrongCount ?? null,
        unattempted_count: a.unattemptedCount ?? null,
        percentile: a.percentile ?? null,
        estimated_rank: a.estimatedRank ?? null,
        student_name: u?.name ?? "Unknown",
        student_email: u?.email ?? "",
      };
    }),
  });
}
