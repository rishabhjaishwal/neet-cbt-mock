import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTopicCatalog } from "@/lib/topic-series";
import { StartTopicButton } from "@/components/StartTopicButton";

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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--cbt-accent)]">
            <Link href="/dashboard" className="hover:underline">
              ← Dashboard
            </Link>
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
            Topic-wise mock series
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Easy / Medium / Hard drills by subject topic. v1 banks reuse our NEET PYQ extracts;
            gaps are flagged until each difficulty reaches 50+ sourced items. Results include the
            same AI solution + YouTube / web / PDF stack.
          </p>
        </div>
      </header>

      {[...bySubject.entries()].map(([subject, list]) => (
        <section key={subject} className="mb-8">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
            {subject}
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
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
    </main>
  );
}
