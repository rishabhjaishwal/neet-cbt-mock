import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { CONTENT_VERSION } from "@/lib/content-version";
import {
  getMdPaper,
  getMdPaperEtag,
  getMdQuestionsForStudent,
} from "@/lib/md-paper-store";

type Params = { params: Promise<{ year: string }> };

/**
 * Authenticated student/examiner paper pack (stems/options/figures — no keys).
 * ETag / X-Content-Version for FE background cache invalidation.
 */
export async function GET(req: Request, { params }: Params) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { year: yearRaw } = await params;
  const year = Number(yearRaw);
  if (!Number.isFinite(year) || year < 2016 || year > 2030) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const etag = await getMdPaperEtag(year);
  const inm = req.headers.get("if-none-match");
  if (etag && inm && inm === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "X-Content-Version": String(CONTENT_VERSION),
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  }

  const [meta, questions] = await Promise.all([
    getMdPaper(year),
    getMdQuestionsForStudent(year),
  ]);
  if (!meta || !questions.length) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const res = NextResponse.json({
    contentVersion: CONTENT_VERSION,
    paper: meta,
    questions: questions.map((q) => ({
      id: q.id,
      questionKey: q.questionKey,
      number: q.number,
      subject: q.subject,
      section: q.section,
      topic: q.topic,
      stem: q.stem,
      options: q.options,
      multiCorrect: q.multiCorrect,
      figureSrc: q.figureSrc,
      figureKind: q.figureKind,
    })),
  });
  if (etag) res.headers.set("ETag", etag);
  res.headers.set("X-Content-Version", String(CONTENT_VERSION));
  res.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  return res;
}
