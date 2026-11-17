"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TopicMockSequence } from "@/lib/topic-series";

type Diff = "Easy" | "Medium" | "Hard";

/**
 * Student picks a numbered sequential mock: Mock 1 = bank Q1–30, Mock 2 = Q31–60, …
 * Label matches API: e.g. mechanics_easy_2.
 */
export function TopicSequencePicker({
  topicId,
  topicName,
  difficulty,
  bankCount,
  sequences,
  compact = false,
}: {
  topicId: string;
  topicName: string;
  difficulty: Diff;
  bankCount: number;
  sequences: TopicMockSequence[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [sequence, setSequence] = useState(sequences[0]?.sequence ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => sequences.find((s) => s.sequence === sequence) || sequences[0],
    [sequences, sequence],
  );

  if (!sequences.length) {
    return (
      <p className="mt-1 text-[11px] text-slate-500">
        Need 30+ clean items to start
      </p>
    );
  }

  async function start(seq: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/topic-series/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, difficulty, sequence: seq }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(false);
        setError(data.error || "Could not start");
        return;
      }
      router.push(`/topic-series/exam/${data.attemptId}`);
    } catch {
      setLoading(false);
      setError("Network error");
    }
  }

  const mockWord = sequences.length === 1 ? "mock" : "mocks";

  return (
    <div className={compact ? "mt-1 text-left" : "mt-2 text-left"}>
      <p className="text-[11px] leading-snug text-slate-600">
        <span className="font-semibold text-slate-800">{bankCount}</span> in bank ·{" "}
        <span className="font-semibold text-slate-800">{sequences.length}</span>{" "}
        {mockWord} of 30 · ~36 min each
      </p>

      {sequences.length === 1 ? (
        <button
          type="button"
          disabled={loading}
          className={`cbt-btn cbt-btn-sm cbt-btn-primary mt-1.5 w-full ${loading ? "cbt-btn-loading" : ""}`}
          onClick={() => void start(1)}
        >
          {loading ? "…" : `Start ${selected?.label ?? "Mock 1"}`}
        </button>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Choose sequence
          </label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
            value={sequence}
            disabled={loading}
            onChange={(e) => setSequence(Number(e.target.value))}
            aria-label={`${topicName} ${difficulty} mock sequence`}
          >
            {sequences.map((s) => (
              <option key={s.sequence} value={s.sequence}>
                {s.label} · Q{s.from}–{s.to}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading || !selected}
            className={`cbt-btn cbt-btn-sm cbt-btn-primary w-full ${loading ? "cbt-btn-loading" : ""}`}
            onClick={() => selected && void start(selected.sequence)}
          >
            {loading
              ? "…"
              : `Start ${selected?.label ?? ""} (Q${selected?.from}–${selected?.to})`}
          </button>
          <button
            type="button"
            className="text-[10px] font-medium text-[var(--ink-blue,#1e4d7b)] underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide list" : `Show all ${sequences.length} sequences`}
          </button>
          {open && (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/80 text-[11px]">
              {sequences.map((s) => (
                <li
                  key={s.sequence}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-1 last:border-0"
                >
                  <span className="font-mono text-slate-700">
                    {s.label}
                    <span className="ml-1 font-sans text-slate-500">
                      Q{s.from}–{s.to}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    className="cbt-btn cbt-btn-sm cbt-btn-secondary shrink-0"
                    onClick={() => void start(s.sequence)}
                  >
                    Start
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-[10px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}
