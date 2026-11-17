import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-auth-wrap">
        <div className="desk-auth-card">
          <p className="landing-brand" style={{ fontSize: "2.4rem" }}>
            NEET CBT Mock
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold text-[var(--graphite,#243041)]">
            Login to your desk
          </h1>
          <p className="desk-kicker mb-5">
            Students and examiners use the same door — notebook vibe, CBT when
            the paper starts.
          </p>
          <div className="mb-4 flex flex-wrap gap-2" aria-hidden>
            <span className="desk-sticky-chip desk-sticky-chip--mint">+4 / −1 / 0</span>
            <span className="desk-sticky-chip desk-sticky-chip--butter">year packs</span>
          </div>
          <AuthForm mode="login" />
          <p className="mt-5 text-sm text-slate-600">
            New student?{" "}
            <Link href="/signup" className="btn-ink-link text-lg">
              Create an account →
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
