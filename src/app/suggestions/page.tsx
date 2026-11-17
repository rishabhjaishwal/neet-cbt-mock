import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { InstantLink } from "@/components/InstantLink";
import { SuggestionsForm } from "@/components/SuggestionsForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function SuggestionsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "examiner") redirect("/examiner");

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
          <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
            <InstantLink href="/dashboard" className="hover:underline">
              ← Dashboard
            </InstantLink>
          </p>
          <h1 className="desk-title mt-1">Suggestions</h1>
          <p className="desk-kicker mt-2 max-w-xl">
            You suggest, we implement to improve it for you. This page is part of
            your notebook desk — not the exam CBT chrome.
          </p>
          </div>
          <ThemeToggle />
        </header>

        <SuggestionsForm />
      </div>
    </div>
  );
}
