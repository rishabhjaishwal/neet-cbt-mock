"use client";

import {
  MIN_TRIED_FOR_STRENGTH,
  STRONG_ACCURACY_MIN,
  WEAK_ACCURACY_MAX,
  formatTopicLabel,
  partitionTopicStrength,
  topicTried,
} from "@/lib/topic-strength";

type SubjectStat = {
  correct: number;
  wrong: number;
  unattempted: number;
  partial?: number;
  accuracy: number;
};

type TopicStat = {
  topic: string;
  subject: string;
  correct: number;
  wrong: number;
  unattempted: number;
  partial?: number;
  accuracy: number;
};

type OutcomeTotals = {
  correct: number;
  wrong: number;
  unattempted: number;
  partial?: number;
};

function sumSubjects(subjectStats: Record<string, SubjectStat>): OutcomeTotals {
  const out: OutcomeTotals = { correct: 0, wrong: 0, unattempted: 0, partial: 0 };
  for (const s of Object.values(subjectStats)) {
    out.correct += s.correct || 0;
    out.wrong += s.wrong || 0;
    out.unattempted += s.unattempted || 0;
    out.partial = (out.partial || 0) + (s.partial || 0);
  }
  return out;
}

function accuracyTone(accuracy: number) {
  if (accuracy >= STRONG_ACCURACY_MIN) return "strong" as const;
  if (accuracy < WEAK_ACCURACY_MAX) return "weak" as const;
  return "mid" as const;
}

/** Donut chart via conic-gradient — no chart lib needed. */
function OutcomeDonut({ totals }: { totals: OutcomeTotals }) {
  const c = totals.correct;
  const w = totals.wrong;
  const u = totals.unattempted;
  const p = totals.partial || 0;
  const total = Math.max(1, c + w + u + p);
  const pc = (n: number) => (100 * n) / total;
  const a1 = pc(c);
  const a2 = a1 + pc(p);
  const a3 = a2 + pc(w);
  const gradient = `conic-gradient(
    #10b981 0% ${a1}%,
    #f59e0b ${a1}% ${a2}%,
    #f43f5e ${a2}% ${a3}%,
    #94a3b8 ${a3}% 100%
  )`;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div
        className="relative h-36 w-36 shrink-0 rounded-full"
        style={{ background: gradient }}
        aria-hidden
      >
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center">
          <div className="text-xs uppercase text-slate-500">Tried</div>
          <div className="text-xl font-bold text-slate-800">{c + w + p}</div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-1">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Correct {c}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Partial {p}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Wrong {w}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Skipped {u}
        </li>
      </ul>
    </div>
  );
}

