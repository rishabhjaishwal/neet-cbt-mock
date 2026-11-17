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
    note: "v1 banks reuse our PYQ extracts by topic. Gaps list difficulties still under 50.",
  });
}
