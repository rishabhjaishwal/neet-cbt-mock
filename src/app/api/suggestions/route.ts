import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Suggestion } from "@/lib/models";

const postSchema = z.object({
  bodyMarkdown: z
    .string()
    .trim()
    .min(8, "Write a bit more so we can act on it")
    .max(8000, "Keep it under 8000 characters"),
});

/** Student: list own suggestions (newest first). */
export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  const rows = await Suggestion.find({ userId: new Types.ObjectId(user.id) })
    .sort({ createdAt: -1 })
    .limit(30)
    .select("bodyMarkdown status createdAt")
    .lean();
  return NextResponse.json({
    ok: true,
    suggestions: rows.map((r) => ({
      id: String(r._id),
      bodyMarkdown: r.bodyMarkdown,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
}

/** Student: submit a markdown suggestion → MongoDB. */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e && typeof e === "object" && "issues" in e
        ? String((e as { issues: Array<{ message: string }> }).issues[0]?.message)
        : "Invalid payload";
    return NextResponse.json({ error: msg || "Invalid payload" }, { status: 400 });
  }

  await connectDb();

  // Soft rate limit: max 5 in a rolling hour
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await Suggestion.countDocuments({
    userId: new Types.ObjectId(user.id),
    createdAt: { $gte: since },
  });
  if (recent >= 5) {
    return NextResponse.json(
      { error: "Please wait a bit — you can send up to 5 suggestions per hour." },
      { status: 429 },
    );
  }

  const doc = await Suggestion.create({
    userId: new Types.ObjectId(user.id),
    email: user.email,
    name: user.name,
    bodyMarkdown: body.bodyMarkdown,
    status: "new",
  });

  return NextResponse.json({
    ok: true,
    id: String(doc._id),
    message: "Thanks — we saved your note and will use it to improve the desk.",
  });
}