function StackedSubjectBars({ subjectStats }: { subjectStats: Record<string, SubjectStat> }) {
  const subjects = Object.entries(subjectStats);
  if (!subjects.length) return null;
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Correct
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Partial
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Wrong
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Skipped
        </li>
      </ul>
      {subjects.map(([name, s]) => {
        const total = Math.max(
          1,
          s.correct + s.wrong + s.unattempted + (s.partial || 0),
        );
        const tried = s.correct + s.wrong + (s.partial || 0);
        const seg = (n: number) => `${(100 * n) / total}%`;
        const tone = accuracyTone(s.accuracy);
        return (
          <div key={name}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800">{name}</span>
              <span className="text-xs text-slate-500">
                <span
                  className={
                    tone === "strong"
                      ? "font-semibold text-emerald-700"
                      : tone === "weak"
                        ? "font-semibold text-rose-700"
                        : "font-semibold text-amber-700"
                  }
                >
                  {s.accuracy}% acc
                </span>
                {" · "}
                tried {tried}/{total} · C{s.correct}/W{s.wrong}/U{s.unattempted}
                {s.partial ? `/P${s.partial}` : ""}
              </span>
            </div>
            <div
              className="flex h-5 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
              role="img"
              aria-label={`${name}: ${s.correct} correct, ${s.partial || 0} partial, ${s.wrong} wrong, ${s.unattempted} skipped`}
            >
              <div className="bg-emerald-500" style={{ width: seg(s.correct) }} title={`Correct ${s.correct}`} />
              <div className="bg-amber-400" style={{ width: seg(s.partial || 0) }} title={`Partial ${s.partial || 0}`} />
              <div className="bg-rose-500" style={{ width: seg(s.wrong) }} title={`Wrong ${s.wrong}`} />
              <div className="bg-slate-300" style={{ width: seg(s.unattempted) }} title={`Skipped ${s.unattempted}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopicStrengthList({
  topics,
  tone,
  empty,
}: {
  topics: Array<{
    topic: string;
    subject: string;
    correct: number;
    wrong: number;
    partial?: number;
    accuracy: number;
  }>;
  tone: "weak" | "strong";
  empty: string;
}) {
  const barBg = tone === "weak" ? "bg-rose-50" : "bg-emerald-50";
  const fill = tone === "weak" ? "bg-rose-500" : "bg-emerald-500";
  const pctClass = tone === "weak" ? "text-rose-800" : "text-emerald-800";

  return (
    <div className="mt-4 space-y-3">
      {topics.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}
      {topics.map((t) => {
        const tried = topicTried(t);
        return (
          <div key={`${tone}-${t.subject}-${t.topic}`}>
            <div className="mb-0.5 flex justify-between gap-2 text-xs">
              <span className="min-w-0">
                <span className="font-medium text-slate-800">{t.topic}</span>{" "}
                <span className="text-slate-400">({t.subject})</span>
                <span className="ml-1 text-slate-400">· tried {tried}</span>
              </span>
              <span className={`shrink-0 font-semibold ${pctClass}`}>{t.accuracy}%</span>
            </div>
            <div className={`h-2.5 rounded ${barBg}`}>
              <div
                className={`h-full rounded ${fill}`}
                style={{ width: `${Math.min(100, Math.max(2, t.accuracy))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ResultsMetrics({
  subjectStats,
  topicStats,
  weakTopics,
  strongTopics,
}: {
  subjectStats: Record<string, SubjectStat>;
  topicStats: TopicStat[];
  weakTopics: string[];
  strongTopics: string[];
}) {
  const subjects = Object.entries(subjectStats);
  const totals = sumSubjects(subjectStats);

  const { weak: weakBars, strong: strongBars } = partitionTopicStrength(topicStats);

  // Prefer server lists when present, but never show a label in both columns.
  const weakFromServer = weakTopics.filter((t) => !strongTopics.includes(t));
  const strongFromServer = strongTopics.filter((t) => !weakTopics.includes(t));

  const pros =
    strongFromServer.length > 0
      ? strongFromServer.slice(0, 4)
      : strongBars.slice(0, 4).map(formatTopicLabel);
  const cons =
    weakFromServer.length > 0
      ? weakFromServer.slice(0, 4)
      : weakBars.slice(0, 4).map(formatTopicLabel);

  return (
    <div className="space-y-6">
      <section className="desk-card rounded-xl p-4 sm:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Snapshot — how this attempt felt
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Practice signals only. Strong = ≥{STRONG_ACCURACY_MIN}% accuracy · Needs work = &lt;
          {WEAK_ACCURACY_MAX}% (min {MIN_TRIED_FOR_STRENGTH} tried). Mid-band topics stay out of
          both lists.
        </p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Outcome mix
            </h3>
            <OutcomeDonut totals={totals} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Pros & cons (topics)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="text-xs font-bold uppercase text-emerald-800">Keep doing</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-950">
                  {pros.length === 0 && (
                    <li>No strong topics yet (≥{STRONG_ACCURACY_MIN}% with enough tries).</li>
                  )}
                  {pros.map((t) => (
                    <li key={`p-${t}`}>{t}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                <div className="text-xs font-bold uppercase text-rose-800">Drill next</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-rose-950">
                  {cons.length === 0 && (
                    <li>No weak topics flagged (&lt;{WEAK_ACCURACY_MAX}% with enough tries).</li>
                  )}
                  {cons.map((t) => (
                    <li key={`c-${t}`}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="desk-card rounded-xl p-4 sm:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Subject outcomes
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Stacked bar per subject: green correct, amber partial, red wrong, gray skipped.
        </p>
        <div className="mt-4">
          <StackedSubjectBars subjectStats={subjectStats} />
        </div>
      </section>

      <section className="desk-card rounded-xl p-4 sm:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Subject accuracy
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Accuracy = (correct + ½ partial) ÷ tried. Color: green ≥{STRONG_ACCURACY_MIN}%, amber
          mid, red &lt;{WEAK_ACCURACY_MAX}%.
        </p>
        <div className="mt-4 space-y-3">
          {subjects.map(([name, s]) => {
            const tone = accuracyTone(s.accuracy);
            return (
              <div key={name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{name}</span>
                  <span
                    className={
                      tone === "strong"
                        ? "font-semibold text-emerald-700"
                        : tone === "weak"
                          ? "font-semibold text-rose-700"
                          : "font-semibold text-amber-700"
                    }
                  >
                    {s.accuracy}%
                  </span>
                </div>
                <div className="h-3.5 overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full rounded ${
                      tone === "strong"
                        ? "bg-emerald-500"
                        : tone === "weak"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, s.accuracy))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="desk-card rounded-xl p-4 sm:p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-rose-800">
            Topics needing work
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Accuracy &lt; {WEAK_ACCURACY_MAX}% · at least {MIN_TRIED_FOR_STRENGTH} tried
          </p>
          <TopicStrengthList
            topics={weakBars.slice(0, 8)}
            tone="weak"
            empty={`No weak topics (need ≥${MIN_TRIED_FOR_STRENGTH} tried and <${WEAK_ACCURACY_MAX}% accuracy).`}
          />
        </section>

        <section className="desk-card rounded-xl p-4 sm:p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-emerald-800">
            Strong topics
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Accuracy ≥ {STRONG_ACCURACY_MIN}% · at least {MIN_TRIED_FOR_STRENGTH} tried
          </p>
          <TopicStrengthList
            topics={strongBars.slice(0, 8)}
            tone="strong"
            empty={`No strong topics yet (need ≥${MIN_TRIED_FOR_STRENGTH} tried and ≥${STRONG_ACCURACY_MIN}% accuracy).`}
          />
        </section>
      </div>
    </div>
  );
}
