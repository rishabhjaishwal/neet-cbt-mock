import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getSession();
  if (user) {
    redirect(user.role === "examiner" ? "/examiner" : "/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cbt-accent)]">
        National Eligibility cum Entrance Test
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-tight text-[var(--header)] md:text-6xl">
        NEET CBT Mock
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-[var(--cbt-muted)]">
        Laptop computer-based test practice with previous-year papers, timed palette UI,
        examiner review, and post-approval rank estimates against published candidate counts.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-[var(--cbt-accent)] px-5 py-3 font-semibold text-white hover:bg-[var(--cbt-accent-dark)]"
        >
          Student signup
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 bg-white px-5 py-3 font-semibold"
        >
          Login
        </Link>
      </div>
      <div className="mt-10 rounded-lg border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Seeded examiner</p>
        <p>examiner@neet.local / Examiner@123</p>
        <p className="mt-2 font-semibold text-slate-800">Demo student</p>
        <p>student@neet.local / Student@123</p>
      </div>
    </main>
  );
}
