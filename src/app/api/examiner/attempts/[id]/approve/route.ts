import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  await ensureSeeded();
  const user = await getSession();
  if (!user || user.role !== "examiner") {
    return NextResponse.json({ error: "Examiner only" }, { status: 403 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attempt = await Attempt.findById(id);
  if (!attempt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "submitted") {
    return NextResponse.json(
      { error: "Only submitted attempts can be approved" },
      { status: 409 },
    );
  }

  attempt.status = "approved";
  attempt.approvedAt = new Date();
  attempt.approvedBy = new Types.ObjectId(user.id);
  await attempt.save();
  return NextResponse.json({ ok: true });
}
