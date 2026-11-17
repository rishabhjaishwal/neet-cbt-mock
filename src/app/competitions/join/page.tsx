import { Suspense } from "react";
import { InstantLink } from "@/components/InstantLink";
import { JoinCompetitionForm } from "@/components/JoinCompetitionForm";
import { getSession } from "@/lib/auth";

export default async function JoinCompetitionPage() {
  const user = await getSession();
  const isStudent = user?.role === "student";

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner mx-auto max-w-lg">
        <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
          <InstantLink
            href={isStudent ? "/competitions" : "/"}
            className="hover:underline"
          >
            ← {isStudent ? "Competitions" : "Home"}
          </InstantLink>
        </p>
        <h1 className="desk-title mt-2">Join a friend&apos;s race</h1>
        <p className="desk-kicker mb-6">
          {isStudent
            ? "Enter the invite code. If a friend shared a link, it may already be filled in."
            : "Friends must create a student account first. Enter the invite code — we will send you to signup, then bring you back."}
        </p>
        <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
          <JoinCompetitionForm />
        </Suspense>
      </div>
    </div>
  );
}
