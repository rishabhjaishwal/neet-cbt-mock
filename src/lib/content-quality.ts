/**
 * Student-facing content gate: only English (or clean Latin) stems with
 * complete options. Never serve placeholders, OCR/Hindi mojibake,
 * “[Option N incomplete…]”, or unmatched-figure stubs.
 */

export type QualitySubject = {
  stem?: string | null;
  options?: Record<string, string> | null;
  placeholder?: boolean | null;
  figureKind?: string | null;
  figureSrc?: string | null;
};

export type QualityIssue =
  | "placeholder"
  | "unrecovered"
  | "incomplete-option"
  | "missing-option"
  | "devanagari"
  | "pua-junk"
  | "ocr-junk"
  | "latin-ocr"
  | "options-in-stem"
  | "option-mash"
  | "noisy-stem"
  | "missing-figure"
  | "image-filename"
  | "short-stem"
  | "empty";

const PLACEHOLDER_RE =
  /\[PLACEHOLDER\]|could not be recovered|Placeholder option/i;
const INCOMPLETE_RE = /incomplete in source PDF|\[Option\s*\d/i;
const OCR_JUNK_RE =
  /c:fi|w:rr|w::rr|IEnglish\s*\+\s*Hindi|English\+Hindi|English\+Hilidi|z\s*I\s*English|qldl|91cl|@dl|fiB\s|fiRUT|gm;@|m¼affl|cfiT|fll\{/i;
/** Latin stand-ins for Hindi/Symbol-font garbage (no empty alternates!). */
const LATIN_OCR_RE =
  /\bcfi[A-Za-z]|qff{2,}|wtiif|ftcR|a_,uy|@ct|:if\(|\\if[a-z]|r1i\.|:if\(1f/i;
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const PUA_RE = /[\uE000-\uF8FF]/;
const NEEDS_FIGURE_RE =
  /as shown in (the )?figure|see (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|figure below|from the given figure/i;
/** HF/OCR left literal media filenames as option/stem text with no shipped asset. */
const IMAGE_FILENAME_RE =
  /\b(?:image|img|figure|fig)[_-]?\d+\.(?:png|jpe?g|gif|webp|svg)\b/i;
const BARE_IMAGE_OPTION_RE =
  /^\s*(?:[\w./-]*\/)?(?:image|img|figure|fig)[_-]?\d+\.(?:png|jpe?g|gif|webp|svg)\s*$/i;

/** Minimum clean questions before a year paper is offered to students. */
export const MIN_STUDENT_PAPER_QUESTIONS = 80;

export function listQualityIssues(q: QualitySubject): QualityIssue[] {
  const stem = String(q.stem ?? "").trim();
  const opts = ["1", "2", "3", "4"].map((k) =>
    String(q.options?.[k] ?? "").trim(),
  );
  const blob = `${stem}\n${opts.join("\n")}`;
  const issues: QualityIssue[] = [];

  if (!stem) issues.push("empty");
  if (q.placeholder) issues.push("placeholder");
  if (PLACEHOLDER_RE.test(blob)) {
    if (/\[PLACEHOLDER\]|Placeholder option/i.test(blob)) issues.push("placeholder");
    if (/could not be recovered/i.test(blob)) issues.push("unrecovered");
  }
  if (INCOMPLETE_RE.test(blob)) issues.push("incomplete-option");
  if (opts.some((o) => !o)) issues.push("missing-option");
  if (DEVANAGARI_RE.test(blob)) issues.push("devanagari");
  if (PUA_RE.test(blob)) issues.push("pua-junk");
  if (OCR_JUNK_RE.test(blob)) issues.push("ocr-junk");
  if (LATIN_OCR_RE.test(blob)) issues.push("latin-ocr");
  if (stem.replace(/\s+/g, "").length < 15) issues.push("short-stem");

  const paren = stem.match(/\(\s*[1-4]\s*\)/g) || [];
  if (paren.length >= 3) {
    const isMatchList =
      /match the|column\s*[12i]|list[\s-]*[i1]\b|assertion|reason/i.test(stem);
    if (!isMatchList) issues.push("options-in-stem");
  }

  for (const o of opts) {
    if (/\(\s*[2-4]\s*\)/.test(o)) {
      issues.push("option-mash");
      break;
    }
    // Option swallowed a second question fragment
    if (o.length > 100 && (o.match(/\.\s+[A-Z]/g) || []).length >= 2) {
      issues.push("option-mash");
      break;
    }
  }

  const lens = opts.map((o) => o.length).sort((a, b) => a - b);
  if (lens[3] > 120 && lens[3] > Math.max(lens[1], 1) * 4) {
    issues.push("option-mash");
  }

  const noise = (stem.match(/[^A-Za-z0-9\s.,;:?'"()\-+/=%°μµΔδθαβγλσω_]/g) || [])
    .length;
  if (stem.length > 50 && noise / stem.length > 0.14) {
    issues.push("noisy-stem");
  }

  if (IMAGE_FILENAME_RE.test(blob) || opts.some((o) => BARE_IMAGE_OPTION_RE.test(o))) {
    issues.push("image-filename");
  }

  const figureSrc = String(q.figureSrc ?? "").trim();
  if (
    q.figureKind === "missing-placeholder" ||
    /unmatched crop|Figure not matched/i.test(figureSrc) ||
    (figureSrc.length > 0 &&
      IMAGE_FILENAME_RE.test(figureSrc) &&
      !figureSrc.includes("/figures/"))
  ) {
    if (NEEDS_FIGURE_RE.test(stem) || IMAGE_FILENAME_RE.test(figureSrc)) {
      issues.push("missing-figure");
    }
  }

  return [...new Set(issues)];
}

/**
 * If bilingual OCR dumped “(1) … (2) …” into the stem but options are already
 * complete Latin text, keep the English question prefix only.
 */
export function trimMergedOptionsFromStem(stem: string): string | null {
  const m = stem.match(/^(.*?)\s*\(\s*1\s*\)\s+/);
  if (!m) return null;
  const prefix = m[1].replace(/\s+/g, " ").trim();
  if (prefix.length < 20) return null;
  if (
    DEVANAGARI_RE.test(prefix) ||
    OCR_JUNK_RE.test(prefix) ||
    LATIN_OCR_RE.test(prefix) ||
    PUA_RE.test(prefix)
  ) {
    return null;
  }
  if (PLACEHOLDER_RE.test(prefix) || INCOMPLETE_RE.test(prefix)) return null;
  const letters = prefix.match(/[A-Za-z]/g) || [];
  if (letters.length < 18) return null;
  return prefix;
}

export function prepareStudentQuestion<T extends QualitySubject>(
  q: T,
): (T & { stem: string; options: Record<string, string> }) | null {
  const options: Record<string, string> = {
    "1": String(q.options?.["1"] ?? "").trim(),
    "2": String(q.options?.["2"] ?? "").trim(),
    "3": String(q.options?.["3"] ?? "").trim(),
    "4": String(q.options?.["4"] ?? "").trim(),
  };

  let stem = String(q.stem ?? "").trim();
  // Strip axis labels that OCR mashed into the isothermal/adiabatic stem.
  stem = stem
    .replace(
      /\s*A\s*\(\s*P_?A\s*,\s*V_?A\s*,\s*T_?A\s*\)\s*B\s*\(\s*P_?B\s*,\s*V_?B\s*,\s*T_?B\s*\)\s*P\s*C\s*\(\s*P_?C\s*,\s*V_?C\s*,\s*T_?C\s*\)\s*V\s*/i,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  const early = listQualityIssues({ ...q, stem, options });
  const hard = early.filter((i) => i !== "options-in-stem");
  if (hard.length) return null;

  if (early.includes("options-in-stem")) {
    const trimmed = trimMergedOptionsFromStem(stem);
    if (!trimmed) return null;
    stem = trimmed;
  }

  const finalIssues = listQualityIssues({
    ...q,
    stem,
    options,
    placeholder: false,
  });
  if (finalIssues.length) return null;

  return { ...q, stem, options, placeholder: false as T["placeholder"] };
}

export function isStudentReadyQuestion(q: QualitySubject): boolean {
  return prepareStudentQuestion(q) != null;
}

export function filterStudentQuestions<T extends QualitySubject>(
  questions: T[],
): Array<T & { stem: string; options: Record<string, string> }> {
  const out: Array<T & { stem: string; options: Record<string, string> }> = [];
  for (const q of questions) {
    const ready = prepareStudentQuestion(q);
    if (ready) out.push(ready);
  }
  return out;
}
