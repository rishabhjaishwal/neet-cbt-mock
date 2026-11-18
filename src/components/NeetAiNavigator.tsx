"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NeetAiCatalogEntry, TopicDifficulty } from "@/lib/neet-ai";

const DIFFS: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

export function NeetAiNavigator({ catalog }: { catalog: NeetAiCatalogEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [difficulty, setDifficulty] = useState<TopicDifficulty | null>(null);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const selected = catalog.find((c) => c.difficulty === difficulty) || null;
  const sequences = selected?.sequences || [];

  async function startTest(seq: number) {
    if (!difficulty) return;
    setStarting(seq);
    setError("");
    try {
      const res = await fetch("/api/neet-ai/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, sequence: seq }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStarting(null);
        setError(data.error || "Could not start");
        return;
      }
      startTransition(() => {
        router.push(`/neet-ai/exam/${data.attemptId}`);
      });
    } catch {
      setStarting(null);
      setError("Network error");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {!difficulty ? (
        <>
          <h2 className="desk-section-title mb-2">Choose difficulty</h2>
          <p className="desk-kicker mb-4">
            Mixed Physics · Chemistry · Biology · 30 questions · ~36 minutes each
            pack.
          </p>
          <div className="grid gap-3">
            {DIFFS.map((d) => {
              const entry = catalog.find((c) => c.difficulty === d);
              const ready = Boolean(entry?.ready);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!ready}
                  onClick={() => {
                    setDifficulty(d);
                    setError("");
                  }}
                  className="desk-card desk-card--pad text-left transition hover:border-[var(--ink-blue,#1e4d7b)] disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold text-[var(--ink-blue,#1e4d7b)]">
                      {d}
                    </span>
                    <span className="text-xs text-slate-500">
                      {entry?.packs ?? 0} packs · {entry?.count ?? 0} Q
                    </span>
                  </div>
                  {entry?.subjects && (
                    <p className="mt-1 text-xs text-slate-600">
                      P {entry.subjects.Physics || 0} · C{" "}
                      {entry.subjects.Chemistry || 0} · B{" "}
                      {entry.subjects.Biology || 0}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setDifficulty(null);
              setError("");
            }}
            className="mb-4 text-sm font-semibold text-[var(--ink-blue,#1e4d7b)] hover:underline"
          >
            ← Back to difficulties
          </button>
          <h2 className="desk-section-title mb-1">NEET AI · {difficulty}</h2>
          <p className="desk-kicker mb-4">
            Pick a numbered pack (_1, _2…). Each is a fresh 30-question mixed mock.
          </p>
          {error && (
            <p className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sequences.map((s) => {
              const busy = starting === s.sequence || pending;
              return (
                <button
                  key={s.label}
                  type="button"
                  disabled={busy}
                  onClick={() => startTest(s.sequence)}
                  className="btn-pencil justify-center disabled:opacity-60"
                >
                  <span className="btn-pencil__lead">
                    {busy && starting === s.sequence
                      ? "Starting…"
                      : s.label.replace(/^neet_ai_/, "")}
                  </span>
                  <span className="btn-pencil__tip" aria-hidden />
                </button>
              );
            })}
          </div>
          {!sequences.length && (
            <p className="text-sm text-amber-700">No packs ready for {difficulty} yet.</p>
          )}
        </>
      )}
    </div>
  );
}
