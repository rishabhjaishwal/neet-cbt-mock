import { Suspense } from "react";
import { InstantLink } from "@/components/InstantLink";
import { JoinCompetitionForm } from "@/components/JoinCompetitionForm";
import { getSession } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function JoinCompetitionPage() {
  const user = await getSession();
  const isStudent = user?.role === "student";

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner mx-auto max-w-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
            <InstantLink
              href={isStudent ? "/competitions" : "/"}
              className="hover:underline"
            >
              ← {isStudent ? "Competitions" : "Home"}
            </InstantLink>
          </p>
          <ThemeToggle />
        </div>
        <h1 className="desk-title mt-2">Join a friend&apos;s race</h1>
        <p className="desk-kicker mb-6">
          {isStudent
            ? "Shareable links auto-join when you are logged in. You can also paste the invite code."
            : "Open the shareable join link, create a student account (or login), and you land back here to join."}
        </p>
        <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
          <JoinCompetitionForm />
        </Suspense>
      </div>
    </div>
  );
}
