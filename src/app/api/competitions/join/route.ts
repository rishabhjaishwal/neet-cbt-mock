import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Competition } from "@/lib/models";

const schema = z.object({
  inviteCode: z.string().trim().min(4).max(16),
});

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json(
      { error: "Signup or login as a student to join." },
      { status: 401 },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
  }

  await connectDb();
  const code = body.inviteCode.toUpperCase();
  const comp = await Competition.findOne({ inviteCode: code });
  if (!comp) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  if (comp.status !== "open") {
    return NextResponse.json(
      { error: "This competition already started or closed." },
      { status: 409 },
    );
  }

  const uid = new Types.ObjectId(user.id);
  const already = (comp.members || []).some(
    (m: { userId: Types.ObjectId | string }) => String(m.userId) === user.id,
  );
  if (!already) {
    if ((comp.members || []).length >= 40) {
      return NextResponse.json({ error: "Competition is full (40)." }, { status: 409 });
    }
    comp.members.push({
      userId: uid,
      email: user.email,
      name: user.name,
      status: "joined",
      joinedAt: new Date(),
    });
    await comp.save();
  }

  return NextResponse.json({ ok: true, id: String(comp._id) });
}
