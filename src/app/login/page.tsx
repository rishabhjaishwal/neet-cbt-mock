import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--header)]">
        Login
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        Students and examiners use the same login page.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <AuthForm mode="login" />
      </div>
      <p className="mt-4 text-sm">
        New student?{" "}
        <Link href="/signup" className="font-semibold text-[var(--cbt-accent)]">
          Create an account
        </Link>
      </p>
    </main>
  );
}
