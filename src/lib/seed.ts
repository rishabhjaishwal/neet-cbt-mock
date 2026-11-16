import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { connectDb } from "./db";
import { Attempt, Paper, Question, User } from "./models";

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
    placeholder?: boolean;
    answerEstimated?: boolean;
  }>;
};

let seeded = false;

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function ensureSeeded() {
  await connectDb();
  if (seeded) return;
  const userCount = await User.countDocuments();
  const questionCount = await Question.countDocuments();
  if (userCount > 0 && questionCount > 100) {
    seeded = true;
    return;
  }
  await seedDatabase();
  seeded = true;
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

    const ops = paper.questions.map((q) => ({
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
            stem: q.stem,
            options: q.options,
            correctOption: q.correctOption,
            isPlaceholder: Boolean(q.placeholder),
            answerEstimated: Boolean(q.answerEstimated),
          },
        },
        upsert: true,
      },
    }));

    for (let i = 0; i < ops.length; i += 100) {
      await Question.bulkWrite(ops.slice(i, i + 100), { ordered: false });
    }
  }

  await Attempt.createIndexes();
}
