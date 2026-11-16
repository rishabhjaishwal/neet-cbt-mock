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

  const weakBars = [...topicStats]
    .filter((t) => t.correct + t.wrong + (t.partial ?? 0) >= 1)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8);
  const strongBars = [...topicStats]
    .filter((t) => t.correct + t.wrong + (t.partial ?? 0) >= 1)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Subject strength
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
                  {s.accuracy}% · C{s.correct}/W{s.wrong}/U{s.unattempted}
                  {s.partial ? `/P${s.partial}` : ""}
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
          {weakTopics.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-slate-600">
              {weakTopics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
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
          {strongTopics.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-slate-600">
              {strongTopics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
