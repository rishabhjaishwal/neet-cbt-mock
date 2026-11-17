"use client";

import { QuestionOptionMarkdown, QuestionStemMarkdown } from "@/components/QuestionMarkdown";
import { QuestionFigure } from "@/components/QuestionFigure";
import { formatOptions, type Outcome } from "@/lib/multi-correct";

export type ReviewItem = {
  id: string;
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  selected: string[];
  correct: string[];
  outcome: Outcome;
  marks: number;
  multiCorrect: boolean;
  figureSrc?: string | null;
  figureKind?: string | null;
  needsFigure?: boolean;
};

const outcomeStyle: Record<Outcome, string> = {
  correct: "border-emerald-300 bg-emerald-50/50",
  partial: "border-amber-300 bg-amber-50/50",
  wrong: "border-rose-300 bg-rose-50/40",
  unattempted: "border-slate-200 bg-slate-50",
};

export function QuestionReviewList({ items }: { items: ReviewItem[] }) {
  return (
    <section className="mt-8 space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Question review
        </h2>
        <p className="text-sm text-slate-600">
          Your choices vs correct answers (shown after you submit).
        </p>
      </div>
      {items.map((q) => (
        <article
          key={q.id}
          className={`rounded-xl border p-4 ${outcomeStyle[q.outcome]}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">
              Q{q.number}.{" "}
              <span className="text-sm font-medium text-slate-500">
                {q.subject} · Sec {q.section} · {q.topic}
              </span>
            </h3>
            <span className="text-sm font-semibold capitalize">
              {q.outcome}
              {q.multiCorrect ? " · multi" : ""} · {q.marks > 0 ? `+${q.marks}` : q.marks}
            </span>
          </div>

          {(q.needsFigure || q.figureSrc) && (
            <div className="mt-3">
              <QuestionFigure
                figureSrc={q.figureSrc}
                figureKind={q.figureKind}
                missingLabel="Figure not available in this digital extract"
                schematicLabel="Schematic figure (PDF crop unavailable)"
              />
            </div>
          )}

          <QuestionStemMarkdown stem={q.stem} className="mt-3" />

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-slate-500">Your answer</div>
              <div className="font-medium">{formatOptions(q.selected)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Correct answer</div>
              <div className="font-medium text-emerald-800">{formatOptions(q.correct)}</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {(["1", "2", "3", "4"] as const).map((opt) => {
              const isCorrect = q.correct.includes(opt);
              const isSelected = q.selected.includes(opt);
              return (
                <div
                  key={opt}
                  className={`rounded border px-3 py-2 text-sm ${
                    isCorrect
                      ? "border-emerald-400 bg-emerald-50"
                      : isSelected
                        ? "border-rose-300 bg-rose-50"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <strong className="mr-2">({opt})</strong>
                  <QuestionOptionMarkdown option={q.options[opt] ?? ""} />
                  <span className="ml-2 text-xs text-slate-500">
                    {isCorrect ? "✓ correct" : ""}
                    {isSelected && !isCorrect ? " · your pick" : ""}
                    {isSelected && isCorrect ? " · your pick" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}
