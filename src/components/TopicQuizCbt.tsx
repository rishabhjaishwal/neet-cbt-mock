"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionOptionMarkdown, QuestionStemMarkdown } from "@/components/QuestionMarkdown";
import { QuestionFigure } from "@/components/QuestionFigure";
import { ThemeToggle } from "@/components/ThemeToggle";

type Q = {
  id: string;
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  selectedOption: string | null;
  selectedOptions: string[];
  status: "not_attempted" | "attempted" | "marked";
  multiCorrect?: boolean;
  figureSrc?: string | null;
  figureKind?: string | null;
};

type Pending = {
  questionKey: string;
  selectedOption: string | null;
  selectedOptions: string[];
  status: Q["status"];
};

type Props = {
  attemptId: string;
  title: string;
  endsAt: string;
  questions: Q[];
  /** Default topic-series; competitions pass `/api/competitions/attempts`. */
  apiBase?: string;
  submitConfirm?: string;
};

function formatRemain(ms: number) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TopicQuizCbt({
  attemptId,
  title,
  endsAt: endsAtProp,
  questions: initial,
  apiBase = "/api/topic-series",
  submitConfirm = "Submit this topic mock?",
}: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [index, setIndex] = useState(0);
  const [endsAt] = useState(endsAtProp);
  const [remain, setRemain] = useState(() => new Date(endsAtProp).getTime() - Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "saved" | "error">("idle");
  const pendingRef = useRef<Record<string, Pending>>({});
  const syncingRef = useRef(false);
  const indexRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const current = questions[index] ?? questions[0];

  const flush = useCallback(
    async (force = false) => {
      if (syncingRef.current && !force) return false;
      syncingRef.current = true;
      setSyncState("syncing");
      try {
        const pending = Object.values(pendingRef.current);
        const res = await fetch(`${apiBase}/${attemptId}/checkpoint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: pending.length ? pending : undefined,
            currentQuestionIndex: indexRef.current,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSyncState("error");
          return false;
        }
        const applied = new Set<string>(
          Array.isArray(data.appliedKeys) ? data.appliedKeys.map(String) : [],
        );
        if (applied.size) {
          const next = { ...pendingRef.current };
          for (const k of applied) delete next[k];
          pendingRef.current = next;
        } else if (!pending.length) {
          /* navigation only */
        } else {
          pendingRef.current = {};
        }
        setSyncState(Object.keys(pendingRef.current).length ? "error" : "saved");
        return true;
      } catch {
        setSyncState("error");
        return false;
      } finally {
        syncingRef.current = false;
      }
    },
    [attemptId, apiBase],
  );

  const schedule = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void flush(), 500);
  }, [flush]);

  useEffect(() => {
    const tick = setInterval(() => {
      const left = new Date(endsAt).getTime() - Date.now();
      setRemain(left);
      if (left <= 0) {
        clearInterval(tick);
        void submit(true);
      }
    }, 500);
    const periodic = setInterval(() => void flush(), 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(periodic);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, flush]);

  function updateCurrent(patch: Partial<Q>) {
    const at = index;
    startTransition(() => {
      setQuestions((prev) => {
        const base = prev[at];
        if (!base) return prev;
        const next: Q = { ...base, ...patch };
        if (patch.selectedOption !== undefined) {
          if (patch.selectedOption == null) {
            next.selectedOptions = [];
            next.selectedOption = null;
          } else if (base.multiCorrect) {
            const set = new Set(base.selectedOptions ?? []);
            if (set.has(patch.selectedOption)) set.delete(patch.selectedOption);
            else set.add(patch.selectedOption);
            next.selectedOptions = [...set].sort();
            next.selectedOption = next.selectedOptions[0] ?? null;
          } else {
            next.selectedOptions = [patch.selectedOption];
            next.selectedOption = patch.selectedOption;
          }
        }
        if ((next.selectedOptions?.length || next.selectedOption) && next.status !== "marked") {
          if (patch.status !== "marked") next.status = "attempted";
        }
        if (patch.status === "not_attempted") {
          next.selectedOption = null;
          next.selectedOptions = [];
          next.status = "not_attempted";
        }
        const copy = [...prev];
        copy[at] = { ...next, selectedOptions: next.selectedOptions ?? [] };
        pendingRef.current = {
          ...pendingRef.current,
          [copy[at].id]: {
            questionKey: copy[at].id,
            selectedOption: copy[at].selectedOption,
            selectedOptions: copy[at].selectedOptions,
            status: copy[at].status,
          },
        };
        schedule();
        setMsg("");
        return copy;
      });
    });
  }

  async function submit(auto = false) {
    if (busy) return;
    if (!auto && !window.confirm(submitConfirm)) return;
    setBusy(true);
    await flush(true);
    const leftover = Object.values(pendingRef.current);
    try {
      const res = await fetch(`${apiBase}/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: leftover.length ? leftover : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setMsg(data.error || "Submit failed");
        return;
      }
      router.push(
        data.resultsUrl ||
          (apiBase.includes("competitions")
            ? `/competitions/results/${attemptId}`
            : `/topic-series/results/${attemptId}`),
      );
      router.refresh();
    } catch {
      setBusy(false);
      setMsg("Offline — retry when connected");
    }
  }

  const attempted = useMemo(
    () => questions.filter((q) => q.status !== "not_attempted" && (q.selectedOptions?.length || q.selectedOption)).length,
    [questions],
  );

  if (!current) return null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--header)] px-3 py-3 text-white sm:px-4">
        <div className="min-w-0">
          <h1 className="truncate font-[family-name:var(--font-display)] text-base font-semibold sm:text-lg">
            {title}
          </h1>
          <p className="text-xs text-blue-100">
            Attempted {attempted}/{questions.length} · Sync {syncState}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle compact className="cbt-btn cbt-btn-sm cbt-btn-ghost-toolbar" />
          <div className="rounded bg-black/25 px-3 py-1.5 font-mono text-lg">
            {formatRemain(remain)}
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_220px]">
        <main className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 text-sm font-semibold text-slate-500">
            Q{current.number} · {current.topic}
          </div>
          {(current.figureSrc || /figure|diagram|as shown/i.test(current.stem)) && (
            <QuestionFigure
              figureSrc={current.figureSrc}
              figureKind={current.figureKind}
              missingLabel="Figure not available"
              schematicLabel="Schematic figure"
            />
          )}
          <QuestionStemMarkdown stem={current.stem} className="mb-5" />
          <div className="space-y-2">
            {(["1", "2", "3", "4"] as const).map((opt) => {
              const selected = (current.selectedOptions ?? []).includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 ${
                    selected ? "border-[var(--cbt-accent)] bg-sky-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type={current.multiCorrect ? "checkbox" : "radio"}
                    name={`option-${current.id}`}
                    className="mt-1"
                    checked={selected}
                    onChange={() =>
                      updateCurrent({ selectedOption: opt, status: "attempted" })
                    }
                  />
                  <span className="q-option-row min-w-0 flex-1">
                    <strong className="mr-2 shrink-0">({opt})</strong>
                    <QuestionOptionMarkdown option={current.options[opt] ?? ""} />
                  </span>
                </label>
              );
            })}
          </div>

          <div className="exam-actions-sticky mt-6 flex flex-wrap gap-2 lg:!static lg:!mb-0 lg:!border-0 lg:!bg-transparent lg:!p-0 lg:!backdrop-filter-none">
            <button
              type="button"
              className="cbt-btn cbt-btn-muted"
              disabled={index <= 0}
              onClick={() => startTransition(() => setIndex((i) => Math.max(0, i - 1)))}
            >
              Previous
            </button>
            <button
              type="button"
              className="cbt-btn cbt-btn-mark"
              data-active={current.status === "marked" ? "true" : "false"}
              onClick={() =>
                updateCurrent({
                  status: current.status === "marked" ? "attempted" : "marked",
                })
              }
            >
              {current.status === "marked" ? "Unmark" : "Mark"}
            </button>
            <button
              type="button"
              className="cbt-btn cbt-btn-secondary"
              onClick={() =>
                updateCurrent({
                  selectedOption: null,
                  selectedOptions: [],
                  status: "not_attempted",
                })
              }
            >
              Clear
            </button>
            <button
              type="button"
              className="cbt-btn cbt-btn-primary"
              onClick={() => {
                if (index < questions.length - 1) startTransition(() => setIndex((i) => i + 1));
                else void flush(true);
              }}
            >
              Save & Next
            </button>
            <button
              type="button"
              className={`cbt-btn cbt-btn-danger ml-auto ${busy ? "cbt-btn-loading" : ""}`}
              disabled={busy}
              onClick={() => void submit(false)}
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
          {msg && <p className="mt-3 text-sm text-[var(--danger)]">{msg}</p>}
        </main>

        <aside className="rounded-xl border border-slate-200 bg-[#f7fafc] p-3">
          <h3 className="mb-2 text-sm font-semibold">Palette</h3>
          <div className="grid grid-cols-6 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                className="palette-btn"
                data-status={
                  q.status === "marked"
                    ? q.selectedOption
                      ? "marked_answered"
                      : "marked"
                    : q.selectedOption || q.selectedOptions?.length
                      ? "attempted"
                      : "not_attempted"
                }
                data-current={i === index ? "true" : "false"}
                onClick={() => startTransition(() => setIndex(i))}
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
