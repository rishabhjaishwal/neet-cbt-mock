/** Shared weak/strong topic rules — UI and scoring must stay in sync. */

export const WEAK_ACCURACY_MAX = 45; // exclusive upper bound for "needing work"
export const STRONG_ACCURACY_MIN = 70; // inclusive floor for "strong"
export const MIN_TRIED_FOR_STRENGTH = 2;

export type StrengthTopic = {
  topic: string;
  subject: string;
  correct: number;
  wrong: number;
  unattempted?: number;
  partial?: number;
  accuracy: number;
};

export function topicTried(t: {
  correct: number;
  wrong: number;
  partial?: number;
}) {
  return t.correct + t.wrong + (t.partial || 0);
}

/** Weak only if low accuracy + enough tries. Never overlaps strong. */
export function isWeakTopic(t: StrengthTopic) {
  const tried = topicTried(t);
  return tried >= MIN_TRIED_FOR_STRENGTH && t.accuracy < WEAK_ACCURACY_MAX;
}

/** Strong only if high accuracy + enough tries. Never overlaps weak. */
export function isStrongTopic(t: StrengthTopic) {
  const tried = topicTried(t);
  return tried >= MIN_TRIED_FOR_STRENGTH && t.accuracy >= STRONG_ACCURACY_MIN;
}

export function partitionTopicStrength(topics: StrengthTopic[]) {
  const weak = topics
    .filter(isWeakTopic)
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong);
  const strong = topics
    .filter(isStrongTopic)
    .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct);

  // Belt-and-suspenders: drop any accidental overlap (prefer weak if conflict).
  const weakKeys = new Set(weak.map((t) => `${t.subject}::${t.topic}`));
  const strongExclusive = strong.filter(
    (t) => !weakKeys.has(`${t.subject}::${t.topic}`),
  );

  return { weak, strong: strongExclusive };
}

export function formatTopicLabel(t: { topic: string; subject: string }) {
  return `${t.topic} (${t.subject})`;
}
