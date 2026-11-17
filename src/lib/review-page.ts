import {
  isMultiCorrectQuestion,
  resolveCorrectOptions,
  scoreSelection,
  type Outcome,
} from "@/lib/multi-correct";
import {
  displayQuestionNumber,
  type PaperQuestionMeta,
} from "@/lib/paper-content";
import { buildLearningAid, type LearningLink } from "@/lib/learning-aid";
import type { ReviewItem } from "@/components/QuestionReviewList";

function normalizeStudyLinks(
  links: Array<{ label: string; url: string; kind?: string }> | null | undefined,
): LearningLink[] | null {
  if (!links?.length) return null;
  return links.map((l) => {
    const kind =
      l.kind === "youtube" ||
      l.kind === "web" ||
      l.kind === "pdf" ||
      l.kind === "other"
        ? l.kind
        : /youtube\.com|youtu\.be/i.test(l.url)
          ? "youtube"
          : /\.pdf(\?|$)/i.test(l.url) || /filetype:pdf/i.test(l.url)
            ? "pdf"
            : "web";
    return { label: l.label, url: l.url, kind };
  });
}

/** Solutions are heavy (markdown + AI text) — keep page small for TTFB/HTML. */
export const REVIEW_PAGE_SIZE = 10;

export type ReviewFilterSubject = "ALL" | "Physics" | "Chemistry" | "Biology";
export type ReviewFilterOutcome = "ALL" | Outcome;

export type ReviewQuery = {
  page: number;
  subject: ReviewFilterSubject;
  outcome: ReviewFilterOutcome;
};

export type AttemptAnswerLite = {
  questionId: unknown;
  questionKey?: string;
  number?: number;
  subject?: string;
  section?: string;
  selectedOption?: string | null;
  selectedOptions?: string[];
  status: string;
};

export type ReviewIndexRow = {
  answerIndex: number;
  questionId: string;
  questionKey?: string;
  number: number;
  subject: string;
  outcome: Outcome;
};

export type DbQuestionLite = {
  _id?: unknown;
  questionKey?: string;
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  correctOption?: string;
  correctOptions?: string[];
  multiCorrect?: boolean;
  answerEstimated?: boolean;
  figureSrc?: string | null;
  figureKind?: string | null;
};

const SUBJECTS = new Set(["Physics", "Chemistry", "Biology"]);
const OUTCOMES = new Set(["correct", "partial", "wrong", "unattempted"]);

export function parseReviewQuery(raw: {
  page?: string;
  subject?: string;
  outcome?: string;
}): ReviewQuery {
  const page = Math.max(1, Number.parseInt(String(raw.page || "1"), 10) || 1);
  const subjectRaw = String(raw.subject || "ALL");
  const outcomeRaw = String(raw.outcome || "ALL");
  return {
    page,
    subject: SUBJECTS.has(subjectRaw)
      ? (subjectRaw as ReviewFilterSubject)
      : "ALL",
    outcome: OUTCOMES.has(outcomeRaw)
      ? (outcomeRaw as ReviewFilterOutcome)
      : "ALL",
  };
}

