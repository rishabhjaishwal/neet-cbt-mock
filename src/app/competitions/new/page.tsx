import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { InstantLink } from "@/components/InstantLink";
import { CreateCompetitionForm } from "@/components/CreateCompetitionForm";

export default async function NewCompetitionPage() {
  const user = await getSession();
  if (!user || user.role !== "student") {
    redirect("/login?next=/competitions/new");
  }

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
          <InstantLink href="/competitions" className="hover:underline">
            ← Competitions
          </InstantLink>
        </p>
        <h1 className="desk-title mt-2">Create a competition</h1>
        <p className="desk-kicker mb-6 max-w-xl">
          Pick scope and difficulty, then invite friends. Questions are drawn at
          random from the topic banks when you start — same set for everyone.
        </p>
        <CreateCompetitionForm />
      </div>
    </div>
  );
}
