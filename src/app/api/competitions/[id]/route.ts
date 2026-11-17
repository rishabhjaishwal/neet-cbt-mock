import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition, CompetitionAttempt } from "@/lib/models";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await connectDb();
  const comp = await Competition.findById(id).lean();
  if (!comp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  type Member = {
    userId: Types.ObjectId | string;
    name: string;
    email: string;
    status: string;
    score?: number;
    attemptId?: Types.ObjectId | string | null;
  };
  const members = (comp.members || []) as Member[];
  const isMember =
    String(comp.hostId) === user.id ||
    members.some((m) => String(m.userId) === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const myAttempt = await CompetitionAttempt.findOne({
    competitionId: comp._id,
    userId: new Types.ObjectId(user.id),
  })
    .select("_id status score")
    .lean();

  return NextResponse.json({
    ok: true,
    competition: {
      id: String(comp._id),
      title: comp.title,
      inviteCode: comp.inviteCode,
      scope: comp.scope,
      difficulty: comp.difficulty,
      size: comp.size,
      durationMin: comp.durationMin,
      status: comp.status,
      isHost: String(comp.hostId) === user.id,
      startedAt: comp.startedAt,
      endsAt: comp.endsAt,
      members: members.map((m) => ({
        userId: String(m.userId),
        name: m.name,
        email: m.email,
        status: m.status,
        score: m.score ?? null,
        attemptId: m.attemptId ? String(m.attemptId) : null,
        isYou: String(m.userId) === user.id,
      })),
      myAttemptId: myAttempt ? String(myAttempt._id) : null,
      myAttemptStatus: myAttempt?.status ?? null,
    },
  });
}
