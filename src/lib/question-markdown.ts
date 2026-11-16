/**
 * Presentation-only helpers: turn stored question text into Markdown for display.
 * Never invents or rewrites wording — only adds structure (breaks, tables, escapes).
 */

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

/** Pair Column-I style (a)/(b) items with Column-II (i)/(ii) items when present. */
function matchColumnsToMarkdown(stem: string): string | null {
  const lower = stem.toLowerCase();
  if (
    !lower.includes("match the following") &&
    !lower.includes("column - i") &&
    !lower.includes("column-i") &&
    !/list\s*[-–]?\s*i\b/i.test(stem)
  ) {
    return null;
  }

  const leftRe = /\(([a-d])\)\s*/gi;
  const rightRe = /\(((?:iv|iii|ii|i))\)\s*/gi;
  const leftMarks = [...stem.matchAll(leftRe)];
  const rightMarks = [...stem.matchAll(rightRe)];
  if (leftMarks.length < 2 || rightMarks.length < 2) return null;

  // Intro: text before first (a) or "Column"
  const firstLeft = leftMarks[0].index ?? 0;
  const colIdx = stem.search(/Column\s*[-–]?\s*I\b/i);
  const introEnd = colIdx >= 0 && colIdx < firstLeft ? colIdx : firstLeft;
  const intro = stem.slice(0, introEnd).trim();

  const leftItems: { key: string; text: string }[] = [];
  for (let i = 0; i < leftMarks.length; i++) {
    const m = leftMarks[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < leftMarks.length ? (leftMarks[i + 1].index ?? stem.length) : stem.length;
    let text = stem.slice(start, end);
    // Stop before Column-II / right column markers if they appear in leftover
    text = text.replace(/\s*Column\s*[-–]?\s*II[\s\S]*$/i, "");
    text = text.replace(/\s*\(((?:iv|iii|ii|i))\)[\s\S]*$/i, "");
    text = text.replace(/\s*\(([a-d])\)\s*$/i, "");
    // Trailing selection prompt like "(a) (b) (c) (d)"
    text = text.replace(/\s*\(a\)\s*\(b\)\s*\(c\)\s*\(d\)\s*$/i, "");
    text = text.replace(/\s*Select the correct option\s*:?\s*$/i, "");
    text = text.replace(/\s*Which of the following is correct option\s*\??\s*$/i, "");
    text = text.trim();
    if (text) leftItems.push({ key: m[1].toLowerCase(), text });
  }

  // Right column: prefer marks that appear after Column II or after left block started mixing
  const col2 = stem.search(/Column\s*[-–]?\s*II\b/i);
  const rightStart = col2 >= 0 ? col2 : (rightMarks[0].index ?? 0);
  const rightSlice = stem.slice(rightStart);
  const rightInSlice = [...rightSlice.matchAll(rightRe)];
  const rightItems: { key: string; text: string }[] = [];
  for (let i = 0; i < rightInSlice.length; i++) {
    const m = rightInSlice[i];
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < rightInSlice.length ? (rightInSlice[i + 1].index ?? rightSlice.length) : rightSlice.length;
    let text = rightSlice.slice(start, end);
    text = text.replace(/\s*\(([a-d])\)[\s\S]*$/i, "");
    text = text.replace(/\s*\(a\)\s*\(b\)\s*\(c\)\s*\(d\)\s*$/i, "");
    text = text.replace(/\s*Select the correct option\s*:?\s*$/i, "");
    text = text.replace(/\s*Which of the following is correct option\s*\??\s*$/i, "");
    text = text.trim();
    if (text) rightItems.push({ key: m[1].toLowerCase(), text });
  }

  if (leftItems.length < 2 || rightItems.length < 2) return null;

  const rows = Math.max(leftItems.length, rightItems.length);
  const lines: string[] = [];
  if (intro) lines.push(intro, "");
  lines.push("| Column I | Column II |", "| --- | --- |");
  for (let i = 0; i < rows; i++) {
    const L = leftItems[i];
    const R = rightItems[i];
    const left = L ? `(${L.key}) ${escapeMdCell(L.text)}` : "";
    const right = R ? `(${R.key}) ${escapeMdCell(R.text)}` : "";
    lines.push(`| ${left} | ${right} |`);
  }

  // Keep a trailing prompt if present in original
  if (/\(a\)\s*\(b\)\s*\(c\)\s*\(d\)/i.test(stem)) {
    lines.push("", "**(a) (b) (c) (d)**");
  } else if (/select the correct option/i.test(stem)) {
    lines.push("", "Select the correct option:");
  }

  return lines.join("\n");
}

/** Soft-wrap “see figure / diagram” stems with a clear callout line — same words. */
function diagramHintMarkdown(stem: string): string | null {
  if (!/\b(see figure|following diagram|shown in the figure|as shown)\b/i.test(stem)) {
    return null;
  }
  // Keep full stem; only ensure readable paragraphs (no content change).
  return stem.replace(/\s+/g, " ").trim();
}

/**
 * Convert stored stem to Markdown for UI only.
 * Returns Markdown string; original DB/JSON text is untouched.
 */
export function stemToDisplayMarkdown(stem: string): string {
  const raw = stem ?? "";
  if (!raw.trim()) return "";

  const asMatch = matchColumnsToMarkdown(raw);
  if (asMatch) return asMatch;

  const diagram = diagramHintMarkdown(raw);
  if (diagram) return diagram;

  // Preserve intentional newlines; collapse messy single-line spacing lightly for readability
  if (raw.includes("\n")) {
    return raw.replace(/\r\n/g, "\n").trim();
  }
  return raw.replace(/\s+/g, " ").trim();
}

/** Options: keep wording; keep multi-token answers on one visual line via non-breaking spaces between tokens when match-style. */
export function optionToDisplayMarkdown(option: string): string {
  const t = (option ?? "").trim();
  if (!t) return "";
  // Match-style keys like "(i) (iii) (ii) (iv)" — keep on one line
  if (/^\([ivx]+\)(\s+\([ivx]+\))+$/i.test(t) || /^\([a-d]\)(\s+\([a-d]\))+$/i.test(t)) {
    return t.replace(/ /g, "\u00a0");
  }
  return t;
}
