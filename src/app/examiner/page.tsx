import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, User } from "@/lib/models";
import { LogoutButton } from "@/components/LogoutButton";

export default async function ExaminerPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "examiner") redirect("/dashboard");
  await ensureSeeded();

  const attempts = await Attempt.find({
    status: { $in: ["submitted", "approved"] },
  })
    .sort({ submittedAt: -1 })
    .lean();
  const users = await User.find({
    _id: { $in: attempts.map((a) => a.userId) },
  }).lean();
  const byUser = Object.fromEntries(users.map((u) => [String(u._id), u]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--header)] px-5 py-4 text-white">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Examiner console
          </h1>
          <p className="text-sm text-blue-100">
            {user.name} · review attempts, per-question correctness, approve release
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">C/W</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No submitted attempts yet.
                </td>
              </tr>
            )}
            {attempts.map((a) => {
              const u = byUser[String(a.userId)];
              return (
                <tr key={String(a._id)} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u?.name ?? "Unknown"}</div>
                    <div className="text-xs text-slate-500">{u?.email}</div>
                  </td>
                  <td className="px-4 py-3">{a.year}</td>
                  <td className="px-4 py-3">{a.score ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.correctCount}/{a.wrongCount}
                  </td>
                  <td className="px-4 py-3 capitalize">{a.status}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/examiner/attempts/${String(a._id)}`}
                      className="font-semibold text-[var(--cbt-accent)]"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
