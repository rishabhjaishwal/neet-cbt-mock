/**
 * Presentation-only helpers: turn stored question text into Markdown for display.
 * Never invents scientific content — only adds structure (breaks, tables, math wraps).
 */

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

/** Wrap common physics/chem subscripts for KaTeX without changing meaning. */
export function applyInlineMathHints(text: string): string {
  const t = text;
  // Avoid double-wrapping inside existing $...$
  const parts = t.split(/(\$[^$]+\$)/);
  return parts
    .map((part) => {
      if (part.startsWith("$") && part.endsWith("$")) return part;
      let s = part;
      // n1 / n2 / ml / ms / l / quantum-style: n_2 = 3
      s = s.replace(/\bn([12])\b(?!\s*[=])/g, "n_$1");
      s = s.replace(/\bn_([12])\s*=\s*(\d+)/g, "$n_$1 = $2$");
      s = s.replace(/\bn([12])\s*=\s*(\d+)/g, "$n_$1 = $2$");
      // leftover bare n1/n2 as math
      s = s.replace(/(?<!\$)\bn_([12])\b(?!\$)/g, "$n_$1$");
      s = s.replace(/(?<!\$)\bm_([lsl])\b(?!\$)/g, "$m_$1$");
      // Common molecular formulas (avoid wrapping inside [complex] brackets)
      s = s.replace(
        /(?<!\$)\b(H2O|CO2|O2|N2|H2|NH3|CH4|CaCl2|Fe2O3|SO2|SO3|NO2|H2SO4)\b(?!\$)/g,
        (m) => `$${m.replace(/(\d+)/g, "_{$1}")}$`,
      );
      // charged ions like Mn2+ / Fe3+
      s = s.replace(
        /(?<!\$)\b([A-Z][a-z]?)(\d+)([+\-−])\b(?!\$)/g,
        "$$1^{$2$3}$",
      );
      return s;
    })
    .join("");
}

function normalizeListHeaders(beforeItems: string): {
  intro: string;
  leftHeader: string;
  rightHeader: string;
} {
  const chunk = beforeItems
    .replace(/\s+/g, " ")
    .replace(/^Match\s+List\s*[-–]?\s*I\s+with\s+List\s*[-–]?\s*II\s*[:.]?\s*/i, "")
    .replace(/^List\s*[-–]?\s*I\s+List\s*[-–]?\s*II\s*/i, "")
    .replace(/^List\s*[-–]?\s*I\s*/i, "")
    .trim();

  const intro = "Match List I with List II.";

  // Clean sequential headers: (Process) (Conditions)
  const sequential = chunk.match(
    /^\(([^()]{2,80})\)\s*\(([^()]{2,80})\)\s*$/,
  );
  if (sequential) {
    return {
      intro,
      leftHeader: sequential[1].trim(),
      rightHeader: sequential[2].trim(),
    };
  }

  // Nested smash: (Spectral Lines of (Wavelengths (nm)) Hydrogen for transitions from)
  const nested = chunk.match(/^\((.+)\)\s*$/);
  if (nested) {
    const inner = nested[1];
    // Prefer full "(Wavelengths (nm))" group over bare "(nm)"
    const nestHit =
      inner.match(/\((Wavelengths?\s*\([^)]+\))\)/i) ||
      inner.match(
        /\(([^()]*(?:wavelength|condition|reagent|shape|geometry|isomer|bond|faraday|information|character|example|type)[^()]*)\)/i,
      );
    if (nestHit && nestHit.index != null) {
      const right = nestHit[1].trim();
      const left = `${inner.slice(0, nestHit.index)} ${inner.slice(nestHit.index + nestHit[0].length)}`
        .replace(/\s+/g, " ")
        .trim();
      if (left.length > 3 && right.length > 1) {
        return { intro, leftHeader: left, rightHeader: right };
      }
    }
  }

  // "List I (X) List II (Y)" leftovers
  const labeled = beforeItems.match(
    /List\s*[-–]?\s*I\s*\(([^)]+)\)\s*List\s*[-–]?\s*II\s*\(([^)]+)\)/i,
  );
  if (labeled) {
    return {
      intro,
      leftHeader: labeled[1].trim(),
      rightHeader: labeled[2].trim(),
    };
  }

  // Bare "(Complex) List II (Type of isomerism)" mid-forms
  const mid = chunk.match(
    /^(?:List\s*I\s*)?\(([^)]+)\)\s*(?:List\s*II\s*)?\(([^)]+)\)/i,
  );
  if (mid) {
    return { intro, leftHeader: mid[1].trim(), rightHeader: mid[2].trim() };
  }

  return { intro, leftHeader: "List I", rightHeader: "List II" };
}

