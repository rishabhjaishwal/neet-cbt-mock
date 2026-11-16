import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt } from "@/lib/models";

const schema = z.object({
  reason: z.enum([
    "escape",
    "fullscreen_exit",
    "tab_switch",
    "window_blur",
  ]),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  await ensureSeeded();
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = schema.parse(await req.json());

  const attempt = await Attempt.findById(id);
  if (!attempt || String(attempt.userId) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt locked" }, { status: 409 });
  }

  attempt.screenSwitchCount = (attempt.screenSwitchCount ?? 0) + 1;
  attempt.screenSwitchEvents = [
    ...(attempt.screenSwitchEvents ?? []),
    { at: new Date(), reason: body.reason },
  ].slice(-100);
  await attempt.save();

  return NextResponse.json({
    ok: true,
    screenSwitchCount: attempt.screenSwitchCount,
  });
}