export function reviewQueryToSearchParams(q: ReviewQuery): string {
  const sp = new URLSearchParams();
  if (q.page > 1) sp.set("page", String(q.page));
  if (q.subject !== "ALL") sp.set("subject", q.subject);
  if (q.outcome !== "ALL") sp.set("outcome", q.outcome);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Lightweight index for every answer — no stems / learning aids. */
export function buildReviewIndex(
  answers: AttemptAnswerLite[],
  paperByKey: Map<string, PaperQuestionMeta>,
  dbById?: Record<string, DbQuestionLite | undefined>,
  dbByKey?: Record<string, DbQuestionLite | undefined>,
): ReviewIndexRow[] {
  const rows: ReviewIndexRow[] = [];
  answers.forEach((a, answerIndex) => {
    const db =
      dbById?.[String(a.questionId)] ||
      (a.questionKey ? dbByKey?.[a.questionKey] : undefined);
    const key = a.questionKey || db?.questionKey || "";
    const paperQ = key ? paperByKey.get(key) : undefined;
    const number = displayQuestionNumber(
      paperQ,
      paperQ?.number ?? a.number ?? db?.number,
      answerIndex,
    );
    const subject = paperQ?.subject ?? a.subject ?? db?.subject ?? "Physics";
    const correct = resolveCorrectOptions({
      correctOption: paperQ?.correctOption ?? db?.correctOption,
      correctOptions: paperQ?.correctOptions ?? db?.correctOptions,
    });
    const multi = isMultiCorrectQuestion({
      multiCorrect: paperQ?.multiCorrect ?? db?.multiCorrect,
      correctOptions: correct,
      correctOption: paperQ?.correctOption ?? db?.correctOption,
    });
    const picked =
      a.selectedOptions?.length
        ? a.selectedOptions
        : a.selectedOption
          ? [a.selectedOption]
          : [];
    const selected =
      a.status === "not_attempted" && picked.length === 0 ? [] : picked;
    const { outcome } = scoreSelection(selected, correct, multi);
    rows.push({
      answerIndex,
      questionId: String(a.questionId),
      questionKey: key || undefined,
      number,
      subject,
      outcome,
    });
  });
  return rows.sort((a, b) => a.number - b.number);
}

export function filterReviewIndex(
  rows: ReviewIndexRow[],
  query: ReviewQuery,
): ReviewIndexRow[] {
  return rows.filter((r) => {
    if (query.subject !== "ALL" && r.subject !== query.subject) return false;
    if (query.outcome !== "ALL" && r.outcome !== query.outcome) return false;
    return true;
  });
}

export function paginateReviewIndex(
  filtered: ReviewIndexRow[],
  page: number,
  pageSize = REVIEW_PAGE_SIZE,
) {
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  return { total, totalPages, page: safePage, start, slice, pageSize };
}

/** Hydrate full review cards for one page of index rows. */
export function hydrateReviewPage(opts: {
  answers: AttemptAnswerLite[];
  slice: ReviewIndexRow[];
  paperByKey: Map<string, PaperQuestionMeta>;
  byId: Record<string, DbQuestionLite | undefined>;
  byKey: Record<string, DbQuestionLite | undefined>;
}): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const row of opts.slice) {
    const a = opts.answers[row.answerIndex];
    if (!a) continue;
    const q =
      opts.byId[String(a.questionId)] ||
      (a.questionKey ? opts.byKey[a.questionKey] : undefined);
    const key = a.questionKey || q?.questionKey || row.questionKey || "";
    const paperQ = key ? opts.paperByKey.get(key) : undefined;
    if (!q && !paperQ) continue;

    const number = displayQuestionNumber(
      paperQ,
      paperQ?.number ?? a.number ?? q?.number,
      row.answerIndex,
    );
    const subject = paperQ?.subject ?? a.subject ?? q?.subject ?? row.subject;
    const section = paperQ?.section ?? a.section ?? q?.section ?? "A";
    const topic = paperQ?.topic ?? q?.topic ?? "General";
    const stem = paperQ?.stem ?? q?.stem ?? "";
    const options = (paperQ?.options ?? q?.options ?? {}) as Record<
      string,
      string
    >;
    const correct = resolveCorrectOptions({
      correctOption: paperQ?.correctOption ?? q?.correctOption,
      correctOptions: paperQ?.correctOptions ?? q?.correctOptions,
    });
    const multi = isMultiCorrectQuestion({
      multiCorrect: paperQ?.multiCorrect ?? q?.multiCorrect,
      correctOptions: correct,
      correctOption: paperQ?.correctOption ?? q?.correctOption,
    });
    const picked =
      a.selectedOptions?.length
        ? a.selectedOptions
        : a.selectedOption
          ? [a.selectedOption]
          : [];
    const selected =
      a.status === "not_attempted" && picked.length === 0 ? [] : picked;
    const { marks, outcome } = scoreSelection(selected, correct, multi);
    const needsFigure =
      /see figure|as shown in (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|as shown in figure|shown in figure|given figures/i.test(
        stem,
      );
    const learning = buildLearningAid({
      number,
      subject,
      section,
      topic,
      stem,
      options,
      correct,
      multiCorrect: multi,
      answerEstimated: Boolean(paperQ?.answerEstimated ?? q?.answerEstimated),
      curatedSolution: paperQ?.solution ?? null,
      curatedLinks: normalizeStudyLinks(paperQ?.studyLinks),
    });
    items.push({
      id: String(a.questionId || key || row.answerIndex),
      number,
      subject,
      section,
      topic,
      stem,
      options,
      selected,
      correct,
      outcome,
      marks,
      multiCorrect: multi,
      figureSrc: (paperQ?.figureSrc ?? q?.figureSrc) ?? null,
      figureKind: (paperQ?.figureKind ?? q?.figureKind) ?? null,
      needsFigure,
      learning,
    });
  }
  return items;
}
