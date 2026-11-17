import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Types } from "mongoose";
import { CONTENT_VERSION } from "./content-version";
import {
  MIN_STUDENT_PAPER_QUESTIONS,
  filterStudentQuestions,
} from "./content-quality";
import { normalizeScientificText } from "./symbol-normalize";

export type MdPaperMeta = {
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
  /** False when curated clean English set is below MIN_STUDENT_PAPER_QUESTIONS. */
  studentReady: boolean;
};

export type MdQuestion = {
  id: string;
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  multiCorrect?: boolean;
  placeholder?: boolean;
  figureSrc?: string | null;
  figureKind?: string | null;
  correctOption?: string;
  correctOptions?: string[];
  answerEstimated?: boolean;
  solution?: string | null;
  studyLinks?: Array<{ label: string; url: string }> | null;
};

type CachedPaper = {
  meta: MdPaperMeta;
  questions: MdQuestion[];
  byKey: Map<string, MdQuestion>;
  etag: string;
};

const ROOT = path.join(process.cwd(), "content", "papers");
const cache = new Map<number, CachedPaper>();
let listCache: MdPaperMeta[] | null = null;
let cacheVersion = -1;

/** Stable ObjectId from questionKey — attempts stay remappable without Mongo Question docs. */
export function objectIdFromQuestionKey(key: string): Types.ObjectId {
  const hex = createHash("sha256")
    .update(`neet-cbt-q:${key}`)
    .digest("hex")
    .slice(0, 24);
  return new Types.ObjectId(hex);
}

function bustIfNeeded() {
  if (cacheVersion !== CONTENT_VERSION) {
    cache.clear();
    listCache = null;
    cacheVersion = CONTENT_VERSION;
  }
}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: raw };
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, "");
  const meta: Record<string, unknown> = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val: unknown = m[2].trim();
    if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (/^-?\d+(\.\d+)?$/.test(String(val))) val = Number(val);
    else if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
      try {
        val = JSON.parse(val);
      } catch {
        /* keep string */
      }
    } else if (typeof val === "string" && val.startsWith('"')) {
      try {
        val = JSON.parse(val);
      } catch {
        /* keep */
      }
    }
    meta[key] = val;
  }
  return { meta, body };
}

function extractFence(body: string, lang: string): string | null {
  const re = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)\\n```");
  const m = body.match(re);
  return m ? m[1] : null;
}

async function readKeyMap(year: number): Promise<Record<string, Partial<MdQuestion>>> {
  const raw = await readFile(path.join(ROOT, `neet-${year}.key.md`), "utf8");
  const { body } = parseFrontmatter(raw);
  const json = extractFence(body, "neet-keys-json");
  if (!json) return {};
  const parsed = JSON.parse(json) as { keys?: Record<string, Partial<MdQuestion>> };
  return parsed.keys || {};
}

async function loadYear(year: number, withKeys: boolean): Promise<CachedPaper | null> {
  bustIfNeeded();
  const hit = cache.get(year);
  if (hit && (!withKeys || hit.questions.some((q) => q.correctOption != null))) {
    return hit;
  }

  let paperRaw: string;
  try {
    paperRaw = await readFile(path.join(ROOT, `neet-${year}.paper.md`), "utf8");
  } catch {
    return null;
  }
  const { meta: fm, body } = parseFrontmatter(paperRaw);
  const json = extractFence(body, "neet-paper-json");
  if (!json) return null;
  const parsed = JSON.parse(json) as { questions: MdQuestion[] };
  const emptyKeys: Record<string, Partial<MdQuestion>> = {};
  const keys =
    withKeys || !hit
      ? await readKeyMap(year).catch(() => emptyKeys)
      : emptyKeys;

  const normalized = (parsed.questions || []).map((q) => {
    const k = keys[q.id] || {};
    return {
      ...q,
      stem: normalizeScientificText(q.stem),
      options: Object.fromEntries(
        Object.entries(q.options || {}).map(([ok, ov]) => [
          ok,
          normalizeScientificText(String(ov)),
        ]),
      ),
      correctOption: k.correctOption ?? q.correctOption,
      correctOptions: k.correctOptions ?? q.correctOptions,
      multiCorrect: Boolean(k.multiCorrect ?? q.multiCorrect),
      answerEstimated: Boolean(k.answerEstimated ?? q.answerEstimated),
      solution: k.solution ?? null,
      studyLinks: k.studyLinks ?? null,
    };
  });

  // Never serve placeholders / OCR garbage / incomplete options to students.
  const questions = filterStudentQuestions(normalized);
  const fmReady =
    fm.studentReady === true ||
    fm.studentReady === "true" ||
    fm.studentReady === undefined;
  const studentReady =
    questions.length >= MIN_STUDENT_PAPER_QUESTIONS && fmReady !== false;
  const gaps = Array.isArray(fm.gaps) ? [...(fm.gaps as string[])] : [];
  if (!studentReady) {
    gaps.push(
      `Only ${questions.length} clean English questions (need ${MIN_STUDENT_PAPER_QUESTIONS}).`,
    );
  }

  const rawTotal = Number(fm.totalQuestions ?? normalized.length);
  const rawLimit = Number(fm.attemptLimit ?? rawTotal);
  const rawDuration = Number(fm.durationMinutes ?? 180);
  const durationMinutes = Math.max(
    60,
    Math.round(rawDuration * (questions.length / Math.max(rawTotal, 1))),
  );

  const meta: MdPaperMeta = {
    year: Number(fm.year ?? year),
    code: String(fm.code ?? ""),
    title: String(fm.title ?? `NEET ${year}`),
    candidateCount: Number(fm.candidateCount ?? 2_000_000),
    durationMinutes,
    totalQuestions: questions.length,
    attemptLimit: Math.min(rawLimit, questions.length),
    structure: String(fm.structure ?? ""),
    source: String(fm.source ?? ""),
    gaps,
    studentReady,
  };

  const etag = `"cv${CONTENT_VERSION}-y${year}-n${questions.length}-${createHash("sha1")
    .update(json.slice(0, 2000) + String(questions.length))
    .digest("hex")
    .slice(0, 12)}"`;

  const packed: CachedPaper = {
    meta,
    questions,
    byKey: new Map(questions.map((q) => [q.id, q])),
    etag,
  };
  cache.set(year, packed);
  return packed;
}

