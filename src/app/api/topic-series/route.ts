import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listTopicCatalog } from "@/lib/topic-series";

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const topics = await listTopicCatalog();
  return NextResponse.json({
    ok: true,
    topics,
    note: "Each mock is 30 questions (~36 min). Sequences are sequential slices: _1=Q1–30, _2=Q31–60, … Full 30-Q mocks only.",
  });
}
