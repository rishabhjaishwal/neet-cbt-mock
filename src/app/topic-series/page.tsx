import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTopicCatalog } from "@/lib/topic-series";
import { TopicSequencePicker } from "@/components/TopicSequencePicker";
import { InstantLink } from "@/components/InstantLink";

export default async function TopicSeriesPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "examiner") redirect("/examiner");

  const topics = await listTopicCatalog();
  const bySubject = new Map<string, typeof topics>();
  for (const t of topics) {
    const list = bySubject.get(t.subject) || [];
    list.push(t);
    bySubject.set(t.subject, list);
  }

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner">
        <header className="mb-6">
          <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
            <InstantLink href="/dashboard" className="hover:underline">
              ← Dashboard
            </InstantLink>
          </p>
          <h1 className="desk-title mt-1">Topic-wise mock series</h1>
          <p className="desk-kicker mt-2 max-w-2xl">
            Each mock is <strong>30 questions · ~36 min</strong>. When a difficulty
            has many items, choose a numbered sequence —{" "}
            <span className="font-mono text-[0.95em]">topic_1</span> = bank Q1–30,{" "}
            <span className="font-mono text-[0.95em]">_2</span> = Q31–60, and so on.
            Easy / Medium / Hard stay separate tracks.
          </p>
        </header>

        {[...bySubject.entries()].map(([subject, list]) => (
          <section key={subject} className="mb-8">
            <h2 className="desk-section-title mb-3">{subject}</h2>

            <div className="topic-card-grid">
              {list.map((t) => (
                <article key={t.id} className="desk-card desk-card--pad">
                  <h3 className="font-semibold text-slate-800">{t.topic}</h3>
                  {t.gaps.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Gaps: {t.gaps.slice(0, 2).join(" · ")}
                      {t.gaps.length > 2 ? "…" : ""}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(["Easy", "Medium", "Hard"] as const).map((d) => (
                      <div
                        key={d}
                        className="rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2"
                      >
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          {d}
                        </div>
                        <TopicSequencePicker
                          topicId={t.id}
                          topicName={t.topic}
                          difficulty={d}
                          bankCount={t.counts[d] ?? 0}
                          sequences={t.sequences?.[d] ?? []}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="topic-desktop-table mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white/90">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Easy sequences</th>
                    <th className="px-4 py-3">Medium sequences</th>
                    <th className="px-4 py-3">Hard sequences</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{t.topic}</div>
                        {t.gaps.length > 0 && (
                          <div className="mt-1 text-xs text-amber-700">
                            Gaps: {t.gaps.slice(0, 2).join(" · ")}
                            {t.gaps.length > 2 ? "…" : ""}
                          </div>
                        )}
                      </td>
                      {(["Easy", "Medium", "Hard"] as const).map((d) => (
                        <td key={d} className="px-4 py-3">
                          <TopicSequencePicker
                            topicId={t.id}
                            topicName={t.topic}
                            difficulty={d}
                            bankCount={t.counts[d] ?? 0}
                            sequences={t.sequences?.[d] ?? []}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