export async function listMdPapers(): Promise<MdPaperMeta[]> {
  bustIfNeeded();
  if (listCache) return listCache;
  const files = (await readdir(ROOT)).filter((f) => f.endsWith(".paper.md"));
  const years = files
    .map((f) => Number(f.match(/neet-(\d{4})\.paper\.md/)?.[1]))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
  const metas: MdPaperMeta[] = [];
  for (const y of years) {
    const p = await loadYear(y, false);
    if (p) metas.push(p.meta);
  }
  listCache = metas;
  return metas;
}

export async function getMdPaper(year: number) {
  const p = await loadYear(year, false);
  return p?.meta ?? null;
}

export async function getMdQuestionsForStudent(year: number) {
  const p = await loadYear(year, false);
  if (!p) return [];
  return p.questions.map((q) => ({
    id: String(objectIdFromQuestionKey(q.id)),
    questionKey: q.id,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options: q.options,
    options_json: JSON.stringify(q.options ?? {}),
    multiCorrect: Boolean(q.multiCorrect),
    figureSrc: q.figureSrc ?? null,
    figureKind: q.figureKind ?? null,
  }));
}

export async function getMdQuestionsWithKeys(year: number) {
  const p = await loadYear(year, true);
  if (!p) return [];
  return p.questions.map((q) => ({
    id: String(objectIdFromQuestionKey(q.id)),
    questionKey: q.id,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options: q.options,
    options_json: JSON.stringify(q.options ?? {}),
    correctOption: q.correctOption || "1",
    correctOptions: q.correctOptions,
    multiCorrect: Boolean(q.multiCorrect),
    answerEstimated: Boolean(q.answerEstimated),
    figureSrc: q.figureSrc ?? null,
    figureKind: q.figureKind ?? null,
    solution: q.solution ?? null,
    studyLinks: q.studyLinks ?? null,
  }));
}

export async function getMdQuestionMap(year: number) {
  const p = await loadYear(year, true);
  if (!p) return new Map<string, MdQuestion>();
  return p.byKey;
}

export async function getMdPaperEtag(year: number) {
  const p = await loadYear(year, false);
  return p?.etag ?? null;
}

export function contentVersionHeader() {
  return String(CONTENT_VERSION);
}

/** Resolve questions for an attempt’s answer rows from MD (by key, then deterministic id). */
export async function resolveMdQuestionsForAnswers(
  year: number,
  answers: Array<{ questionId?: unknown; questionKey?: string }>,
) {
  const withKeys = await getMdQuestionsWithKeys(year);
  const byKey = Object.fromEntries(withKeys.map((q) => [q.questionKey, q]));
  const byId = Object.fromEntries(withKeys.map((q) => [q.id, q]));
  return answers.map((a) => {
    const q =
      (a.questionKey ? byKey[a.questionKey] : undefined) ||
      byId[String(a.questionId)] ||
      null;
    return q;
  });
}
