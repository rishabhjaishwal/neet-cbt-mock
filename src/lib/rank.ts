/**
 * Year-aware NEET-like score → percentile / rank model.
 * Anchored to published candidature; not an official NTA rank.
 */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Piecewise cumulative distribution roughly matching public NEET score bands. */
function percentileFromScore(score: number): number {
  const s = clamp(score, -180, 720);
  // Empirical-ish knots: (score, percentile among test-takers)
  const knots: Array<[number, number]> = [
    [-180, 0.05],
    [0, 8],
    [100, 22],
    [200, 38],
    [300, 55],
    [400, 72],
    [450, 82],
    [500, 90],
    [550, 95.5],
    [600, 98.4],
    [650, 99.5],
    [680, 99.85],
    [700, 99.97],
    [720, 99.995],
  ];
  if (s <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1];
    const [x1, y1] = knots[i];
    if (s <= x1) {
      const t = (s - x0) / (x1 - x0 || 1);
      return y0 + t * (y1 - y0);
    }
  }
  return 99.995;
}

export function estimateRankPercentile(score: number, candidateCount: number) {
  const percentile = clamp(percentileFromScore(score), 0.01, 99.99);
  const estimatedRank = Math.max(
    1,
    Math.round(candidateCount * (1 - percentile / 100)),
  );
  return {
    percentile: Math.round(percentile * 100) / 100,
    estimatedRank,
  };
}

/** Score bands for results UI (relative to that year’s candidature). */
export function scoreBands(candidateCount: number) {
  const marks = [200, 300, 400, 500, 550, 600, 650];
  return marks.map((score) => {
    const { percentile, estimatedRank } = estimateRankPercentile(
      score,
      candidateCount,
    );
    return { score, percentile, estimatedRank };
  });
}
