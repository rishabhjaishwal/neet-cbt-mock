import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { connectDb } from "./db";
import { Attempt, Paper, Question, User } from "./models";
import { normalizeScientificText } from "./symbol-normalize";

type PaperFile = {
  year: number;
  code: string;
  title: string;
  candidateCount: number;
  durationMinutes: number;
  totalQuestions: number;
  attemptLimit: number;
  structure: string;
  source: string;
  gaps: string[];
  questions: Array<{
    id: string;
    number: number;
    subject: string;
    section: string;
    topic: string;
    stem: string;
    options: Record<string, string>;
    correctOption: string;
    correctOptions?: string[];
    multiCorrect?: boolean;
    placeholder?: boolean;
    answerEstimated?: boolean;
    figureSrc?: string;
    figureKind?: string;
  }>;
};

/** Bump to force serverless cold-start reseed (figure invert + stem display). */
const CONTENT_VERSION = 12;
let syncedVersion = 0;

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function ensureSeeded() {
  await connectDb();
  if (syncedVersion === CONTENT_VERSION) return;
  await seedDatabase();
  syncedVersion = CONTENT_VERSION;
}

export async function seedDatabase() {
  await connectDb();

  await User.findOneAndUpdate(
    { email: "examiner@neet.local" },
    {
      email: "examiner@neet.local",
      name: "NEET Examiner",
      passwordHash: await hashPassword("Examiner@123"),
      role: "examiner",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await User.findOneAndUpdate(
    { email: "student@neet.local" },
    {
      email: "student@neet.local",
      name: "Demo Student",
      passwordHash: await hashPassword("Student@123"),
      role: "student",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  const papersDir = path.join(process.cwd(), "data", "papers");
  const files = (await readdir(papersDir))
    .filter((f) => f.startsWith("neet-") && f.endsWith(".json"))
    .sort();

  for (const file of files) {
    const paper = JSON.parse(
      await readFile(path.join(papersDir, file), "utf8"),
    ) as PaperFile;

    await Paper.findOneAndUpdate(
      { year: paper.year },
      {
        year: paper.year,
        code: paper.code,
        title: paper.title,
        candidateCount: paper.candidateCount,
        durationMinutes: paper.durationMinutes,
        totalQuestions: paper.totalQuestions,
        attemptLimit: paper.attemptLimit,
        structure: paper.structure,
        sourceNote: paper.source,
        gaps: paper.gaps ?? [],
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    // Avoid unique (year, number) collisions while reordering:
    // 1) park ALL year rows to unique negative numbers
    // 2) upsert final payload with canonical paper numbers (never leave 20xxx/30xxx)
    const existing = await Question.find({ year: paper.year })
      .select("questionKey")
      .lean();
    if (existing.length) {
      await Question.bulkWrite(
        existing.map((row, i) => ({
          updateOne: {
            filter: { questionKey: row.questionKey },
            update: { $set: { number: -(i + 1) } },
          },
        })),
        { ordered: false },
      );
    }

    const keepKeys = new Set(paper.questions.map((q) => q.id));
    const orphanKeys = existing
      .map((row) => row.questionKey)
      .filter((k) => k && !keepKeys.has(k));
    if (orphanKeys.length) {
      // Never delete keys still referenced by an in-progress attempt.
      const liveRefs = await Attempt.find({
        year: paper.year,
        status: "in_progress",
        "answers.questionKey": { $in: orphanKeys },
      })
        .select("answers.questionKey")
        .lean();
      const protectedKeys = new Set<string>();
      for (const att of liveRefs) {
        for (const a of att.answers as Array<{ questionKey?: string }>) {
          if (a.questionKey && orphanKeys.includes(a.questionKey)) {
            protectedKeys.add(a.questionKey);
          }
        }
      }
      const deletable = orphanKeys.filter((k) => !protectedKeys.has(k));
      if (deletable.length) {
        await Question.deleteMany({
          year: paper.year,
          questionKey: { $in: deletable },
        });
      }
    }

    await Question.bulkWrite(
      paper.questions.map((q) => ({
        updateOne: {
          filter: { questionKey: q.id },
          update: {
            $set: {
              questionKey: q.id,
              year: paper.year,
              number: q.number,
              subject: q.subject,
              section: q.section,
              topic: q.topic,
              stem: normalizeScientificText(q.stem),
              options: Object.fromEntries(
                Object.entries(q.options || {}).map(([k, v]) => [
                  k,
                  normalizeScientificText(String(v)),
                ]),
              ),
              correctOption: q.correctOption,
              correctOptions:
                q.correctOptions && q.correctOptions.length
                  ? q.correctOptions
                  : String(q.correctOption || "")
                      .split(/[,/\s]+/)
                      .filter((x) => /^[1-4]$/.test(x)),
              multiCorrect: Boolean(
                q.multiCorrect ||
                  (q.correctOptions && q.correctOptions.length > 1) ||
                  String(q.correctOption || "").includes(","),
              ),
              isPlaceholder: Boolean(q.placeholder),
              answerEstimated: Boolean(q.answerEstimated),
              figureSrc: q.figureSrc ?? null,
              figureKind: q.figureKind ?? null,
            },
          },
          upsert: true,
        },
      })),
      { ordered: true },
    );

    // Safety net: remap any leftover parked/negative numbers from paper keys.
    const stillParked = await Question.find({
      year: paper.year,
      $or: [{ number: { $lt: 1 } }, { number: { $gt: paper.totalQuestions } }],
    })
      .select("questionKey number")
      .lean();
    if (stillParked.length) {
      const byKey = Object.fromEntries(paper.questions.map((q) => [q.id, q.number]));
      await Question.bulkWrite(
        stillParked
          .filter((row) => byKey[row.questionKey] != null)
          .map((row) => ({
            updateOne: {
              filter: { questionKey: row.questionKey },
              update: { $set: { number: byKey[row.questionKey] } },
            },
          })),
        { ordered: false },
      );
    }

    // Keep in-progress attempts pointed at live Question _ids via questionKey
    // so a reseed/upsert cannot orphan selections as Unattempted.
    await rematchInProgressAttemptQuestionIds(paper.year);
  }

  try {
    await Attempt.collection.dropIndex("userId_1_year_1");
  } catch {
    /* old unique index may already be gone */
  }
  await Attempt.createIndexes();
}

async function rematchInProgressAttemptQuestionIds(year: number) {
  const live = await Question.find({ year }).select("_id questionKey").lean();
  const idByKey = new Map(live.map((q) => [q.questionKey, q._id]));
  if (!idByKey.size) return;

  const attempts = await Attempt.find({ year, status: "in_progress" });
  for (const attempt of attempts) {
    let changed = 0;
    for (const row of attempt.answers as Array<{
      questionId: { equals?: (v: unknown) => boolean };
      questionKey?: string;
    }>) {
      if (!row.questionKey) continue;
      const liveId = idByKey.get(row.questionKey);
      if (!liveId) continue;
      if (String(row.questionId) !== String(liveId)) {
        row.questionId = liveId as never;
        changed += 1;
      }
    }
    if (changed) {
      attempt.markModified("answers");
      await attempt.save();
    }
  }
}
