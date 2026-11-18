/**
 * Strip answer keys / solutions from question payloads while an attempt is live.
 * Results / submitted views may keep keys, solutions, and study links.
 */

const SECRET_KEYS = [
  "correctOption",
  "correctOptions",
  "solution",
  "studyLinks",
  "answerEstimated",
] as const;

export type ExamSecretKey = (typeof SECRET_KEYS)[number];

export function stripExamSecrets<T extends Record<string, unknown>>(
  question: T,
): Omit<T, ExamSecretKey> {
  const out = { ...question };
  for (const key of SECRET_KEYS) {
    delete out[key];
  }
  return out as Omit<T, ExamSecretKey>;
}

export function mapQuestionsForExamView<T extends Record<string, unknown>>(
  questions: T[],
  revealKeys: boolean,
): Array<T | Omit<T, ExamSecretKey>> {
  if (revealKeys) return questions;
  return questions.map((q) => stripExamSecrets(q));
}

/** Refuse booklet URLs that look like answer keys / solutions. */
export function assertQuestionPaperPdfUrl(url: string): string {
  const lower = url.toLowerCase();
  const banned = [
    "answer",
    "answers",
    "answer-key",
    "answer_key",
    "anskey",
    "solution",
    "solutions",
    "key.pdf",
    "keys.pdf",
    "official-key",
  ];
  if (banned.some((b) => lower.includes(b))) {
    throw new Error(
      `Refusing PDF URL that may leak keys during exam: ${url.slice(0, 120)}`,
    );
  }
  // Prefer explicit question booklet naming when present.
  if (lower.includes(".pdf") && !lower.includes("question")) {
    // Allow unlabeled booklets; only hard-fail on banned tokens above.
  }
  return url;
}
