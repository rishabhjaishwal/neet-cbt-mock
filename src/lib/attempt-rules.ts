/** NTA-style attempt limits for classic 180 vs section A/B 200 papers. */

export type RuleQuestion = {
  id: string;
  number: number;
  subject: string;
  section: string;
  selectedOption: string | null;
  selectedOptions?: string[];
  status: "not_attempted" | "attempted" | "marked";
};

export type SectionBCap = {
  id: string;
  subject: string;
  /** 1-based index of this Section B block within the subject */
  blockIndex: number;
  start: number;
  end: number;
  attempted: number;
  cap: number;
  over: boolean;
  questionIds: string[];
};

export type AttemptLimitInfo = {
  attemptLimit: number;
  totalQuestions: number;
  attemptedCount: number;
  remainingSlots: number;
  sectionBCaps: SectionBCap[];
  canAttempt: (questionId: string) => { ok: boolean; reason?: string };
};

function isAttempted(q: RuleQuestion) {
  const multi = Array.isArray(q.selectedOptions) && q.selectedOptions.length > 0;
  const single = q.selectedOption != null && q.selectedOption !== "";
  return q.status !== "not_attempted" && (multi || single);
}

function isSectionB(q: RuleQuestion) {
  return String(q.section || "").trim().toUpperCase() === "B";
}

/**
 * Contiguous Section B runs per subject (NTA blocks).
 * Physics/Chemistry: one 15-Q block (attempt 10).
 * Biology: two 15-Q blocks (Botany + Zoology), attempt 10 each.
 */
export function findSectionBBlocks(questions: RuleQuestion[]): Array<{
  subject: string;
  blockIndex: number;
  start: number;
  end: number;
  questionIds: string[];
}> {
  const blocks: Array<{
    subject: string;
    blockIndex: number;
    start: number;
    end: number;
    questionIds: string[];
  }> = [];

  for (const subject of ["Physics", "Chemistry", "Biology"]) {
    const bQs = questions
      .filter((q) => q.subject === subject && isSectionB(q))
      .sort((a, b) => a.number - b.number);
    if (!bQs.length) continue;

    let blockIndex = 1;
    let cur = {
      subject,
      blockIndex,
      start: bQs[0].number,
      end: bQs[0].number,
      questionIds: [bQs[0].id],
    };

    for (let i = 1; i < bQs.length; i++) {
      const q = bQs[i];
      if (q.number === cur.end + 1) {
        cur.end = q.number;
        cur.questionIds.push(q.id);
      } else {
        blocks.push(cur);
        blockIndex += 1;
        cur = {
          subject,
          blockIndex,
          start: q.number,
          end: q.number,
          questionIds: [q.id],
        };
      }
    }
    blocks.push(cur);
  }

  return blocks;
}

/** Default NTA Section B rule: attempt any 10 of the block (usually 15). */
export function sectionBCapForBlockSize(blockSize: number): number {
  if (blockSize <= 0) return 0;
  if (blockSize <= 10) return blockSize;
  return 10;
}

/** Section B: attempt any 10 of 15 per subject block (NTA 2021+). Section A is never capped by this. */
export function buildAttemptLimitInfo(
  questions: RuleQuestion[],
  attemptLimit: number,
  totalQuestions: number,
): AttemptLimitInfo {
  const attemptedCount = questions.filter(isAttempted).length;
  const remainingSlots = Math.max(0, attemptLimit - attemptedCount);

  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  const sectionBCaps: SectionBCap[] = [];

  const useSectionBRules = totalQuestions >= 200 || attemptLimit < totalQuestions;
  if (useSectionBRules) {
    for (const block of findSectionBBlocks(questions)) {
      const attempted = block.questionIds.reduce((n, id) => {
        const q = byId[id];
        return n + (q && isAttempted(q) ? 1 : 0);
      }, 0);
      const cap = sectionBCapForBlockSize(block.questionIds.length);
      sectionBCaps.push({
        id: `${block.subject}-B${block.blockIndex}-${block.start}-${block.end}`,
        subject: block.subject,
        blockIndex: block.blockIndex,
        start: block.start,
        end: block.end,
        attempted,
        cap,
        over: attempted > cap,
        questionIds: block.questionIds,
      });
    }
  }

  const blockByQuestionId = new Map<string, SectionBCap>();
  for (const cap of sectionBCaps) {
    for (const id of cap.questionIds) blockByQuestionId.set(id, cap);
  }

  function canAttempt(questionId: string) {
    const q = byId[questionId];
    if (!q) return { ok: false, reason: "Unknown question" };

    // Always allow editing / clearing an already-answered question.
    if (isAttempted(q)) return { ok: true };

    // Global paper slot budget (e.g. 180 of 200) — applies to A and B alike.
    if (attemptedCount >= attemptLimit) {
      return {
        ok: false,
        reason: `Attempt limit reached (${attemptLimit} of ${totalQuestions}). Clear another response first.`,
      };
    }

    // Section A (and non-B) is never gated by Section B counters.
    if (!isSectionB(q)) return { ok: true };

    const cap = blockByQuestionId.get(questionId);
    if (cap && cap.attempted >= cap.cap) {
      const label =
        cap.blockIndex > 1 || sectionBCaps.filter((c) => c.subject === cap.subject).length > 1
          ? `Section B ${cap.subject} Q${cap.start}–${cap.end}`
          : `Section B ${cap.subject}`;
      return {
        ok: false,
        reason: `${label}: max ${cap.cap} questions. Clear another answer in this Section B block first.`,
      };
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
