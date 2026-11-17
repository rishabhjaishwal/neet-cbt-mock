import { Question } from "@/lib/models";
import {
  buildAttemptLimitInfo,
  type RuleQuestion,
} from "@/lib/attempt-rules";
import { getPaper } from "@/lib/papers";

type AnswerRow = {
  questionId: unknown;
  selectedOption?: string | null;
  selectedOptions?: string[];
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

/**
 * Validate that applying `incoming` answers to the attempt would not violate
 * global attempt budget or Section B per-block caps (NTA rules).
 */
export async function validateAttemptAnswerUpdates(opts: {
  year: number;
  existingAnswers: AnswerRow[];
  incoming: Array<{
    questionId: string;
    selectedOption?: string | null;
    selectedOptions?: string[];
    status: string;
  }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const paper = await getPaper(opts.year);
  if (!paper) return { ok: false, error: "Paper not found" };

  const qids = opts.existingAnswers.map((a) => a.questionId);
  const questions = await Question.find({ _id: { $in: qids } })
    .select("_id number subject section")
    .lean();
  const qById = Object.fromEntries(questions.map((q) => [String(q._id), q]));

  const state = new Map<
    string,
    {
      selectedOption: string | null;
      selectedOptions: string[];
      status: string;
    }
  >();
  for (const a of opts.existingAnswers) {
    const id = String(a.questionId);
    state.set(id, {
      selectedOption: a.selectedOption ?? null,
      selectedOptions: [...(a.selectedOptions ?? [])],
      status: a.status,
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

  for (const item of opts.incoming) {
    const prev = state.get(item.questionId);
    if (!prev) continue;
    const next = normalizeOptions(item.selectedOption, item.selectedOptions, item.status);
    const was = rowIsAttempted(prev);
    const now = rowIsAttempted(next);
    if (now && !was) {
      const limits = buildAttemptLimitInfo(
        toRuleQuestions(),
        paper.attempt_limit,
        paper.total_questions,
      );
      const gate = limits.canAttempt(item.questionId);
      if (!gate.ok) {
        return { ok: false, error: gate.reason || "Attempt limit reached" };
      }
    }
    state.set(item.questionId, next);
  }

  const finalLimits = buildAttemptLimitInfo(
    toRuleQuestions(),
    paper.attempt_limit,
    paper.total_questions,
  );
  if (finalLimits.attemptedCount > paper.attempt_limit) {
    return {
      ok: false,
      error: `Attempt limit reached (${paper.attempt_limit} of ${paper.total_questions}). Clear another response first.`,
    };
  }
  for (const cap of finalLimits.sectionBCaps) {
    if (cap.attempted > cap.cap) {
      return {
        ok: false,
        error: `Section B ${cap.subject} Q${cap.start}–${cap.end}: max ${cap.cap} questions. Clear another answer in this Section B block first.`,
      };
    }
  }

  return { ok: true };
}
