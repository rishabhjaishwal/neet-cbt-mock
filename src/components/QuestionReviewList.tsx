"use client";

import { memo, type ReactNode } from "react";
import { QuestionOptionMarkdown, QuestionStemMarkdown } from "@/components/QuestionMarkdown";
import { QuestionFigure } from "@/components/QuestionFigure";
import { formatOptions, type Outcome } from "@/lib/multi-correct";
import type { LearningAid } from "@/lib/learning-aid";

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
  learning: LearningAid;
};

const outcomeStyle: Record<Outcome, string> = {
  correct: "review-card--correct",
  partial: "review-card--partial",
  wrong: "review-card--wrong",
  unattempted: "review-card--unattempted",
};

const linkKindLabel: Record<string, string> = {
  youtube: "YouTube",
  web: "Web",
  pdf: "PDF",
  other: "Link",
};

function renderMarkdownish(text: string) {
  return text.split("\n\n").map((para, idx) => {
    const parts = para.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <p key={`${idx}-${para.slice(0, 24)}`} className="text-sm leading-relaxed text-slate-700">
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    );
  });
}

const ReviewCard = memo(function ReviewCard({ q }: { q: ReviewItem }) {
  const openSolution = q.outcome === "wrong" || q.outcome === "partial";

  return (
    <article
      className={`desk-card review-card rounded-xl border p-4 ${outcomeStyle[q.outcome]}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-[var(--graphite,#243041)]">
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
            schematicLabel="Schematic figure (restored for clarity)"
          />
        </div>
      )}

      <QuestionStemMarkdown stem={q.stem} className="mt-3" />

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Your answer</div>
          <div className="font-medium">{formatOptions(q.selected)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Correct answer</div>
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
              className={`rounded-lg border px-3 py-2 text-sm ${
                isCorrect
                  ? "border-emerald-400 bg-emerald-50"
                  : isSelected
                    ? "border-rose-300 bg-rose-50"
                    : "border-slate-200 bg-white/90"
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

      <details
        className="mt-4 rounded-lg border border-slate-200 bg-white/80 open:border-[rgba(30,77,123,0.28)]"
        open={openSolution}
      >
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-slate-800">
          {q.learning.title}
          <span className="ml-2 rounded-full bg-[rgba(30,77,123,0.08)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-blue,#1e4d7b)]">
            {q.learning.concept}
          </span>
        </summary>
        <div
          className={`border-t px-3 py-3 ${
            q.learning.placeholder
              ? "border-dashed border-amber-200 bg-amber-50/40"
              : "border-slate-100"
          }`}
        >
          {q.learning.curatedSolution ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                Curated solution
              </div>
              <div className="mt-1 space-y-2">
                {renderMarkdownish(q.learning.curatedSolution)}
              </div>
            </div>
          ) : null}

          <div className="mt-3 rounded-md border border-[rgba(30,77,123,0.2)] bg-[rgba(30,77,123,0.04)] px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-blue,#1e4d7b)]">
              AI NEET-style solution
            </div>
            <div className="mt-1 space-y-2">
              {renderMarkdownish(q.learning.aiSolution)}
            </div>
          </div>

          {q.learning.links.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Study stack
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {q.learning.links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cbt-btn cbt-btn-secondary cbt-btn-sm inline-flex items-center gap-1.5"
                    >
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        {linkKindLabel[link.kind] || "Link"}
                      </span>
                      <span>{link.label}</span>
                      <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </article>
  );
});

export function QuestionReviewList({
  items,
  toolbar,
  footer,
}: {
  items: ReviewItem[];
  /** Server-rendered filters + page controls (above the cards). */
  toolbar?: ReactNode;
  /** Optional bottom pager (usually same controls). */
  footer?: ReactNode;
}) {
  return (
    <section id="review" className="mt-8 scroll-mt-6 space-y-4">
      <div>
        <h2 className="desk-section-title text-xl">Question review & solutions</h2>
        <p className="desk-kicker">
          Wrong answers open the solution immediately. Match-list stems render as
          clear Column I / Column II tables so you can map options without re-reading.
        </p>
      </div>

      {toolbar}

      {items.length === 0 ? (
        <p className="desk-card rounded-xl border border-dashed px-4 py-8 text-center text-sm text-slate-600">
          No questions match this filter.
        </p>
      ) : (
        items.map((q) => <ReviewCard key={q.id} q={q} />)
      )}

      {footer}
    </section>
  );
}
