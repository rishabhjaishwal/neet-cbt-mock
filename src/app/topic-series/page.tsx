import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTopicCatalog } from "@/lib/topic-series";
import { TopicSeriesNavigator } from "@/components/TopicSeriesNavigator";
import { InstantLink } from "@/components/InstantLink";

export default async function TopicSeriesPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "examiner") redirect("/examiner");

  const topics = await listTopicCatalog();

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
          <h1 className="desk-title mt-1">Topic-wise mocks</h1>
          <p className="desk-kicker mt-2 max-w-xl">
            Subject → Topic → Easy / Medium / Hard → numbered test (_1, _2…). Each
            test is 30 questions · about 36 minutes.
          </p>
        </header>

        <TopicSeriesNavigator topics={topics} />
      </div>
    </div>
  );
}
