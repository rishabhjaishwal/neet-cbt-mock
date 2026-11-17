import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";
import { finalizeInProgressAttempt } from "@/lib/finalize-attempt";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  await ensureSeeded();
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await Attempt.findById(id).lean();
  if (!existing || String(existing.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "in_progress") {
    return NextResponse.json(
      {
        error: "Already submitted",
        attemptId: id,
        status: existing.status,
        resultsUrl: `/results/${id}`,
      },
      { status: 409 },
    );
  }

  const attempt = await finalizeInProgressAttempt(id);
  if (!attempt) {
    return NextResponse.json({ error: "Finalize failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    locked: true,
    released: true,
    attemptId: String(attempt._id),
    status: attempt.status,
    score: attempt.score ?? null,
    resultsUrl: `/results/${String(attempt._id)}`,
    message: "Submitted. Your marks, review, and rank stats are ready.",
  });
}
