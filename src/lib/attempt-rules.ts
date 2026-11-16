/** NTA-style attempt limits for classic 180 vs section A/B 200 papers. */

export type RuleQuestion = {
  id: string;
  number: number;
  subject: string;
  section: string;
  selectedOption: string | null;
  status: "not_attempted" | "attempted" | "marked";
};

export type AttemptLimitInfo = {
  attemptLimit: number;
  totalQuestions: number;
  attemptedCount: number;
  remainingSlots: number;
  sectionBCaps: Array<{
    subject: string;
    attempted: number;
    cap: number;
    over: boolean;
  }>;
  canAttempt: (questionId: string) => { ok: boolean; reason?: string };
};

function isAttempted(q: RuleQuestion & { selectedOptions?: string[] }) {
  const multi = q.selectedOptions && q.selectedOptions.length > 0;
  return (
    q.status !== "not_attempted" &&
    (multi || (q.selectedOption != null && q.selectedOption !== ""))
  );
}

/** Section B: attempt any 10 of 15 per Physics/Chemistry/Biology block (NTA 2021+). */
export function buildAttemptLimitInfo(
  questions: RuleQuestion[],
  attemptLimit: number,
  totalQuestions: number,
): AttemptLimitInfo {
  const attemptedCount = questions.filter(isAttempted).length;
  const remainingSlots = Math.max(0, attemptLimit - attemptedCount);

  const sectionBCaps: AttemptLimitInfo["sectionBCaps"] = [];
  if (totalQuestions >= 200 || attemptLimit < totalQuestions) {
    for (const subject of ["Physics", "Chemistry", "Biology"]) {
      const bQs = questions.filter(
        (q) => q.subject === subject && String(q.section).toUpperCase() === "B",
      );
      if (!bQs.length) continue;
      const attempted = bQs.filter(isAttempted).length;
      const cap = 10;
      sectionBCaps.push({ subject, attempted, cap, over: attempted > cap });
    }
  }

  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

  function canAttempt(questionId: string) {
    const q = byId[questionId];
    if (!q) return { ok: false, reason: "Unknown question" };
    if (isAttempted(q)) return { ok: true }; // editing existing answer

    if (attemptedCount >= attemptLimit) {
      return {
        ok: false,
        reason: `Attempt limit reached (${attemptLimit} of ${totalQuestions}). Clear another response first.`,
      };
    }

    if (String(q.section).toUpperCase() === "B") {
      const cap = sectionBCaps.find((c) => c.subject === q.subject);
      if (cap && cap.attempted >= cap.cap) {
        return {
          ok: false,
          reason: `Section B ${q.subject}: max ${cap.cap} questions. Clear another Section B answer first.`,
        };
      }
    }
    return { ok: true };
  }

  return {
    attemptLimit,
    totalQuestions,
    attemptedCount,
    remainingSlots,
    sectionBCaps,
    canAttempt,
  };
}

/** NTA palette status derived from selection + mark flag. */
export function paletteStatus(
  status: RuleQuestion["status"],
  selectedOption: string | null,
): "not_attempted" | "attempted" | "marked" | "marked_answered" {
  const has =
    selectedOption != null && selectedOption !== "" && status !== "not_attempted";
  if (status === "marked") {
    return has ? "marked_answered" : "marked";
  }
  if (has || status === "attempted") return "attempted";
  return "not_attempted";
}
