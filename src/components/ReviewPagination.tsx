import { InstantLink } from "@/components/InstantLink";
import {
  reviewQueryToSearchParams,
  type ReviewFilterOutcome,
  type ReviewFilterSubject,
  type ReviewQuery,
} from "@/lib/review-page";

type Props = {
  basePath: string;
  query: ReviewQuery;
  total: number;
  totalPages: number;
  pageSize: number;
  /** Counts for filter chips (from full index before pagination). */
  subjectCounts: Record<ReviewFilterSubject, number>;
  outcomeCounts: Record<ReviewFilterOutcome, number>;
};

function hrefFor(
  basePath: string,
  query: ReviewQuery,
  patch: Partial<ReviewQuery>,
) {
  const next: ReviewQuery = {
    page: patch.page ?? query.page,
    subject: patch.subject ?? query.subject,
    outcome: patch.outcome ?? query.outcome,
  };
  // Reset page when filters change
  if (patch.subject != null || patch.outcome != null) {
    if (patch.page == null) next.page = 1;
  }
  return `${basePath}${reviewQueryToSearchParams(next)}#review`;
}

export function ReviewPagination({
  basePath,
  query,
  total,
  totalPages,
  pageSize,
  subjectCounts,
  outcomeCounts,
}: Props) {
  const from = total === 0 ? 0 : (query.page - 1) * pageSize + 1;
  const to = Math.min(query.page * pageSize, total);

  const subjects: ReviewFilterSubject[] = [
    "ALL",
    "Physics",
    "Chemistry",
    "Biology",
  ];
  const outcomes: ReviewFilterOutcome[] = [
    "ALL",
    "wrong",
    "correct",
    "partial",
    "unattempted",
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Filter by subject">
        {subjects.map((s) => {
          const n = subjectCounts[s] ?? 0;
          if (s !== "ALL" && n === 0) return null;
          const active = query.subject === s;
          return (
            <InstantLink
              key={s}
              href={hrefFor(basePath, query, { subject: s })}
              className={`cbt-btn cbt-btn-sm ${
                active ? "cbt-btn-primary" : "cbt-btn-secondary"
              }`}
              showPending={false}
            >
              {s === "ALL" ? "All subjects" : s}
              <span className="ml-1 opacity-70">({n})</span>
            </InstantLink>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filter by outcome">
        {outcomes.map((o) => {
          const n = outcomeCounts[o] ?? 0;
          if (o !== "ALL" && n === 0) return null;
          const active = query.outcome === o;
          const label =
            o === "ALL"
              ? "All outcomes"
              : o === "unattempted"
                ? "Skipped"
                : o.charAt(0).toUpperCase() + o.slice(1);
          return (
            <InstantLink
              key={o}
              href={hrefFor(basePath, query, { outcome: o })}
              className={`cbt-btn cbt-btn-sm ${
                active ? "cbt-btn-primary" : "cbt-btn-muted"
              }`}
              showPending={false}
            >
              {label}
              <span className="ml-1 opacity-70">({n})</span>
            </InstantLink>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>
          Showing <strong className="text-slate-800">{from}–{to}</strong> of{" "}
          <strong className="text-slate-800">{total}</strong> solutions
          {totalPages > 1 ? ` · page ${query.page}/${totalPages}` : ""}
        </p>
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <InstantLink
              href={hrefFor(basePath, query, {
                page: Math.max(1, query.page - 1),
              })}
              className={`cbt-btn cbt-btn-sm cbt-btn-secondary ${
                query.page <= 1 ? "pointer-events-none opacity-40" : ""
              }`}
              aria-disabled={query.page <= 1}
              showPending={false}
            >
              ← Prev
            </InstantLink>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                if (totalPages <= 7) return true;
                if (p === 1 || p === totalPages) return true;
                return Math.abs(p - query.page) <= 1;
              })
              .reduce<number[]>((acc, p) => {
                if (acc.length && p - acc[acc.length - 1] > 1) acc.push(-p);
                acc.push(p);
                return acc;
              }, [])
              .map((p) =>
                p < 0 ? (
                  <span key={`gap-${p}`} className="px-1 text-slate-400">
                    …
                  </span>
                ) : (
                  <InstantLink
                    key={p}
                    href={hrefFor(basePath, query, { page: p })}
                    className={`cbt-btn cbt-btn-sm ${
                      p === query.page ? "cbt-btn-primary" : "cbt-btn-secondary"
                    }`}
                    showPending={false}
                  >
                    {p}
                  </InstantLink>
                ),
              )}
            <InstantLink
              href={hrefFor(basePath, query, {
                page: Math.min(totalPages, query.page + 1),
              })}
              className={`cbt-btn cbt-btn-sm cbt-btn-secondary ${
                query.page >= totalPages ? "pointer-events-none opacity-40" : ""
              }`}
              aria-disabled={query.page >= totalPages}
              showPending={false}
            >
              Next →
            </InstantLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
