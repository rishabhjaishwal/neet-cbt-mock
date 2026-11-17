import type { SectionBCap } from "@/lib/attempt-rules";

/** Results-only summary of NTA Section B attempt caps (not shown during the exam). */
export function SectionBCapSummary({ caps }: { caps: SectionBCap[] }) {
  if (!caps.length) return null;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Section B attempt caps
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        NTA-style limits: attempt any {caps[0]?.cap ?? 10} questions in each Section B
        block. Section A is not limited by these counters.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
        {caps.map((c) => {
          const multi = caps.filter((x) => x.subject === c.subject).length > 1;
          const label = multi
            ? `${c.subject} B${c.blockIndex} (${c.start}–${c.end})`
            : `${c.subject} B`;
          return (
            <span
              key={c.id}
              className={`rounded-md px-2.5 py-1 ${
                c.over
                  ? "bg-rose-100 text-rose-800"
                  : c.attempted >= c.cap
                    ? "bg-amber-50 text-amber-900"
                    : "bg-slate-100"
              }`}
            >
              {label}: {c.attempted}/{c.cap}
            </span>
          );
        })}
      </div>
    </section>
  );
}
