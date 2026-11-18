import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { aggregateDashboardCharts } from "@/lib/dashboard-agg";
import { ensureMongoIndexes } from "@/lib/seed";

/**
 * Lazy-loaded dashboard chart payload.
 * Year-paper / topic-mock / NEET AI series stay separate (no mixed trend line).
 */
export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDb();
  void ensureMongoIndexes().catch(() => {});
  const charts = await aggregateDashboardCharts(user.id);
  const res = NextResponse.json({ ok: true, charts });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
