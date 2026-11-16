"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Q = {
  id: string;
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  selectedOption: string | null;
  status: "not_attempted" | "attempted" | "marked";
};

type Props = {
  attemptId: string;
  year: number;
  title: string;
  endsAt: string;
  questions: Q[];
};

function formatRemain(ms: number) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ExamCbt({ attemptId, year, title, endsAt, questions: initial }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [index, setIndex] = useState(0);
  const [remain, setRemain] = useState(() => new Date(endsAt).getTime() - Date.now());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "Physics" | "Chemistry" | "Biology">("ALL");
  const [msg, setMsg] = useState("");

  const current = questions[index];
  const filteredIndexes = useMemo(() => {
    return questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => filter === "ALL" || q.subject === filter)
      .map(({ i }) => i);
  }, [questions, filter]);

  useEffect(() => {
    const t = setInterval(() => {
      const left = new Date(endsAt).getTime() - Date.now();
      setRemain(left);
      if (left <= 0) {
        clearInterval(t);
        void submit(true);
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  async function persist(next: Q) {
    await fetch(`/api/attempts/${attemptId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: next.id,
        selectedOption: next.selectedOption,
        status: next.status,
      }),
    });
  }

  async function updateCurrent(patch: Partial<Q>) {
    const next = { ...questions[index], ...patch };
    const copy = [...questions];
    copy[index] = next;
    setQuestions(copy);
    await persist(next);
  }

  async function submit(auto = false) {
    if (busy) return;
    if (!auto && !confirm("Submit the test? You cannot change answers after submit.")) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Submit failed");
      return;
    }
    setMsg(data.message || "Submitted");
    router.push("/dashboard?submitted=1");
    router.refresh();
  }

  const counts = useMemo(() => {
    const c = { attempted: 0, not_attempted: 0, marked: 0 };
    for (const q of questions) c[q.status] += 1;
    return c;
  }, [questions]);

  if (!current) return null;

  return (
    <div className="cbt-shell flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[var(--header)] px-4 py-3 text-white">
        <div>
          <div className="font-[family-name:var(--font-display)] text-lg font-semibold">
            NEET UG CBT — {year}
          </div>
          <div className="text-sm text-blue-100">{title}</div>
        </div>
        <div className="rounded bg-black/25 px-4 py-2 font-mono text-xl tracking-wide">
          Time Left: {formatRemain(remain)}
        </div>
      </header>

      <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_320px]">
        <main className="bg-white p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {(["ALL", "Physics", "Chemistry", "Biology"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded px-3 py-1.5 font-medium ${
                  filter === s
                    ? "bg-[var(--cbt-accent)] text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Q{current.number}.{" "}
              <span className="text-base font-medium text-slate-500">
                {current.subject} · Section {current.section}
              </span>
            </h2>
            <span className="text-xs text-slate-500">{current.topic}</span>
          </div>

          <p className="mb-5 whitespace-pre-wrap text-[1.05rem] leading-relaxed">
            {current.stem}
          </p>

          <div className="space-y-3">
            {(["1", "2", "3", "4"] as const).map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer gap-3 rounded-md border px-3 py-3 ${
                  current.selectedOption === opt
                    ? "border-[var(--cbt-accent)] bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="option"
                  className="mt-1"
                  checked={current.selectedOption === opt}
                  onChange={() =>
                    void updateCurrent({
                      selectedOption: opt,
                      status:
                        current.status === "marked" ? "marked" : "attempted",
                    })
                  }
                />
                <span>
                  <strong className="mr-2">({opt})</strong>
                  {current.options[opt]}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-slate-200 px-4 py-2 font-medium"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded bg-[var(--status-marked)] px-4 py-2 font-medium text-white"
              onClick={() =>
                void updateCurrent({
                  status: "marked",
                  selectedOption: current.selectedOption,
                })
              }
            >
              Mark for review
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-4 py-2 font-medium text-white"
              onClick={() =>
                void updateCurrent({
                  selectedOption: null,
                  status: "not_attempted",
                })
              }
            >
              Clear response
            </button>
            <button
              type="button"
              className="rounded bg-[var(--cbt-accent)] px-4 py-2 font-medium text-white"
              onClick={() => {
                const pos = filteredIndexes.indexOf(index);
                const next = filteredIndexes[pos + 1] ?? index + 1;
                setIndex(Math.min(questions.length - 1, next));
              }}
            >
              Save & Next
            </button>
            <button
              type="button"
              className="ml-auto rounded bg-[var(--danger)] px-4 py-2 font-semibold text-white"
              onClick={() => void submit(false)}
              disabled={busy}
            >
              Submit test
            </button>
          </div>
          {msg && <p className="mt-3 text-sm text-[var(--danger)]">{msg}</p>}
        </main>

        <aside className="border-l border-slate-200 bg-[#f7fafc] p-4">
          <h3 className="mb-3 font-[family-name:var(--font-display)] font-semibold">
            Question palette
          </h3>
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="attempted" /> Attempted ({counts.attempted})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="not_attempted" /> Not attempted ({counts.not_attempted})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="marked" /> Marked ({counts.marked})
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                className="palette-btn"
                data-status={q.status}
                data-current={i === index}
                onClick={() => setIndex(i)}
                title={`Q${q.number} ${q.subject}`}
              >
                {q.number}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
