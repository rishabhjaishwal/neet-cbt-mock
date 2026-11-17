"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TopicCatalogEntry, TopicDifficulty, TopicMockSequence } from "@/lib/topic-series";

type Step = "subject" | "topic" | "difficulty" | "tests";

const DIFFS: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

export function TopicSeriesNavigator({ topics }: { topics: TopicCatalogEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("subject");
  const [subject, setSubject] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<TopicDifficulty | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sub = q.get("subject");
    const topicName = q.get("topic");
    const difficultyRaw = q.get("difficulty");
    const diff = DIFFS.includes(difficultyRaw as TopicDifficulty)
      ? (difficultyRaw as TopicDifficulty)
      : null;
    if (!sub) return;
    const match = topics.find(
      (t) =>
        t.subject === sub &&
        (!topicName || t.topic === topicName || t.id === topicName),
    );
    if (topicName && match) {
      setSubject(sub);
      setTopicId(match.id);
      setDifficulty(diff);
      setStep(diff ? "tests" : "difficulty");
      return;
    }
    if (topics.some((t) => t.subject === sub)) {
      setSubject(sub);
      setTopicId(null);
      setDifficulty(null);
      setStep("topic");
    }
  }, [topics]);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const subjects = useMemo(() => {
    const order = ["Physics", "Chemistry", "Biology"];
    const set = new Set(topics.map((t) => t.subject));
    return [...order.filter((s) => set.has(s)), ...[...set].filter((s) => !order.includes(s))];
  }, [topics]);

  const topicList = useMemo(
    () => (subject ? topics.filter((t) => t.subject === subject) : []),
    [topics, subject],
  );

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === topicId) || null,
    [topics, topicId],
  );

  const sequences: TopicMockSequence[] =
    selectedTopic && difficulty
      ? selectedTopic.sequences?.[difficulty] || []
      : [];

  function goSubject(s: string) {
    setSubject(s);
    setTopicId(null);
    setDifficulty(null);
    setError("");
    setStep("topic");
  }

  function goTopic(id: string) {
    setTopicId(id);
    setDifficulty(null);
    setError("");
    setStep("difficulty");
  }

  function goDifficulty(d: TopicDifficulty) {
    setDifficulty(d);
    setError("");
    setStep("tests");
  }

  function back() {
    setError("");
    if (step === "tests") {
      setDifficulty(null);
      setStep("difficulty");
    } else if (step === "difficulty") {
      setTopicId(null);
      setStep("topic");
    } else if (step === "topic") {
      setSubject(null);
      setStep("subject");
    }
  }

  async function startTest(seq: number) {
    if (!topicId || !difficulty) return;
    setStarting(seq);
    setError("");
    try {
      const res = await fetch("/api/topic-series/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, difficulty, sequence: seq }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStarting(null);
        setError(data.error || "Could not start");
        return;
      }
      startTransition(() => {
        router.push(`/topic-series/exam/${data.attemptId}`);
      });
    } catch {
      setStarting(null);
      setError("Network error");
    }
  }

  const crumbs = [
    step !== "subject" ? subject : null,
    step === "difficulty" || step === "tests" ? selectedTopic?.topic : null,
    step === "tests" ? difficulty : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-xl">
      {step !== "subject" && (
        <button
          type="button"
          onClick={back}
          className="mb-4 text-sm font-semibold text-[var(--ink-blue,#1e4d7b)] hover:underline"
        >
          ← Back
        </button>
      )}

      {crumbs.length > 0 && (
        <p className="mb-3 text-sm text-slate-600">
          {crumbs.join(" → ")}
        </p>
      )}

      {step === "subject" && (
        <section>
          <h2 className="desk-section-title mb-1">1. Choose subject</h2>
          <p className="mb-4 text-sm text-slate-600">Physics, Chemistry, or Biology.</p>
          <div className="grid gap-3">
            {subjects.map((s) => {
              const n = topics.filter((t) => t.subject === s).length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => goSubject(s)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left shadow-sm transition hover:border-[var(--ink-blue,#1e4d7b)] hover:bg-sky-50/60"
                >
                  <span className="block text-lg font-semibold text-slate-900">{s}</span>
                  <span className="text-sm text-slate-500">{n} topics</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "topic" && subject && (
        <section>
          <h2 className="desk-section-title mb-1">2. Choose topic</h2>
          <p className="mb-4 text-sm text-slate-600">{subject} topics.</p>
          <div className="grid gap-2">
            {topicList.map((t) => {
              const mocks =
                (t.sequences?.Easy?.length || 0) +
                (t.sequences?.Medium?.length || 0) +
                (t.sequences?.Hard?.length || 0);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => goTopic(t.id)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-left transition hover:border-[var(--ink-blue,#1e4d7b)] hover:bg-sky-50/60"
                >
                  <span className="block font-semibold text-slate-900">{t.topic}</span>
                  <span className="text-xs text-slate-500">
                    {mocks} timed mocks available
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "difficulty" && selectedTopic && (
        <section>
          <h2 className="desk-section-title mb-1">3. Choose difficulty</h2>
          <p className="mb-4 text-sm text-slate-600">
            {selectedTopic.topic} — then pick a numbered test.
          </p>
          <div className="grid gap-3">
            {DIFFS.map((d) => {
              const seqs = selectedTopic.sequences?.[d] || [];
              const disabled = seqs.length === 0;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => goDifficulty(d)}
                  className={`rounded-xl border px-5 py-4 text-left transition ${
                    disabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-300 bg-white hover:border-[var(--ink-blue,#1e4d7b)] hover:bg-sky-50/60"
                  }`}
                >
                  <span className="block text-lg font-semibold">{d}</span>
                  <span className="text-sm text-slate-500">
                    {disabled
                      ? "Not enough questions yet"
                      : `${seqs.length} test${seqs.length === 1 ? "" : "s"} · 30 Q · ~36 min each`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "tests" && selectedTopic && difficulty && (
        <section>
          <h2 className="desk-section-title mb-1">4. Choose test</h2>
          <p className="mb-4 text-sm text-slate-600">
            Sequential mocks for {selectedTopic.topic} · {difficulty}.{" "}
            <span className="font-mono text-[0.9em]">_1</span> = questions 1–30,{" "}
            <span className="font-mono text-[0.9em]">_2</span> = 31–60, and so on.
          </p>
          {sequences.length === 0 ? (
            <p className="text-sm text-slate-500">No tests for this difficulty yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white">
              {sequences.map((s) => {
                const busy = starting === s.sequence || pending;
                return (
                  <li
                    key={s.sequence}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <div className="font-mono text-sm font-semibold text-slate-900">
                        {s.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        Questions {s.from}–{s.to} · 30 Q · ~36 min
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void startTest(s.sequence)}
                      className={`cbt-btn cbt-btn-primary shrink-0 ${busy ? "cbt-btn-loading" : ""}`}
                    >
                      {busy ? "…" : "Start"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
          )}
        </section>
      )}
    </div>
  );
}
