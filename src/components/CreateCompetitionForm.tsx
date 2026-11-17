"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SCOPES = [
  { id: "ALL", label: "All subjects" },
  { id: "Physics", label: "Physics only" },
  { id: "Chemistry", label: "Chemistry only" },
  { id: "Biology", label: "Biology only" },
] as const;

const DIFFS = ["Easy", "Medium", "Hard", "Mix"] as const;
const SIZES = [20, 30, 50] as const;

function durationFor(size: number) {
  return Math.round(size * 1.2);
}

export function CreateCompetitionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<(typeof SCOPES)[number]["id"]>("ALL");
  const [difficulty, setDifficulty] = useState<(typeof DIFFS)[number]>("Mix");
  const [size, setSize] = useState<(typeof SIZES)[number]>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          scope,
          difficulty,
          size,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBusy(false);
        setError(data.error || "Could not create");
        return;
      }
      router.push(`/competitions/${data.id}`);
    } catch {
      setBusy(false);
      setError("Network error");
    }
  }

  return (
    <div className="desk-card desk-card--pad space-y-5">
      <div>
        <h2 className="desk-section-title">1. Title (optional)</h2>
        <input
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Friday night Physics race"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
      </div>

      <div>
        <h2 className="desk-section-title">2. Subjects</h2>
        <p className="desk-kicker mb-2">All three NEET subjects, or focus on one.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                scope === s.id
                  ? "border-[var(--ink-blue,#1e4d7b)] bg-sky-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="desk-section-title">3. Difficulty</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIFFS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                difficulty === d
                  ? "border-[var(--ink-blue,#1e4d7b)] bg-[var(--ink-blue,#1e4d7b)] text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="desk-section-title">4. Size & time</h2>
        <p className="desk-kicker mb-2">
          Random questions from the topic banks · ~1.2 min each.
        </p>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSize(n)}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                size === n
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {n} Q · ~{durationFor(n)} min
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        className={`btn-pencil ${busy ? "opacity-70" : ""}`}
        onClick={() => void create()}
      >
        <span className="btn-pencil__lead">
          {busy ? "Creating…" : "Create & get invite link"}
        </span>
        <span className="btn-pencil__tip" aria-hidden />
      </button>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