/**
 * NEET "Match List I / List II" with A./B./C./D. and I./II./III./IV. markers
 * (often OCR-interleaved as A. … I. … B. … II. …).
 */
function matchListAIToMarkdown(stem: string): string | null {
  if (!/Match\s+List/i.test(stem)) return null;
  // Items always start at A. — ignore "List I." / "List II." periods in the intro.
  const firstA = stem.search(/\bA\.\s/);
  if (firstA < 0) return null;
  if (!/\bI\.\s/.test(stem.slice(firstA))) return null;

  const headerChunk = stem.slice(0, firstA);
  const body = stem.slice(firstA);
  const { intro, leftHeader, rightHeader } = normalizeListHeaders(headerChunk);

  const markerRe = /\b([A-D]|IV|III|II|I)\.\s*/g;
  const marks = [...body.matchAll(markerRe)];
  const letters = marks.filter((m) => /^[A-D]$/.test(m[1]));
  const romans = marks.filter((m) => /^(IV|III|II|I)$/.test(m[1]));
  if (letters.length < 2 || romans.length < 2) return null;

  type Item = { key: string; text: string };
  const leftItems: Item[] = [];
  const rightItems: Item[] = [];

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const key = m[1];
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < marks.length ? (marks[i + 1].index ?? body.length) : body.length;
    let text = body.slice(start, end);
    text = text.replace(
      /\s*Choose the correct answer from the options given below\s*:?\s*$/i,
      "",
    );
    text = text.replace(/\s*Select the correct answer from the options given below\s*:?\s*$/i, "");
    text = text.replace(/\s*Choose the correct answer from the option given below\s*:?\s*$/i, "");
    text = text.trim();
    // Keep empty left cells (OCR often drops structural diagrams between A. and I.)
    if (/^[A-D]$/.test(key)) leftItems.push({ key, text: text || "*(structure)*" });
    else if (text) rightItems.push({ key, text });
  }

  if (leftItems.length < 2 || rightItems.length < 2) return null;

  // Preserve official order of romans as they appear
  const rows = Math.max(leftItems.length, rightItems.length);
  const lines: string[] = [];
  lines.push(intro, "");
  const lh = leftHeader === "List I" ? "List I" : `List I (${leftHeader})`;
  const rh = rightHeader === "List II" ? "List II" : `List II (${rightHeader})`;
  lines.push(`| ${escapeMdCell(lh)} | ${escapeMdCell(rh)} |`);
  lines.push("| --- | --- |");
  for (let i = 0; i < rows; i++) {
    const L = leftItems[i];
    const R = rightItems[i];
    const left = L
      ? `**${L.key}.** ${escapeMdCell(applyInlineMathHints(L.text))}`
      : "";
    const right = R
      ? `**${R.key}.** ${escapeMdCell(applyInlineMathHints(R.text))}`
      : "";
    lines.push(`| ${left} | ${right} |`);
  }

  if (/Choose the correct answer from the options? given below/i.test(stem)) {
    lines.push("", "Choose the correct answer from the options given below:");
  } else if (/Select the correct answer from the options given below/i.test(stem)) {
    lines.push("", "Select the correct answer from the options given below:");
  }

  return lines.join("\n");
}

type ColumnItem = { key: string; text: string };

function isColumnMatchStem(stem: string): boolean {
  const lower = stem.toLowerCase();
  return (
    lower.includes("match the following") ||
    lower.includes("match the items") ||
    lower.includes("match the column") ||
    lower.includes("match the organisms") ||
    lower.includes("column - i") ||
    lower.includes("column-i") ||
    /column\s*[-–]?\s*i\b/i.test(stem) ||
    /list\s*[-–]?\s*i\b/i.test(stem) ||
    /match\s+list/i.test(stem)
  );
}

