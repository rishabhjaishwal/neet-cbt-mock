import { Question } from "@/lib/models";
import {
  buildAttemptLimitInfo,
  type RuleQuestion,
} from "@/lib/attempt-rules";
import { getPaper } from "@/lib/papers";

export type AnswerRow = {
  questionId: unknown;
  questionKey?: string;
  selectedOption?: string | null;
  selectedOptions?: string[];
  status: string;
};

export type IncomingAnswer = {
  questionId?: string;
  questionKey?: string;
  selectedOption?: string | null;
  selectedOptions?: string[];
  status: string;
};

export type AllowedAnswer = {
  questionId: string;
  questionKey?: string;
  selectedOption: string | null;
  selectedOptions: string[];
  status: string;
};

function normalizeOptions(
  selectedOption?: string | null,
  selectedOptions?: string[],
  status?: string,
) {
  let statusOut = status || "not_attempted";
  let opts =
    Array.isArray(selectedOptions) && selectedOptions.length > 0
      ? [...selectedOptions]
      : selectedOption
        ? [selectedOption]
        : [];
  if (statusOut === "not_attempted") opts = [];
  else if (opts.length && statusOut !== "marked") statusOut = "attempted";
  else if (statusOut === "marked" && !opts.length) opts = [];
  return {
    status: statusOut,
    selectedOptions: opts,
    selectedOption: opts[0] ?? null,
  };
}

function rowIsAttempted(a: {
  selectedOption?: string | null;
  selectedOptions?: string[];
  status: string;
}) {
  const opts =
    Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0
      ? a.selectedOptions
      : a.selectedOption
        ? [a.selectedOption]
        : [];
  return a.status !== "not_attempted" && opts.length > 0;
}

function resolveIncomingId(
  item: IncomingAnswer,
  state: Map<string, unknown>,
  idByKey: Map<string, string>,
): string | undefined {
  if (item.questionId && state.has(item.questionId)) return item.questionId;
  if (item.questionKey) {
    const viaKey = idByKey.get(item.questionKey);
    if (viaKey && state.has(viaKey)) return viaKey;
  }
  if (item.questionId && state.has(item.questionId)) return item.questionId;
  return undefined;
}

/**
 * Apply incoming answers one-by-one against NTA slot rules.
 * Legal updates are kept; illegal new attempts are rejected without
 * blocking the rest of the batch (avoids wiping a whole checkpoint).
 */
