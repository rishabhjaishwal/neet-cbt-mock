/** Normalize / score single- and multi-correct NEET-style items. */

export type Outcome = "correct" | "partial" | "wrong" | "unattempted";

export function parseOptionList(raw: string | string[] | null | undefined): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(String).map((s) => s.trim()).filter((s) => /^[1-4]$/.test(s)))].sort();
  }
  const s = String(raw).trim();
  if (!s) return [];
  if (s.includes(",") || s.includes("/") || s.includes(" ")) {
    return [
      ...new Set(
        s
          .split(/[,/\s]+/)
          .map((x) => x.trim())
          .filter((x) => /^[1-4]$/.test(x)),
      ),
    ].sort();
  }
  if (/^[1-4]$/.test(s)) return [s];
  // Digits stuck together e.g. "13" → 1 and 3 when multi
  if (/^[1-4]{2,4}$/.test(s) && new Set(s).size === s.length) {
    return [...s].sort();
  }
  return [];
}

export function resolveCorrectOptions(q: {
  correctOption?: string | null;
  correctOptions?: string[] | null;
}): string[] {
  if (q.correctOptions && q.correctOptions.length) {
    return parseOptionList(q.correctOptions);
  }
  return parseOptionList(q.correctOption);
}

export function isMultiCorrectQuestion(q: {
  multiCorrect?: boolean;
  correctOption?: string | null;
  correctOptions?: string[] | null;
}): boolean {
  if (q.multiCorrect) return true;
  return resolveCorrectOptions(q).length > 1;
}

/**
 * Multi-correct scoring (documented product rule):
 * - Exact set match → +4 (fully correct)
 * - Any selected option not in the key → −1 (wrong; no partial)
 * - Non-empty proper subset of the key (no extras) → +1 per selected correct option (partial, max 3)
 * - Nothing selected → 0 (unattempted)
 *
 * Single-correct stays classic NEET: +4 / −1 / 0.
 */
export function scoreSelection(
  selectedRaw: string | string[] | null | undefined,
  correctRaw: string | string[] | null | undefined,
  multiCorrect: boolean,
): { marks: number; outcome: Outcome; selected: string[]; correct: string[] } {
  const selected = parseOptionList(selectedRaw);
  const correct = parseOptionList(correctRaw);
  if (!selected.length) {
    return { marks: 0, outcome: "unattempted", selected, correct };
  }

  if (!multiCorrect || correct.length <= 1) {
    const ok = selected.length === 1 && correct.length === 1 && selected[0] === correct[0];
    return {
      marks: ok ? 4 : -1,
      outcome: ok ? "correct" : "wrong",
      selected,
      correct,
    };
  }

  const correctSet = new Set(correct);
  const hasWrong = selected.some((s) => !correctSet.has(s));
  if (hasWrong) {
    return { marks: -1, outcome: "wrong", selected, correct };
  }

  const same =
    selected.length === correct.length && selected.every((s, i) => s === correct[i]);
  if (same) {
    return { marks: 4, outcome: "correct", selected, correct };
  }

  // Proper subset — partial credit
  const marks = Math.min(3, selected.length);
  return { marks, outcome: "partial", selected, correct };
}

export function formatOptions(opts: string[]): string {
  return opts.length ? opts.map((o) => `(${o})`).join(" ") : "—";
}
