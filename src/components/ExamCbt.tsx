"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionOptionMarkdown, QuestionStemMarkdown } from "@/components/QuestionMarkdown";

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
  initialScreenSwitchCount?: number;
};

type SubjectFilter = "ALL" | "Physics" | "Chemistry" | "Biology";
type SectionFilter = "ALL" | "A" | "B";

function formatRemain(ms: number) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

async function enterFullscreen(el: HTMLElement) {
  if (!document.fullscreenElement && el.requestFullscreen) {
    await el.requestFullscreen();
  }
}

function normalizeSubject(s: string): string {
  const t = (s || "").trim().toLowerCase();
  if (t.startsWith("phy")) return "Physics";
  if (t.startsWith("chem")) return "Chemistry";
  if (t.startsWith("bio")) return "Biology";
  return s;
}

export function ExamCbt({
  attemptId,
  year,
  title,
  endsAt,
  questions: initial,
  initialScreenSwitchCount = 0,
}: Props) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);
  const [questions, setQuestions] = useState(() =>
    initial.map((q) => ({ ...q, subject: normalizeSubject(q.subject) })),
  );
  const [index, setIndex] = useState(0);
  const [remain, setRemain] = useState(() => new Date(endsAt).getTime() - Date.now());
  const [busy, setBusy] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>("ALL");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("ALL");
  const [msg, setMsg] = useState("");
  const [examStarted, setExamStarted] = useState(false);
  const [showLockPopup, setShowLockPopup] = useState(false);
  const [popupReason, setPopupReason] = useState("");
  const [switchCount, setSwitchCount] = useState(initialScreenSwitchCount);
  const cooldownRef = useRef(0);
  const recordingRef = useRef(false);

  const availableSections = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) {
      if (subjectFilter !== "ALL" && q.subject !== subjectFilter) continue;
      if (q.section) set.add(String(q.section).toUpperCase());
    }
    return [...set].sort();
  }, [questions, subjectFilter]);

  const filteredIndexes = useMemo(() => {
    return questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => {
        if (subjectFilter !== "ALL" && q.subject !== subjectFilter) return false;
        if (sectionFilter !== "ALL" && String(q.section).toUpperCase() !== sectionFilter) {
          return false;
        }
        return true;
      })
      .map(({ i }) => i);
  }, [questions, subjectFilter, sectionFilter]);

  const current = questions[index] ?? questions[filteredIndexes[0]];

  const jumpToFilter = useCallback(
    (nextSubject: SubjectFilter, nextSection: SectionFilter) => {
      const idxs = questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => {
          if (nextSubject !== "ALL" && q.subject !== nextSubject) return false;
          if (nextSection !== "ALL" && String(q.section).toUpperCase() !== nextSection) {
            return false;
          }
          return true;
        })
        .map(({ i }) => i);
      if (idxs.length === 0) return;
      setIndex((prev) => (idxs.includes(prev) ? prev : idxs[0]));
    },
    [questions],
  );

  function selectSubject(s: SubjectFilter) {
    setSubjectFilter(s);
    setSectionFilter("ALL");
    jumpToFilter(s, "ALL");
  }

  function selectSection(sec: SectionFilter) {
    setSectionFilter(sec);
    jumpToFilter(subjectFilter, sec);
  }

  const recordSwitch = useCallback(
    async (reason: "escape" | "fullscreen_exit" | "tab_switch" | "window_blur") => {
      if (!examStarted) return;
      const now = Date.now();
      if (now - cooldownRef.current < 1500) return;
      if (recordingRef.current) return;
      cooldownRef.current = now;
      recordingRef.current = true;
      try {
        const res = await fetch(`/api/attempts/${attemptId}/proctor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (res.ok && typeof data.screenSwitchCount === "number") {
          setSwitchCount(data.screenSwitchCount);
        } else {
          setSwitchCount((c) => c + 1);
        }
      } catch {
        setSwitchCount((c) => c + 1);
      } finally {
        recordingRef.current = false;
      }
      const labels: Record<string, string> = {
        escape: "Escape key was pressed.",
        fullscreen_exit: "You left full-screen mode.",
        tab_switch: "You switched away from the exam tab.",
        window_blur: "The exam window lost focus.",
      };
      setPopupReason(labels[reason] || "Screen change detected.");
      setShowLockPopup(true);
    },
    [attemptId, examStarted],
  );

  async function startFullscreenExam() {
    try {
      if (shellRef.current) await enterFullscreen(shellRef.current);
      setExamStarted(true);
      setShowLockPopup(false);
    } catch {
      setMsg("Could not enter full screen. Allow full screen and try again.");
    }
  }

  async function returnToFullscreen() {
    try {
      if (shellRef.current) await enterFullscreen(shellRef.current);
      setShowLockPopup(false);
    } catch {
      setPopupReason("Full screen is required. Click the button again and allow permission.");
    }
  }

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

  useEffect(() => {
    if (!examStarted) return;

    const onFullscreen = () => {
      if (!isFullscreen()) void recordSwitch("fullscreen_exit");
    };
    const onVisibility = () => {
      if (document.hidden) void recordSwitch("tab_switch");
    };
    const onBlur = () => {
      if (!document.hidden) void recordSwitch("window_blur");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        void recordSwitch("escape");
      }
      if (e.key === "F11") {
        e.preventDefault();
        void recordSwitch("fullscreen_exit");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [examStarted, recordSwitch]);

  // Keep index valid when filters change
  useEffect(() => {
    if (filteredIndexes.length === 0) return;
    if (!filteredIndexes.includes(index)) {
      setIndex(filteredIndexes[0]);
    }
  }, [filteredIndexes, index]);

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

  function updateCurrent(patch: Partial<Q>) {
    const at = index;
    setQuestions((prev) => {
      const base = prev[at];
      if (!base) return prev;
      const next: Q = { ...base, ...patch };
      // Selecting an option always marks attempted unless already marked-for-review
      if (patch.selectedOption && next.status !== "marked") {
        next.status = "attempted";
      }
      if (patch.status === "not_attempted") {
        next.selectedOption = null;
        next.status = "not_attempted";
      }
      const copy = [...prev];
      copy[at] = next;
      void persist(next);
      return copy;
    });
  }

  async function submit(auto = false) {
    if (busy) return;
    if (!auto && !confirm("Submit the test? You cannot change answers after submit.")) {
      return;
    }
    setBusy(true);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
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

  const paletteIndexes = filteredIndexes.length > 0 ? filteredIndexes : questions.map((_, i) => i);

  if (!current) return null;

  return (
    <div ref={shellRef} className="cbt-shell flex min-h-screen flex-col bg-[var(--cbt-bg)]">
      {!examStarted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
          <div className="max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--header)]">
              Full screen required
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              This NEET CBT must run in <strong>full screen</strong>. Leaving full screen,
              switching tabs/windows, or pressing <strong>Esc</strong> is tracked and shown
              to the examiner. You cannot freely change the screen during the test.
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-md bg-[var(--cbt-accent)] px-4 py-3 font-semibold text-white hover:bg-[var(--cbt-accent-dark)]"
              onClick={() => void startFullscreenExam()}
            >
              Start exam in full screen
            </button>
            {msg && <p className="mt-3 text-sm text-[var(--danger)]">{msg}</p>}
          </div>
        </div>
      )}

      {showLockPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-md rounded-xl border-2 border-amber-500 bg-white p-6 shadow-2xl">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--danger)]">
              Screen change recorded
            </h2>
            <p className="mt-3 text-sm text-slate-700">
              You cannot change the screen during the exam. {popupReason} This event has been
              logged. Screen switches so far: <strong>{switchCount}</strong>.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Return to full screen to continue. The examiner can see how many times the
              screen was switched.
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-md bg-[var(--cbt-accent)] px-4 py-3 font-semibold text-white"
              onClick={() => void returnToFullscreen()}
            >
              Return to full screen
            </button>
          </div>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-3 bg-[var(--header)] px-4 py-3 text-white">
        <div>
          <div className="font-[family-name:var(--font-display)] text-lg font-semibold">
            NEET UG CBT — {year}
          </div>
          <div className="text-sm text-blue-100">{title}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded bg-black/25 px-3 py-1.5 text-sm">
            Screen switches: {switchCount}
          </div>
          <div className="rounded bg-black/25 px-4 py-2 font-mono text-xl tracking-wide">
            Time Left: {formatRemain(remain)}
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_320px]">
        <main className="bg-white p-4 md:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {(["ALL", "Physics", "Chemistry", "Biology"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => selectSubject(s)}
                className={`rounded px-3 py-1.5 font-medium ${
                  subjectFilter === s
                    ? "bg-[var(--cbt-accent)] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {s === "ALL" ? "All subjects" : s}
              </button>
            ))}
          </div>

          {availableSections.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Section:</span>
              <button
                type="button"
                onClick={() => selectSection("ALL")}
                className={`rounded px-3 py-1.5 font-medium ${
                  sectionFilter === "ALL"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {availableSections.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => selectSection(sec as SectionFilter)}
                  className={`rounded px-3 py-1.5 font-medium ${
                    sectionFilter === sec
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Section {sec}
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Q{current.number}.{" "}
              <span className="text-base font-medium text-slate-500">
                {current.subject} · Section {current.section}
              </span>
            </h2>
            <span className="text-xs text-slate-500">{current.topic}</span>
          </div>

          <QuestionStemMarkdown stem={current.stem} className="mb-5" />

          <div className="space-y-3">
            {(["1", "2", "3", "4"] as const).map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 ${
                  current.selectedOption === opt
                    ? "border-[var(--cbt-accent)] bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`option-${current.id}`}
                  className="mt-1 shrink-0"
                  checked={current.selectedOption === opt}
                  onChange={() =>
                    updateCurrent({
                      selectedOption: opt,
                      status: current.status === "marked" ? "marked" : "attempted",
                    })
                  }
                />
                <span className="q-option-row min-w-0 flex-1">
                  <strong className="mr-2 shrink-0">({opt})</strong>
                  <QuestionOptionMarkdown option={current.options[opt] ?? ""} />
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-slate-200 px-4 py-2 font-medium"
              onClick={() => {
                const pos = paletteIndexes.indexOf(index);
                const prev = paletteIndexes[pos - 1];
                if (prev !== undefined) setIndex(prev);
              }}
              disabled={paletteIndexes.indexOf(index) <= 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded bg-[var(--status-marked)] px-4 py-2 font-medium text-white"
              onClick={() =>
                updateCurrent({
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
                updateCurrent({
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
                const pos = paletteIndexes.indexOf(index);
                const next = paletteIndexes[pos + 1];
                if (next !== undefined) setIndex(next);
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
          <p className="mb-2 text-xs text-slate-500">
            {subjectFilter === "ALL" ? "All subjects" : subjectFilter}
            {sectionFilter !== "ALL" ? ` · Section ${sectionFilter}` : ""}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="attempted" aria-hidden />
              Attempted ({counts.attempted})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="not_attempted" aria-hidden />
              Not attempted ({counts.not_attempted})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="marked" aria-hidden />
              Marked ({counts.marked})
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
            {paletteIndexes.map((i) => {
              const q = questions[i];
              return (
                <button
                  key={q.id}
                  type="button"
                  className="palette-btn"
                  data-status={q.status}
                  data-current={i === index ? "true" : "false"}
                  onClick={() => setIndex(i)}
                  title={`Q${q.number} ${q.subject} · ${q.status.replaceAll("_", " ")}`}
                >
                  {q.number}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