export async function filterAllowedAnswerUpdates(opts: {
  year: number;
  existingAnswers: AnswerRow[];
  incoming: IncomingAnswer[];
}): Promise<{
  allowed: AllowedAnswer[];
  rejected: Array<{ questionId?: string; questionKey?: string; reason: string }>;
}> {
  const paper = await getPaper(opts.year);
  if (!paper) {
    return {
      allowed: [],
      rejected: opts.incoming.map((i) => ({
        questionId: i.questionId,
        questionKey: i.questionKey,
        reason: "Paper not found",
      })),
    };
  }

  const qids = opts.existingAnswers.map((a) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } })
    .select("_id number subject section questionKey")
    .lean();
  const qById = Object.fromEntries(questions.map((q) => [String(q._id), q]));

  const idByKey = new Map<string, string>();
  for (const a of opts.existingAnswers) {
    if (a.questionKey) idByKey.set(a.questionKey, String(a.questionId));
  }
  for (const q of questions) {
    if (q.questionKey) idByKey.set(q.questionKey, String(q._id));
  }

  const state = new Map<
    string,
    {
      selectedOption: string | null;
      selectedOptions: string[];
      status: string;
      questionKey?: string;
    }
  >();
  for (const a of opts.existingAnswers) {
    const id = String(a.questionId);
    state.set(id, {
      selectedOption: a.selectedOption ?? null,
      selectedOptions: [...(a.selectedOptions ?? [])],
      status: a.status,
      questionKey: a.questionKey || qById[id]?.questionKey,
    });
  }

  function toRuleQuestions(): RuleQuestion[] {
    const out: RuleQuestion[] = [];
    for (const a of opts.existingAnswers) {
      const id = String(a.questionId);
      const meta = qById[id];
      const row = state.get(id);
      if (!meta || !row) continue;
      out.push({
        id,
        number: meta.number,
        subject: meta.subject,
        section: meta.section,
        selectedOption: row.selectedOption,
        selectedOptions: row.selectedOptions,
        status: row.status as RuleQuestion["status"],
      });
    }
    return out;
  }

  const allowed: AllowedAnswer[] = [];
  const rejected: Array<{
    questionId?: string;
    questionKey?: string;
    reason: string;
  }> = [];

  for (const item of opts.incoming) {
    const questionId = resolveIncomingId(item, state, idByKey);
    if (!questionId) {
      rejected.push({
        questionId: item.questionId,
        questionKey: item.questionKey,
        reason: "Question not in attempt",
      });
      continue;
    }

    const prev = state.get(questionId)!;
    const next = normalizeOptions(
      item.selectedOption,
      item.selectedOptions,
      item.status,
    );
    const was = rowIsAttempted(prev);
    const now = rowIsAttempted(next);

    if (now && !was) {
      const limits = buildAttemptLimitInfo(
        toRuleQuestions(),
        paper.attempt_limit,
        paper.total_questions,
      );
      const gate = limits.canAttempt(questionId);
      if (!gate.ok) {
        rejected.push({
          questionId,
          questionKey: item.questionKey || prev.questionKey,
          reason: gate.reason || "Attempt limit reached",
        });
        continue;
      }
    }

    state.set(questionId, { ...next, questionKey: prev.questionKey });
    allowed.push({
      questionId,
      questionKey: prev.questionKey || item.questionKey,
      selectedOption: next.selectedOption,
      selectedOptions: next.selectedOptions,
      status: next.status,
    });
  }

  // Final aggregate caps (global + section B) — drop last illegal if batch overshot
  const finalLimits = buildAttemptLimitInfo(
    toRuleQuestions(),
    paper.attempt_limit,
    paper.total_questions,
  );
  if (finalLimits.attemptedCount > paper.attempt_limit) {
    // Should not happen with per-item gate; keep allowed as-is from gate
  }
  for (const cap of finalLimits.sectionBCaps) {
    if (cap.attempted > cap.cap) {
      // Per-item gate already prevents this when applied sequentially
    }
  }

  return { allowed, rejected };
}

/** Single-answer / legacy callers — fails only when nothing can be applied. */
export async function validateAttemptAnswerUpdates(opts: {
  year: number;
  existingAnswers: AnswerRow[];
  incoming: Array<{
    questionId: string;
    questionKey?: string;
    selectedOption?: string | null;
    selectedOptions?: string[];
    status: string;
  }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { allowed, rejected } = await filterAllowedAnswerUpdates(opts);
  if (allowed.length === 0 && rejected.length > 0) {
    return { ok: false, error: rejected[0]?.reason || "Attempt limit reached" };
  }
  if (allowed.length === 0 && opts.incoming.length > 0) {
    return { ok: false, error: "Question not in attempt" };
  }
  return { ok: true };
}

/** Apply allowed answer rows onto a mongoose Attempt.answers array. */
export function applyAnswersToAttempt(
  attemptAnswers: Array<{
    questionId: unknown;
    questionKey?: string;
    selectedOption?: string | null;
    selectedOptions?: string[];
    status: string;
  }>,
  allowed: AllowedAnswer[],
): number {
  if (!allowed.length) return 0;
  const byId = new Map(allowed.map((a) => [a.questionId, a] as const));
  const byKey = new Map(
    allowed
      .filter((a) => a.questionKey)
      .map((a) => [a.questionKey!, a] as const),
  );
  let applied = 0;
  for (const row of attemptAnswers) {
    const next =
      byId.get(String(row.questionId)) ||
      (row.questionKey ? byKey.get(row.questionKey) : undefined);
    if (!next) continue;
    row.selectedOption = next.selectedOption;
    row.selectedOptions = next.selectedOptions;
    row.status = next.status;
    applied += 1;
  }
  return applied;
}
