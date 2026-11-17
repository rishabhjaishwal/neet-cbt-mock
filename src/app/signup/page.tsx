import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-auth-wrap">
        <div className="desk-auth-card">
          <p className="landing-brand" style={{ fontSize: "2.4rem" }}>
            NEET CBT Mock
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold text-[var(--graphite,#243041)]">
            Start your notebook
          </h1>
          <p className="desk-kicker mb-5">
            Create a student account for previous-year CBT mocks, topic drills,
            and scored review.
          </p>
          <div className="mb-4 flex flex-wrap gap-2" aria-hidden>
            <span className="desk-sticky-chip desk-sticky-chip--pink">Physics</span>
            <span className="desk-sticky-chip desk-sticky-chip--mint">Chemistry</span>
            <span className="desk-sticky-chip desk-sticky-chip--butter">Biology</span>
          </div>
          <AuthForm mode="signup" />
          <p className="mt-5 text-sm text-slate-600">
            Already registered?{" "}
            <Link href="/login" className="btn-ink-link text-lg">
              Login →
            </Link>
          </p>
          <p className="mt-3 text-sm">
            <Link href="/" className="font-semibold text-[var(--ink-blue,#1e4d7b)]">
              ← Back to landing
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