/** Recover OCR smash: "Glomerular" + "… nephritis urine" → "Glomerular nephritis" / "… urine". */
function repairColumnOcrPair(left: ColumnItem, right: ColumnItem): void {
  const smash = right.text.match(
    /^(Presence of glucose in)\s+nephritis\s+(urine)\b/i,
  );
  if (smash && /^Glomerular$/i.test(left.text.trim())) {
    left.text = "Glomerular nephritis";
    right.text = `${smash[1]} ${smash[2]}`;
    return;
  }
  // "Concentration" + "Ureter of urine" / "Transport of" + "Urinary bladder urine"
  const ofUrine = right.text.match(/^(.*?)\s+of urine\b/i);
  if (ofUrine && /^(Concentration|Transport)$/i.test(left.text.trim())) {
    left.text = `${left.text.trim()} of urine`;
    right.text = ofUrine[1].trim();
  }
}

function buildColumnTable(
  intro: string,
  leftHeader: string,
  rightHeader: string,
  leftItems: ColumnItem[],
  rightItems: ColumnItem[],
  stem: string,
  leftFmt: (item: ColumnItem) => string,
  rightFmt: (item: ColumnItem) => string,
): string {
  for (let i = 0; i < Math.min(leftItems.length, rightItems.length); i++) {
    repairColumnOcrPair(leftItems[i], rightItems[i]);
  }
  const rows = Math.max(leftItems.length, rightItems.length);
  const lines: string[] = [];
  const cleanIntro =
    intro
      .replace(/\s*Column\s*[-–]?\s*I\s+Column\s*[-–]?\s*II\s*/i, " ")
      .replace(/\s*List\s*[-–]?\s*I\s+List\s*[-–]?\s*II.*$/i, "")
      .replace(/\s+/g, " ")
      .trim() || "Match Column I with Column II.";
  lines.push(cleanIntro, "");
  lines.push(`| ${escapeMdCell(leftHeader)} | ${escapeMdCell(rightHeader)} |`);
  lines.push("| --- | --- |");
  for (let i = 0; i < rows; i++) {
    const L = leftItems[i];
    const R = rightItems[i];
    lines.push(
      `| ${L ? leftFmt(L) : ""} | ${R ? rightFmt(R) : ""} |`,
    );
  }
  if (/\ba\s+b\s+c\s+d\b/i.test(stem) || /\(a\)\s*\(b\)\s*\(c\)\s*\(d\)/i.test(stem)) {
    lines.push("", "**a b c d**");
  } else if (/select the correct option/i.test(stem)) {
    lines.push("", "Select the correct option:");
  } else if (/Choose the correct answer|select the correct option given below/i.test(stem)) {
    lines.push("", "Choose the correct answer from the options given below:");
  }
  return lines.join("\n");
}

/**
 * Dot-style Column I/II: "a. Glycosuria i. … b. Gout ii. …"
 * (common OCR-flat NEET extract — not parenthesized).
 */
function matchColumnsDotToMarkdown(stem: string): string | null {
  if (!isColumnMatchStem(stem)) return null;
  const firstA = stem.search(/\ba\.\s+/i);
  if (firstA < 0) return null;
  if (!/\bi\.\s+/i.test(stem.slice(firstA))) return null;

  const headerChunk = stem.slice(0, firstA);
  let body = stem.slice(firstA);
  body = body
    .replace(/\s*Choose the correct answer from the options given below\s*:?\s*$/i, "")
    .replace(/\s*Select the correct option(?: given below)?\s*:?\s*$/i, "")
    .replace(/\s*\ba\s+b\s+c(?:\s+d)?\s*$/i, "")
    .trim();

  // Longer roman numerals first so "iv." is not read as "i." + "v."
  const markerRe = /\b([a-d]|iv|iii|ii|i)\.\s+/gi;
  const marks = [...body.matchAll(markerRe)];
  const leftMarks = marks.filter((m) => /^[a-d]$/i.test(m[1]));
  const rightMarks = marks.filter((m) => /^(iv|iii|ii|i)$/i.test(m[1]));
  if (leftMarks.length < 2 || rightMarks.length < 2) return null;

  const leftItems: ColumnItem[] = [];
  const rightItems: ColumnItem[] = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const key = m[1].toLowerCase();
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < marks.length ? (marks[i + 1].index ?? body.length) : body.length;
    let text = body.slice(start, end).trim();
    text = text.replace(/\s+/g, " ");
    if (/^[a-d]$/.test(key)) {
      leftItems.push({ key, text: text || "*(see paper)*" });
    } else if (text) {
      rightItems.push({ key, text });
    }
  }
  if (leftItems.length < 2 || rightItems.length < 2) return null;

  let leftHeader = "Column I";
  let rightHeader = "Column II";
  const labeled = headerChunk.match(
    /Column\s*[-–]?\s*I\s*\(([^)]+)\)\s*Column\s*[-–]?\s*II\s*\(([^)]+)\)/i,
  );
  if (labeled) {
    leftHeader = `Column I (${labeled[1].trim()})`;
    rightHeader = `Column II (${labeled[2].trim()})`;
  } else {
    const seq = headerChunk.match(/\(([^)]{2,40})\)\s*\(([^)]{2,40})\)/);
    if (seq) {
      leftHeader = `Column I (${seq[1].trim()})`;
      rightHeader = `Column II (${seq[2].trim()})`;
    }
  }

  const intro =
    headerChunk.replace(/\s+/g, " ").trim() ||
    "Match the items given in Column I with those in Column II.";

  return buildColumnTable(
    intro,
    leftHeader,
    rightHeader,
    leftItems,
    rightItems,
    stem,
    (L) => `**${L.key}.** ${escapeMdCell(applyInlineMathHints(L.text))}`,
    (R) => `**${R.key}.** ${escapeMdCell(applyInlineMathHints(R.text))}`,
  );
}

