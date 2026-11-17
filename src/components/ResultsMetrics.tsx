"use client";

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
    <div className="space-y-3">
      {subjects.map(([name, s]) => {
        const total = Math.max(1, s.correct + s.wrong + s.unattempted + (s.partial || 0));
        const seg = (n: number) => `${(100 * n) / total}%`;
        return (
          <div key={name}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{name}</span>
              <span className="text-xs text-slate-500">
                accuracy {s.accuracy}% · C{s.correct}/W{s.wrong}/U{s.unattempted}
                {s.partial ? `/P${s.partial}` : ""}
              </span>
            </div>
            <div className="flex h-4 overflow-hidden rounded-md bg-slate-100">
              <div className="bg-emerald-500" style={{ width: seg(s.correct) }} title="Correct" />
              <div className="bg-amber-400" style={{ width: seg(s.partial || 0) }} title="Partial" />
              <div className="bg-rose-500" style={{ width: seg(s.wrong) }} title="Wrong" />
              <div className="bg-slate-300" style={{ width: seg(s.unattempted) }} title="Skipped" />
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
  const maxAcc = 100;
  const totals = sumSubjects(subjectStats);

  const weakBars = [...topicStats]
    .filter((t) => t.correct + t.wrong + (t.partial ?? 0) >= 1)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8);
  const strongBars = [...topicStats]
    .filter((t) => t.correct + t.wrong + (t.partial ?? 0) >= 1)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 8);

  const pros =
    strongTopics.length > 0
      ? strongTopics.slice(0, 4)
      : strongBars.slice(0, 4).map((t) => `${t.topic} (${t.subject})`);
  const cons =
    weakTopics.length > 0
      ? weakTopics.slice(0, 4)
      : weakBars.slice(0, 4).map((t) => `${t.topic} (${t.subject})`);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Snapshot — how this attempt felt
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Simple view for brushing up: what worked, what to drill next. No rank anxiety — just
          practice signals.
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
                  {pros.length === 0 && <li>Not enough data yet — attempt more questions.</li>}
                  {pros.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                <div className="text-xs font-bold uppercase text-rose-800">Drill next</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-rose-950">
                  {cons.length === 0 && <li>No weak topics flagged — widen practice.</li>}
                  {cons.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Subject stacked outcomes
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Each bar is Correct / Partial / Wrong / Skipped — easy to spot where time leaked.
        </p>
        <div className="mt-4">
          <StackedSubjectBars subjectStats={subjectStats} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Subject accuracy
        </h2>
        <p className="mt-1 text-sm text-slate-600">Accuracy by subject (correct + ½ partial).</p>
        <div className="mt-4 space-y-3">
          {subjects.map(([name, s]) => (
            <div key={name}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{name}</span>
                <span
                  className={
                    s.accuracy >= 70
                      ? "text-emerald-700"
                      : s.accuracy < 50
                        ? "text-rose-700"
                        : "text-slate-600"
                  }
                >
                  {s.accuracy}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full rounded ${
                    s.accuracy >= 70
                      ? "bg-emerald-500"
                      : s.accuracy < 50
                        ? "bg-rose-500"
                        : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(maxAcc, Math.max(2, s.accuracy))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-rose-800">
            Topics needing work
          </h2>
          <div className="mt-4 space-y-2">
            {weakBars.length === 0 && (
              <p className="text-sm text-slate-500">Not enough attempts to flag weak topics.</p>
            )}
            {weakBars.map((t) => (
              <div key={`${t.subject}-${t.topic}`}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span>
                    {t.topic}{" "}
                    <span className="text-slate-400">({t.subject})</span>
                  </span>
                  <span>{t.accuracy}%</span>
                </div>
                <div className="h-2 rounded bg-rose-50">
                  <div
                    className="h-full rounded bg-rose-500"
                    style={{ width: `${Math.max(3, t.accuracy)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-emerald-800">
            Strong topics
          </h2>
          <div className="mt-4 space-y-2">
            {strongBars.length === 0 && (
              <p className="text-sm text-slate-500">Not enough attempts to flag strong topics.</p>
            )}
            {strongBars.map((t) => (
              <div key={`${t.subject}-${t.topic}-s`}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span>
                    {t.topic}{" "}
                    <span className="text-slate-400">({t.subject})</span>
                  </span>
                  <span>{t.accuracy}%</span>
                </div>
                <div className="h-2 rounded bg-emerald-50">
                  <div
                    className="h-full rounded bg-emerald-500"
                    style={{ width: `${Math.max(3, t.accuracy)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
