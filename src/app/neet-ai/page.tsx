import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listNeetAiCatalog } from "@/lib/neet-ai";
import { NeetAiNavigator } from "@/components/NeetAiNavigator";
import { InstantLink } from "@/components/InstantLink";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function NeetAiPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "examiner") redirect("/examiner");

  const catalog = await listNeetAiCatalog();

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
            <h1 className="desk-title mt-1">NEET AI</h1>
            <p className="desk-kicker mt-2 max-w-xl">
              AI-curated Easy / Medium / Hard mocks from Hugging Face NEET banks +
              multi-source answer-key checks. Instant scores and NCERT-linked
              solutions.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <NeetAiNavigator catalog={catalog} />
      </div>
    </div>
  );
}