/** Pair Column-I style (a)/(b) items with Column-II (i)/(ii) items when present. */
function matchColumnsToMarkdown(stem: string): string | null {
  if (!isColumnMatchStem(stem)) return null;

  // Prefer parenthesized form when present; else fall through to a./i. parser.
  const firstLeftIdx = stem.search(/\([a-d]\)\s*/i);
  if (firstLeftIdx < 0) return matchColumnsDotToMarkdown(stem);
  const headerChunk = stem.slice(0, firstLeftIdx);
  const body = stem.slice(firstLeftIdx);
  const intro =
    headerChunk.replace(/\s+/g, " ").trim() ||
    "Match List - I with List - II.";

  // Drop trailing choice prompt so "(a) (b) (c) (d)" is not re-tokenized.
  const bodyCore = body
    .replace(/\s*Choose the correct answer from the options given below[\s\S]*$/i, "")
    .replace(/\s*Select the correct option\s*:?[\s\S]*$/i, "")
    .trim();

  // Interleaved (a)…(i)…(b)…(ii)… — tokenize from first (a)
  const markerRe = /\(((?:[a-d]|iv|iii|ii|i))\)\s*/gi;
  const marks = [...bodyCore.matchAll(markerRe)];
  const leftMarks = marks.filter((m) => /^[a-d]$/i.test(m[1]));
  const rightMarks = marks.filter((m) => /^(iv|iii|ii|i)$/i.test(m[1]));
  if (leftMarks.length < 2 || rightMarks.length < 2) {
    return matchColumnsDotToMarkdown(stem);
  }

  const leftItems: ColumnItem[] = [];
  const rightItems: ColumnItem[] = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const key = m[1].toLowerCase();
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < marks.length ? (marks[i + 1].index ?? bodyCore.length) : bodyCore.length;
    const text = bodyCore.slice(start, end).trim();
    if (/^[a-d]$/.test(key)) {
      leftItems.push({ key, text: text || "*(see paper)*" });
    } else if (text) {
      rightItems.push({ key, text });
    }
  }

  if (leftItems.length < 2 || rightItems.length < 2) {
    return matchColumnsDotToMarkdown(stem);
  }

  // Recover headers from intro when present as sequential (X) (Y) after List labels
  let leftHeader = "Column I";
  let rightHeader = "Column II";
  const hdr = headerChunk.match(/\(([^)]{2,60})\)\s*\(([^)]{2,60})\)/);
  if (hdr) {
    leftHeader = `Column I (${hdr[1].trim()})`;
    rightHeader = `Column II (${hdr[2].trim()})`;
  }

  return buildColumnTable(
    intro,
    leftHeader,
    rightHeader,
    leftItems,
    rightItems,
    stem,
    (L) => `(${L.key}) ${escapeMdCell(applyInlineMathHints(L.text))}`,
    (R) => `(${R.key}) ${escapeMdCell(applyInlineMathHints(R.text))}`,
  );
}

