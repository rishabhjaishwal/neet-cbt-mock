import { partitionTopicStrength, type StrengthTopic } from "./topic-strength";

export type TopicAgg = {
  key: string;
  subject: string;
  topic: string;
  correct: number;
  wrong: number;
  unattempted: number;
  partial: number;
  accuracy: number;
  attempts: number;
  /** Score as % of marks available on tried+skipped items (rough). */
  scorePct: number;
};

export type SubjectAgg = {
  subject: string;
  correct: number;
  wrong: number;
  unattempted: number;
  partial: number;
  accuracy: number;
  attempts: number;
  scorePct: number;
};

export type TopicDashboardAnalytics = {
  topics: TopicAgg[];
  subjects: SubjectAgg[];
  /** Poorest topics first (need work). */
  poorTopics: TopicAgg[];
  /** Poorest subjects first. */
  poorSubjects: SubjectAgg[];
  /** Unattempted counts for pie (subjects with any skips). */
  unattemptedBySubject: Array<{ subject: string; unattempted: number }>;
  /** Drill-down: unattempted by topic within subject. */
  unattemptedByTopic: Record<
    string,
    Array<{ topic: string; unattempted: number; key: string }>
  >;
};

type TopicRow = {
  topic: string;
  subject: string;
  correct?: number;
  wrong?: number;
  unattempted?: number;
  partial?: number;
  accuracy?: number;
};

type PaperLike = {
  subjectStats?: Record<
    string,
    { correct?: number; wrong?: number; unattempted?: number; partial?: number }
  > | null;
  topicStats?: {
    topics?: TopicRow[];
  } | null;
};

type TopicAttemptLike = {
  subject: string;
  topic: string;
  correctCount?: number | null;
  wrongCount?: number | null;
  unattemptedCount?: number | null;
  subjectStats?: Record<
    string,
    { correct?: number; wrong?: number; unattempted?: number; partial?: number }
  > | null;
};

function bumpTopic(
  map: Map<string, TopicAgg>,
  row: {
    subject: string;
    topic: string;
    correct: number;
    wrong: number;
    unattempted: number;
    partial: number;
  },
) {
  const subject = String(row.subject || "General");
  const topic = String(row.topic || "General");
  const key = `${subject}::${topic}`;
  const cur = map.get(key) || {
    key,
    subject,
    topic,
    correct: 0,
    wrong: 0,
    unattempted: 0,
    partial: 0,
    accuracy: 0,
    attempts: 0,
    scorePct: 0,
  };
  cur.correct += row.correct;
  cur.wrong += row.wrong;
  cur.unattempted += row.unattempted;
  cur.partial += row.partial;
  cur.attempts += 1;
  map.set(key, cur);
}

function finalizeTopics(map: Map<string, TopicAgg>): TopicAgg[] {
  return [...map.values()]
    .map((t) => {
      const tried = t.correct + t.wrong + t.partial;
      const accuracy = tried
        ? Math.round((1000 * (t.correct + 0.5 * t.partial)) / tried) / 10
        : 0;
      const marks = t.correct * 4 - t.wrong + t.partial;
      const maxMarks = Math.max(1, (tried + t.unattempted) * 4);
      const scorePct = Math.round((1000 * marks) / maxMarks) / 10;
      return { ...t, accuracy, scorePct };
    })
    .sort((a, b) => a.accuracy - b.accuracy || b.unattempted - a.unattempted);
}

function subjectsFromTopics(topics: TopicAgg[]): SubjectAgg[] {
  const map = new Map<string, SubjectAgg>();
  for (const t of topics) {
    const cur = map.get(t.subject) || {
      subject: t.subject,
      correct: 0,
      wrong: 0,
      unattempted: 0,
      partial: 0,
      accuracy: 0,
      attempts: 0,
      scorePct: 0,
    };
    cur.correct += t.correct;
    cur.wrong += t.wrong;
    cur.unattempted += t.unattempted;
    cur.partial += t.partial;
    cur.attempts += t.attempts;
    map.set(t.subject, cur);
  }
  return [...map.values()]
    .map((s) => {
      const tried = s.correct + s.wrong + s.partial;
      const accuracy = tried
        ? Math.round((1000 * (s.correct + 0.5 * s.partial)) / tried) / 10
        : 0;
      const marks = s.correct * 4 - s.wrong + s.partial;
      const maxMarks = Math.max(1, (tried + s.unattempted) * 4);
      const scorePct = Math.round((1000 * marks) / maxMarks) / 10;
      return { ...s, accuracy, scorePct };
    })
    .sort((a, b) => a.accuracy - b.accuracy || b.unattempted - a.unattempted);
}

