import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTopicCatalog } from "@/lib/topic-series";
import { StartTopicButton } from "@/components/StartTopicButton";
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
            Easy / Medium / Hard drills by subject topic. Results include the same AI
            solution + YouTube / web / PDF stack.
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
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(["Easy", "Medium", "Hard"] as const).map((d) => (
                      <div
                        key={d}
                        className="rounded-lg border border-slate-200 bg-white/80 px-2 py-2 text-center"
                      >
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          {d}
                        </div>
                        <div className="text-sm font-bold">{t.counts[d] ?? 0}</div>
                        <StartTopicButton
                          topicId={t.id}
                          difficulty={d}
                          disabled={(t.counts[d] ?? 0) < 10}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {t.ready ? "Ready" : "Building"}
                  </p>
                </article>
              ))}
            </div>

            <div className="topic-desktop-table overflow-x-auto rounded-xl border border-slate-200 bg-white/90">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Easy</th>
                    <th className="px-4 py-3">Medium</th>
                    <th className="px-4 py-3">Hard</th>
                    <th className="px-4 py-3">Start</th>
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
                          <div className="font-medium">{t.counts[d] ?? 0}</div>
                          <StartTopicButton
                            topicId={t.id}
                            difficulty={d}
                            disabled={(t.counts[d] ?? 0) < 10}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {t.ready ? "Ready" : "Building"}
                      </td>
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
