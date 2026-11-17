import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { filterStudentQuestions } from "./content-quality";
import type { TopicBankQuestion, TopicDifficulty } from "./topic-series";

export type CompetitionScope = "ALL" | "Physics" | "Chemistry" | "Biology";
export type CompetitionDifficulty = TopicDifficulty | "Mix";
export type CompetitionSize = 20 | 30 | 50;

export function competitionDurationMinutes(size: CompetitionSize): number {
  // ~1.2 min/Q → 24 / 36 / 60
  return Math.round(size * 1.2);
}

export function makeInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

type BankFile = {
  id: string;
  subject: string;
  topic: string;
  questions: Record<TopicDifficulty, TopicBankQuestion[]>;
};

const ROOT = path.join(process.cwd(), "data", "topic-series", "banks");

async function loadAllBanks(): Promise<BankFile[]> {
  const files = await readdir(ROOT);
  const out: BankFile[] = [];
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(path.join(ROOT, f), "utf8")) as BankFile;
    out.push({
      id: raw.id,
      subject: raw.subject,
      topic: raw.topic,
      questions: {
        Easy: filterStudentQuestions(raw.questions?.Easy || []),
        Medium: filterStudentQuestions(raw.questions?.Medium || []),
        Hard: filterStudentQuestions(raw.questions?.Hard || []),
      },
    });
  }
  return out;
}

function shuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = createHash("sha1").update(seed).digest();
  let s = h.readUInt32BE(0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pool random questions from topic banks for a competition. */
export async function pickCompetitionQuestions(opts: {
  scope: CompetitionScope;
  difficulty: CompetitionDifficulty;
  size: CompetitionSize;
  seed: string;
}): Promise<TopicBankQuestion[]> {
  const banks = await loadAllBanks();
  const scoped =
    opts.scope === "ALL"
      ? banks
      : banks.filter((b) => b.subject === opts.scope);

  const pool: TopicBankQuestion[] = [];
  const diffs: TopicDifficulty[] =
    opts.difficulty === "Mix"
      ? ["Easy", "Medium", "Hard"]
      : [opts.difficulty];

  const seen = new Set<string>();
  for (const b of scoped) {
    for (const d of diffs) {
      for (const q of b.questions[d] || []) {
        const fp = `${q.stem}`.slice(0, 120).toLowerCase();
        if (seen.has(fp)) continue;
        seen.add(fp);
        pool.push({ ...q, subject: q.subject || b.subject, topic: q.topic || b.topic });
      }
    }
  }

  if (pool.length < opts.size) {
    throw new Error(
      `Not enough clean questions (need ${opts.size}, have ${pool.length}) for ${opts.scope} / ${opts.difficulty}.`,
    );
  }

  return shuffle(pool, opts.seed).slice(0, opts.size);
}