/**
 * Aggregate paper topicStats + topic-mock attempts into dashboard analytics.
 */
export function buildTopicDashboardAnalytics(
  papers: PaperLike[],
  topicAttempts: TopicAttemptLike[],
): TopicDashboardAnalytics {
  const map = new Map<string, TopicAgg>();

  for (const p of papers) {
    const topics = p.topicStats?.topics;
    if (Array.isArray(topics) && topics.length) {
      for (const t of topics) {
        bumpTopic(map, {
          subject: t.subject,
          topic: t.topic,
          correct: t.correct || 0,
          wrong: t.wrong || 0,
          unattempted: t.unattempted || 0,
          partial: t.partial || 0,
        });
      }
      continue;
    }
    // Fallback: subject-only rolls when topicStats missing
    for (const [subject, s] of Object.entries(p.subjectStats || {})) {
      bumpTopic(map, {
        subject,
        topic: `${subject} General`,
        correct: s.correct || 0,
        wrong: s.wrong || 0,
        unattempted: s.unattempted || 0,
        partial: s.partial || 0,
      });
    }
  }

  for (const a of topicAttempts) {
    const stats = a.subjectStats?.[a.subject];
    bumpTopic(map, {
      subject: a.subject,
      topic: a.topic,
      correct: stats?.correct ?? a.correctCount ?? 0,
      wrong: stats?.wrong ?? a.wrongCount ?? 0,
      unattempted: stats?.unattempted ?? a.unattemptedCount ?? 0,
      partial: stats?.partial ?? 0,
    });
  }

  const topics = finalizeTopics(map);
  const subjects = subjectsFromTopics(topics);

  const strengthRows: StrengthTopic[] = topics.map((t) => ({
    topic: t.topic,
    subject: t.subject,
    correct: t.correct,
    wrong: t.wrong,
    unattempted: t.unattempted,
    partial: t.partial,
    accuracy: t.accuracy,
  }));
  const { weak } = partitionTopicStrength(strengthRows);
  const weakKeys = new Set(weak.map((t) => `${t.subject}::${t.topic}`));

  // Prefer strength-weak list; pad with lowest accuracy if needed
  const poorTopics = [
    ...topics.filter((t) => weakKeys.has(t.key)),
    ...topics.filter((t) => !weakKeys.has(t.key)),
  ]
    .filter((t) => t.correct + t.wrong + t.partial + t.unattempted > 0)
    .slice(0, 12);

  const poorSubjects = [...subjects]
    .filter((s) => s.correct + s.wrong + s.partial + s.unattempted > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.unattempted - a.unattempted)
    .slice(0, 6);

  const unattemptedBySubject = subjects
    .filter((s) => s.unattempted > 0)
    .map((s) => ({ subject: s.subject, unattempted: s.unattempted }))
    .sort((a, b) => b.unattempted - a.unattempted);

  const unattemptedByTopic: TopicDashboardAnalytics["unattemptedByTopic"] = {};
  for (const t of topics) {
    if (t.unattempted <= 0) continue;
    (unattemptedByTopic[t.subject] ||= []).push({
      topic: t.topic,
      unattempted: t.unattempted,
      key: t.key,
    });
  }
  for (const list of Object.values(unattemptedByTopic)) {
    list.sort((a, b) => b.unattempted - a.unattempted);
  }

  return {
    topics,
    subjects,
    poorTopics,
    poorSubjects,
    unattemptedBySubject,
    unattemptedByTopic,
  };
}
