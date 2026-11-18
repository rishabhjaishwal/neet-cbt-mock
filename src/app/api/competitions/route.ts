import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition } from "@/lib/models";
import {
  competitionDurationMinutes,
  makeInviteCode,
  type CompetitionSize,
} from "@/lib/competition";

const createSchema = z.object({
  title: z.string().trim().min(3).max(80).optional(),
  scope: z.enum(["ALL", "Physics", "Chemistry", "Biology"]),
  difficulty: z.enum(["Easy", "Medium", "Hard", "Mix"]),
  size: z.union([z.literal(20), z.literal(30), z.literal(50)]),
});

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  const uid = new Types.ObjectId(user.id);
  const rows = await Competition.find({
    $or: [{ hostId: uid }, { "members.userId": uid }],
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .select(
      "title inviteCode scope difficulty size durationMin status hostId members createdAt startedAt endsAt",
    )
    .lean();

  return NextResponse.json({
    ok: true,
    competitions: rows.map((c) => ({
      id: String(c._id),
      title: c.title,
      inviteCode: c.inviteCode,
      scope: c.scope,
      difficulty: c.difficulty,
      size: c.size,
      durationMin: c.durationMin,
      status: c.status,
      isHost: String(c.hostId) === user.id,
      memberCount: (c.members || []).length,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const size = body.size as CompetitionSize;
  const durationMin = competitionDurationMinutes(size);
  const title =
    body.title ||
    `${body.scope === "ALL" ? "All subjects" : body.scope} · ${body.difficulty} · ${size}Q`;

  await connectDb();
  const uid = new Types.ObjectId(user.id);
  let inviteCode = makeInviteCode();
  for (let i = 0; i < 5; i++) {
    const exists = await Competition.exists({ inviteCode });
    if (!exists) break;
    inviteCode = makeInviteCode();
  }

  const doc = await Competition.create({
    hostId: uid,
    title,
    inviteCode,
    scope: body.scope,
    difficulty: body.difficulty,
    size,
    durationMin,
    status: "open",
    questions: [],
    members: [
      {
        userId: uid,
        email: user.email,
        name: user.name,
        status: "joined",
        joinedAt: new Date(),
      },
    ],
  });

  const joinPath = `/competitions/join?code=${doc.inviteCode}`;
  return NextResponse.json({
    ok: true,
    id: String(doc._id),
    inviteCode: doc.inviteCode,
    joinPath,
    durationMin,
  });
}