/** Assertion–Reason / Statement I–II stems → clear stacked blocks. */
function assertionReasonMarkdown(stem: string): string | null {
  const hasAssert = /Assertion\s*A\b|Assertion\s*\(A\)/i.test(stem);
  const hasReason = /Reason\s*R\b|Reasons?\s*R\b|Reason\s*\(R\)/i.test(stem);
  const hasStmt =
    /Statement\s*I\b/i.test(stem) && /Statement\s*II\b/i.test(stem);
  if (!hasAssert && !hasReason && !hasStmt) return null;

  let t = stem.replace(/\s+/g, " ").trim();
  const lines: string[] = [];

  const given = t.match(
    /^(Given below are two statements[^:]*:\s*)/i,
  );
  if (given) {
    lines.push(given[1].trim());
    t = t.slice(given[0].length).trim();
  }

  if (hasAssert || hasReason) {
    const aMatch = t.match(
      /Assertion\s*A\s*:\s*([\s\S]*?)(?=\s*Reasons?\s*R\s*:)/i,
    );
    const rMatch = t.match(
      /Reasons?\s*R\s*:\s*([\s\S]*?)(?=\s*In the light of the above|\s*Choose the correct|$)/i,
    );
    if (aMatch) {
      lines.push(`**Assertion (A):** ${applyInlineMathHints(aMatch[1].trim())}`);
      lines.push("");
    }
    if (rMatch) {
      lines.push(`**Reason (R):** ${applyInlineMathHints(rMatch[1].trim())}`);
      lines.push("");
    }
    if (!aMatch && !rMatch) return null;
  } else if (hasStmt) {
    const s1 = t.match(
      /Statement\s*I\s*:\s*([\s\S]*?)(?=\s*Statement\s*II\s*:)/i,
    );
    const s2 = t.match(
      /Statement\s*II\s*:\s*([\s\S]*?)(?=\s*In the light of the above|\s*Choose the correct|$)/i,
    );
    if (!s1 || !s2) return null;
    lines.push(`**Statement I:** ${applyInlineMathHints(s1[1].trim())}`);
    lines.push("");
    lines.push(`**Statement II:** ${applyInlineMathHints(s2[1].trim())}`);
    lines.push("");
  }

  const tail = stem.match(
    /(In the light of the above statements[\s\S]*)$/i,
  );
  if (tail) {
    lines.push(tail[1].replace(/\s+/g, " ").trim());
  } else if (/Choose the correct answer/i.test(stem)) {
    lines.push("Choose the correct answer from the options given below:");
  }

  return lines.join("\n").trim() || null;
}

/** Soft-wrap “see figure / diagram” stems with readable spacing — same words. */
function diagramHintMarkdown(stem: string): string | null {
  if (!/\b(see figure|following diagram|shown in the figure|as shown|given figure)\b/i.test(stem)) {
    return null;
  }
  return applyInlineMathHints(stem.replace(/\s+/g, " ").trim());
}

/**
 * Convert stored stem to Markdown for UI only.
 * Returns Markdown string; original DB/JSON text is untouched.
 */
export function stemToDisplayMarkdown(stem: string): string {
  const raw = stem ?? "";
  if (!raw.trim()) return "";

  const asListAI = matchListAIToMarkdown(raw);
  if (asListAI) return asListAI;

  const asMatch = matchColumnsToMarkdown(raw);
  if (asMatch) return asMatch;

  const asDot = matchColumnsDotToMarkdown(raw);
  if (asDot) return asDot;

  const asAssert = assertionReasonMarkdown(raw);
  if (asAssert) return asAssert;

  const diagram = diagramHintMarkdown(raw);
  if (diagram) return diagram;

  if (raw.includes("\n")) {
    return applyInlineMathHints(raw.replace(/\r\n/g, "\n").trim());
  }
  return applyInlineMathHints(raw.replace(/\s+/g, " ").trim());
}

/** Options: keep wording; keep multi-token answers on one visual line. */
export function optionToDisplayMarkdown(option: string): string {
  const t = (option ?? "").trim();
  if (!t) return "";
  if (/^\([ivx]+\)(\s+\([ivx]+\))+$/i.test(t) || /^\([a-d]\)(\s+\([a-d]\))+$/i.test(t)) {
    return t.replace(/ /g, "\u00a0");
  }
  // Match-style A-III, B-IV → readable em-dashes
  if (/^[A-D]\s*[-–—]\s*(IV|III|II|I)\b/i.test(t) || /[A-D]\s*-\s*(IV|III|II|I)/i.test(t)) {
    return applyInlineMathHints(
      t.replace(/([A-D])\s*[-–—]\s*/gi, "$1 — ").replace(/,\s*/g, ", "),
    );
  }
  return applyInlineMathHints(t);
}
