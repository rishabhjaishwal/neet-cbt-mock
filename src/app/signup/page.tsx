import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--header)]">
        Student signup
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        Create an account to attempt previous-year NEET CBT mocks.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <AuthForm mode="signup" />
      </div>
      <p className="mt-4 text-sm">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-[var(--cbt-accent)]">
          Login
        </Link>
      </p>
    </main>
  );
}
