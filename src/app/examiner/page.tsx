import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { Attempt, User } from "@/lib/models";
import { LogoutButton } from "@/components/LogoutButton";
import { DeskShell } from "@/components/DeskShell";

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
    <DeskShell innerClassName="max-w-5xl">
      <header className="desk-card mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4">
        <div>
          <h1 className="desk-title">Examiner console</h1>
          <p className="desk-kicker">
            {user.name} · review attempts and per-question correctness (results
            release on student submit)
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="desk-card overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-[rgba(30,77,123,0.06)] text-slate-600">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">C/W</th>
              <th className="px-4 py-3">Switches</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
                  <td className="px-4 py-3 font-semibold text-amber-800">
                    {a.screenSwitchCount ?? 0}
                  </td>
                  <td className="px-4 py-3 capitalize">{a.status}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/examiner/attempts/${String(a._id)}`}
                      className="font-semibold text-[var(--ink-blue,#1e4d7b)]"
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
    </DeskShell>
  );
}
