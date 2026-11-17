import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { InstantLink } from "@/components/InstantLink";
import { CompetitionsList } from "@/components/CompetitionsList";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function CompetitionsPage() {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login?next=/competitions");

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
          <InstantLink href="/dashboard" className="hover:underline">
            ← Dashboard
          </InstantLink>
        </p>
        <header className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="desk-title">Competitions</h1>
            <p className="desk-kicker max-w-xl">
              Race friends on the same random paper. Everyone needs a student
              account — share an invite code, then the host starts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <InstantLink href="/competitions/join" className="cbt-btn cbt-btn-secondary">
              Join with code
            </InstantLink>
            <InstantLink href="/competitions/new" className="btn-pencil" showPending={false}>
              <span className="btn-pencil__lead">Create</span>
              <span className="btn-pencil__tip" aria-hidden />
            </InstantLink>
          </div>
        </header>

        <div className="desk-card desk-card--pad">
          <h2 className="desk-section-title mb-2">Yours</h2>
          <CompetitionsList />
        </div>
      </div>
    </div>
  );
}
