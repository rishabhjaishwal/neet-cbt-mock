"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionOptionMarkdown, QuestionStemMarkdown } from "@/components/QuestionMarkdown";
import { QuestionFigure } from "@/components/QuestionFigure";
import { buildAttemptLimitInfo, paletteStatus } from "@/lib/attempt-rules";
import { t, type Lang } from "@/lib/i18n";

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
  needsFigure?: boolean;
};

type SubjectFilter = "ALL" | "Physics" | "Chemistry" | "Biology";
type SectionFilter = "ALL" | "A" | "B";

type PendingAnswer = {
  questionId: string;
  selectedOption: string | null;
  selectedOptions: string[];
  status: Q["status"];
};

type Props = {
  attemptId: string;
  year: number;
  title: string;
  endsAt: string;
  questions: Q[];
  attemptLimit?: number;
  totalQuestions?: number;
  initialScreenSwitchCount?: number;
  initialQuestionIndex?: number;
  initialSubjectFilter?: SubjectFilter;
  initialSectionFilter?: SectionFilter;
  initialCheckpointAt?: string | null;
};

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

function pendingStorageKey(attemptId: string) {
  return `neet-cbt-pending:${attemptId}`;
}

function loadPending(attemptId: string): Record<string, PendingAnswer> {
  try {
    const raw = localStorage.getItem(pendingStorageKey(attemptId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PendingAnswer>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePending(attemptId: string, pending: Record<string, PendingAnswer>) {
  try {
    if (Object.keys(pending).length === 0) {
      localStorage.removeItem(pendingStorageKey(attemptId));
    } else {
      localStorage.setItem(pendingStorageKey(attemptId), JSON.stringify(pending));
    }
  } catch {
    /* quota / private mode */
  }
}

export function ExamCbt({
  attemptId,
  year,
  title,
  endsAt: endsAtProp,
  questions: initial,
  attemptLimit = 180,
  totalQuestions = 180,
  initialScreenSwitchCount = 0,
  initialQuestionIndex = 0,
  initialSubjectFilter = "ALL",
  initialSectionFilter = "ALL",
  initialCheckpointAt = null,
}: Props) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<Lang>("en");
  const i18n = t(lang);

  const [questions, setQuestions] = useState(() => {
    const base = initial.map((q) => ({
      ...q,
      subject: normalizeSubject(q.subject),
      selectedOptions:
        q.selectedOptions?.length
          ? q.selectedOptions
          : q.selectedOption
            ? [q.selectedOption]
            : [],
    }));
    if (typeof window === "undefined") return base;
    const pending = loadPending(attemptId);
    if (!Object.keys(pending).length) return base;
    return base.map((q) => {
      const p = pending[q.id];
      if (!p) return q;
      const selectedOptions =
        p.selectedOptions?.length
          ? p.selectedOptions
          : p.selectedOption
            ? [p.selectedOption]
            : [];
      return {
        ...q,
        selectedOption: selectedOptions[0] ?? null,
        selectedOptions,
        status: p.status,
      };
    });
  });

  const clampedInitial = Math.min(
    Math.max(0, initialQuestionIndex),
    Math.max(0, initial.length - 1),
  );
  const [index, setIndex] = useState(clampedInitial);
  /** Server clock only — never extended from client remaining time. */
  const [endsAt, setEndsAt] = useState(endsAtProp);
  const [remain, setRemain] = useState(() => new Date(endsAtProp).getTime() - Date.now());
  const [busy, setBusy] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>(initialSubjectFilter);
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(initialSectionFilter);
  const [msg, setMsg] = useState("");
  const [examStarted, setExamStarted] = useState(false);
  const [showLockPopup, setShowLockPopup] = useState(false);
  const [popupReason, setPopupReason] = useState("");
  const [switchCount, setSwitchCount] = useState(initialScreenSwitchCount);
  const [online, setOnline] = useState(true);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "saved" | "error">("idle");
  const [checkpointAt, setCheckpointAt] = useState<string | null>(initialCheckpointAt);
  const [pendingCount, setPendingCount] = useState(0);

  const cooldownRef = useRef(0);
  const recordingRef = useRef(false);
  const pendingRef = useRef<Record<string, PendingAnswer>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const indexRef = useRef(index);
  const subjectRef = useRef(subjectFilter);
  const sectionRef = useRef(sectionFilter);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    subjectRef.current = subjectFilter;
  }, [subjectFilter]);
  useEffect(() => {
    sectionRef.current = sectionFilter;
  }, [sectionFilter]);

  useEffect(() => {
    pendingRef.current = loadPending(attemptId);
    setPendingCount(Object.keys(pendingRef.current).length);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
  }, [attemptId]);

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

  const queuePending = useCallback(
    (item: PendingAnswer) => {
      pendingRef.current = { ...pendingRef.current, [item.questionId]: item };
      savePending(attemptId, pendingRef.current);
      setPendingCount(Object.keys(pendingRef.current).length);
    },
    [attemptId],
  );

  const flushCheckpoint = useCallback(
    async (opts?: { force?: boolean }) => {
      if (syncingRef.current && !opts?.force) return false;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setOnline(false);
        setSyncState("error");
        return false;
      }

      syncingRef.current = true;
      setSyncState("syncing");
      try {
        const pending = Object.values(pendingRef.current);
        const res = await fetch(`/api/attempts/${attemptId}/checkpoint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: pending.length ? pending : undefined,
            currentQuestionIndex: indexRef.current,
            subjectFilter: subjectRef.current,
            sectionFilter: sectionRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSyncState("error");
          setOnline(navigator.onLine);
          return false;
        }

        // Apply server clock — never trust client to extend time
        if (typeof data.endsAt === "string") {
          setEndsAt(data.endsAt);
          setRemain(Math.max(0, new Date(data.endsAt).getTime() - Date.now()));
        } else if (typeof data.remainingMs === "number") {
          setRemain(Math.max(0, data.remainingMs));
        }
        if (typeof data.screenSwitchCount === "number") {
          setSwitchCount(data.screenSwitchCount);
        }
        if (typeof data.checkpointAt === "string") {
          setCheckpointAt(data.checkpointAt);
        }

        pendingRef.current = {};
        savePending(attemptId, {});
        setPendingCount(0);
        setOnline(true);
        setSyncState("saved");
        return true;
      } catch {
        setOnline(false);
        setSyncState("error");
        return false;
      } finally {
        syncingRef.current = false;
      }
    },
    [attemptId],
  );

  const scheduleCheckpoint = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void flushCheckpoint();
    }, 600);
  }, [flushCheckpoint]);

  const restoreFromServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/attempts/${attemptId}/checkpoint`);
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.endsAt === "string") {
        setEndsAt(data.endsAt);
        setRemain(Math.max(0, new Date(data.endsAt).getTime() - Date.now()));
      }
      if (typeof data.currentQuestionIndex === "number") {
        setIndex(data.currentQuestionIndex);
      }
      if (data.subjectFilter === "ALL" || data.subjectFilter === "Physics" || data.subjectFilter === "Chemistry" || data.subjectFilter === "Biology") {
        setSubjectFilter(data.subjectFilter);
      }
      if (data.sectionFilter === "ALL" || data.sectionFilter === "A" || data.sectionFilter === "B") {
        setSectionFilter(data.sectionFilter);
      }
      if (typeof data.screenSwitchCount === "number") {
        setSwitchCount(data.screenSwitchCount);
      }
      if (data.checkpointAt) setCheckpointAt(data.checkpointAt);

      if (Array.isArray(data.answers)) {
        const byId = new Map<string, PendingAnswer>();
        for (const a of data.answers as PendingAnswer[]) {
          if (a?.questionId) byId.set(a.questionId, a);
        }
        setQuestions((prev) =>
          prev.map((q) => {
            const local = pendingRef.current[q.id];
            if (local) {
              const selectedOptions =
                local.selectedOptions?.length
                  ? local.selectedOptions
                  : local.selectedOption
                    ? [local.selectedOption]
                    : [];
              return {
                ...q,
                selectedOption: selectedOptions[0] ?? null,
                selectedOptions,
                status: local.status,
              };
            }
            const s = byId.get(q.id);
            if (!s) return q;
            const selectedOptions =
              s.selectedOptions?.length
                ? s.selectedOptions
                : s.selectedOption
                  ? [s.selectedOption]
                  : [];
            return {
              ...q,
              selectedOption: selectedOptions[0] ?? null,
              selectedOptions,
              status: s.status,
            };
          }),
        );
      }
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [attemptId]);

  function selectSubject(s: SubjectFilter) {
    setSubjectFilter(s);
    setSectionFilter("ALL");
    jumpToFilter(s, "ALL");
    scheduleCheckpoint();
  }

  function selectSection(sec: SectionFilter) {
    setSectionFilter(sec);
    jumpToFilter(subjectFilter, sec);
    scheduleCheckpoint();
  }

  const goToIndex = useCallback(
    (i: number) => {
      setIndex(i);
      scheduleCheckpoint();
    },
    [scheduleCheckpoint],
  );

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
      void flushCheckpoint({ force: true });
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

  // Timer from server endsAt only
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
      else {
        void restoreFromServer().then(() => flushCheckpoint({ force: true }));
      }
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
  }, [examStarted, recordSwitch, restoreFromServer, flushCheckpoint]);

  // Online / offline + periodic checkpoint
  useEffect(() => {
    const onOffline = () => {
      setOnline(false);
      setSyncState("error");
    };
    const onOnline = () => {
      setOnline(true);
      void (async () => {
        await flushCheckpoint({ force: true });
        await restoreFromServer();
        setSyncState("saved");
      })();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    const periodic = setInterval(() => {
      void flushCheckpoint();
    }, 20_000);

    // Initial flush of any local pending after mount
    void flushCheckpoint({ force: true });

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      clearInterval(periodic);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flushCheckpoint, restoreFromServer]);

  useEffect(() => {
    if (filteredIndexes.length === 0) return;
    if (!filteredIndexes.includes(index)) {
      setIndex(filteredIndexes[0]);
    }
  }, [filteredIndexes, index]);

  function updateCurrent(patch: Partial<Q>) {
    const at = index;
    setQuestions((prev) => {
      const base = prev[at];
      if (!base) return prev;
      const next: Q = { ...base, ...patch };
      if (patch.selectedOptions) {
        next.selectedOptions = [...patch.selectedOptions].sort();
        next.selectedOption = next.selectedOptions[0] ?? null;
      } else if (patch.selectedOption !== undefined) {
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

      const had =
        (base.selectedOptions && base.selectedOptions.length > 0) ||
        (base.selectedOption != null && base.selectedOption !== "");
      const has =
        (next.selectedOptions && next.selectedOptions.length > 0) ||
        (next.selectedOption != null && next.selectedOption !== "");
      if (has && !had) {
        const limits = buildAttemptLimitInfo(prev, attemptLimit, totalQuestions);
        const gate = limits.canAttempt(base.id);
        if (!gate.ok) {
          setMsg(gate.reason || "Attempt limit reached");
          return prev;
        }
      }

      const normalized: Q = {
        ...next,
        selectedOptions: next.selectedOptions ?? [],
      };
      const copy = [...prev];
      copy[at] = normalized;
      queuePending({
        questionId: normalized.id,
        selectedOption: normalized.selectedOption,
        selectedOptions: normalized.selectedOptions ?? [],
        status: normalized.status,
      });
      scheduleCheckpoint();
      setMsg("");
      return copy;
    });
  }

  const limitInfo = useMemo(
    () => buildAttemptLimitInfo(questions, attemptLimit, totalQuestions),
    [questions, attemptLimit, totalQuestions],
  );

  async function submit(auto = false) {
    if (busy) return;
    if (!auto && !confirm("Submit the test? You cannot change answers after submit.")) {
      return;
    }
    setBusy(true);
    await flushCheckpoint({ force: true });
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setMsg(data.error || "Submit failed — check network and retry");
        setSyncState("error");
        return;
      }
      savePending(attemptId, {});
      setMsg(data.message || "Submitted");
      router.push("/dashboard?submitted=1");
      router.refresh();
    } catch {
      setBusy(false);
      setMsg("Submit failed — you appear offline. Progress is kept locally; retry when online.");
      setOnline(false);
      setSyncState("error");
    }
  }

  const counts = useMemo(() => {
    const c = { attempted: 0, not_attempted: 0, marked: 0 };
    for (const q of questions) c[q.status] += 1;
    return c;
  }, [questions]);

  const paletteIndexes = filteredIndexes.length > 0 ? filteredIndexes : questions.map((_, i) => i);

  if (!current) return null;

  const syncLabel =
    !online || syncState === "error"
      ? pendingCount > 0
        ? `Offline — ${pendingCount} answer(s) queued · auto-retrying`
        : "Offline — reconnecting…"
      : syncState === "syncing"
        ? "Saving checkpoint…"
        : syncState === "saved"
          ? checkpointAt
            ? `Checkpoint saved ${new Date(checkpointAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Calcutta" })} IST`
            : "Checkpoint saved"
          : pendingCount > 0
            ? "Pending sync…"
            : "Synced";

  return (
    <div ref={shellRef} className="cbt-shell flex min-h-screen flex-col bg-[var(--cbt-bg)]">
      {(!online || syncState === "error") && (
        <div className="z-[70] bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white">
          Network issue detected. Your answers stay on this device and will sync to the server
          automatically. The exam timer continues from the server clock (not reset).{" "}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void flushCheckpoint({ force: true })}
          >
            Retry sync now
          </button>
        </div>
      )}
      {online && syncState !== "error" && (
        <div className="bg-slate-800/90 px-4 py-1 text-center text-xs text-slate-100">
          {syncLabel}
        </div>
      )}

      {!examStarted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
          <div className="max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--header)]">
              {i18n.fullscreenTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{i18n.fullscreenBody}</p>
            <button
              type="button"
              className="mt-5 w-full rounded-md bg-[var(--cbt-accent)] px-4 py-3 font-semibold text-white hover:bg-[var(--cbt-accent-dark)]"
              onClick={() => void startFullscreenExam()}
            >
              {i18n.startFullscreen}
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
          <div className="flex rounded bg-black/25 p-1 text-sm">
            <button
              type="button"
              className={`rounded px-2 py-1 ${lang === "en" ? "bg-white text-slate-900" : ""}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${lang === "hi" ? "bg-white text-slate-900" : ""}`}
              onClick={() => setLang("hi")}
            >
              हिं
            </button>
          </div>
          <div className="rounded bg-black/25 px-3 py-1.5 text-sm">
            {i18n.attemptSlots}: {limitInfo.attemptedCount}/{limitInfo.attemptLimit}
          </div>
          <div className="rounded bg-black/25 px-3 py-1.5 text-sm">
            {i18n.screenSwitches}: {switchCount}
          </div>
          <div className="rounded bg-black/25 px-4 py-2 font-mono text-xl tracking-wide">
            {i18n.timeLeft}: {formatRemain(remain)}
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
                {s === "ALL" ? i18n.allSubjects : s}
              </button>
            ))}
          </div>
          <p className="mb-3 text-xs text-slate-500">{i18n.paperLangNote}</p>

          {availableSections.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">{i18n.section}:</span>
              <button
                type="button"
                onClick={() => selectSection("ALL")}
                className={`rounded px-3 py-1.5 font-medium ${
                  sectionFilter === "ALL"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {i18n.all}
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
                  {i18n.section} {sec}
                </button>
              ))}
            </div>
          )}

          {limitInfo.sectionBCaps.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-600">
              {limitInfo.sectionBCaps.map((c) => (
                <span
                  key={c.subject}
                  className={`rounded px-2 py-1 ${c.over ? "bg-rose-100 text-rose-800" : "bg-slate-100"}`}
                >
                  {c.subject} B: {c.attempted}/{c.cap}
                </span>
              ))}
            </div>
          )}

          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Q{current.number}.{" "}
              <span className="text-base font-medium text-slate-500">
                {current.subject} · {i18n.section} {current.section}
              </span>
            </h2>
            <span className="text-xs text-slate-500">{current.topic}</span>
          </div>

          {(current.needsFigure || current.figureSrc) && (
            <QuestionFigure
              figureSrc={current.figureSrc}
              figureKind={current.figureKind}
              missingLabel={i18n.figureMissing}
              schematicLabel={i18n.figureSchematic}
            />
          )}

          <QuestionStemMarkdown stem={current.stem} className="mb-5" />
          {current.multiCorrect && (
            <p className="mb-3 text-xs font-medium text-amber-800">
              Multi-correct: select all that apply. Exact set = +4; subset only = +1 each; any wrong
              option = −1.
            </p>
          )}

          <div className="space-y-3">
            {(["1", "2", "3", "4"] as const).map((opt) => {
              const selected = (current.selectedOptions ?? []).includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 ${
                    selected
                      ? "border-[var(--cbt-accent)] bg-blue-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type={current.multiCorrect ? "checkbox" : "radio"}
                    name={`option-${current.id}`}
                    className="mt-1 shrink-0"
                    checked={selected}
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
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-slate-200 px-4 py-2 font-medium"
              onClick={() => {
                const pos = paletteIndexes.indexOf(index);
                const prev = paletteIndexes[pos - 1];
                if (prev !== undefined) goToIndex(prev);
              }}
              disabled={paletteIndexes.indexOf(index) <= 0}
            >
              {i18n.previous}
            </button>
            <button
              type="button"
              className="rounded bg-[var(--status-marked)] px-4 py-2 font-medium text-white"
              onClick={() =>
                updateCurrent({
                  status: "marked",
                  selectedOptions: current.selectedOptions ?? [],
                  selectedOption: current.selectedOption,
                })
              }
            >
              {i18n.markReview}
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-4 py-2 font-medium text-white"
              onClick={() =>
                updateCurrent({
                  selectedOption: null,
                  selectedOptions: [],
                  status: "not_attempted",
                })
              }
            >
              {i18n.clear}
            </button>
            <button
              type="button"
              className="rounded bg-[var(--cbt-accent)] px-4 py-2 font-medium text-white"
              onClick={() => {
                const pos = paletteIndexes.indexOf(index);
                const next = paletteIndexes[pos + 1];
                if (next !== undefined) goToIndex(next);
                else void flushCheckpoint({ force: true });
              }}
            >
              {i18n.saveNext}
            </button>
            <button
              type="button"
              className="ml-auto rounded bg-[var(--danger)] px-4 py-2 font-semibold text-white"
              onClick={() => void submit(false)}
              disabled={busy}
            >
              {i18n.submit}
            </button>
          </div>
          {msg && <p className="mt-3 text-sm text-[var(--danger)]">{msg}</p>}
        </main>

        <aside className="border-l border-slate-200 bg-[#f7fafc] p-4">
          <h3 className="mb-3 font-[family-name:var(--font-display)] font-semibold">
            {i18n.palette}
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            {subjectFilter === "ALL" ? i18n.allSubjects : subjectFilter}
            {sectionFilter !== "ALL" ? ` · ${i18n.section} ${sectionFilter}` : ""}
          </p>
          <div className="mb-4 grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="attempted" aria-hidden />
              {i18n.attempted} ({counts.attempted})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="not_attempted" aria-hidden />
              {i18n.notAttempted} ({counts.not_attempted})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="marked" aria-hidden />
              {i18n.marked} ({counts.marked})
            </div>
            <div className="flex items-center gap-2">
              <span className="palette-btn" data-status="marked_answered" aria-hidden />
              {i18n.markedAnswered}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
            {paletteIndexes.map((i) => {
              const q = questions[i];
              const status = paletteStatus(
                q.status,
                (q.selectedOptions && q.selectedOptions[0]) || q.selectedOption,
              );
              return (
                <button
                  key={q.id}
                  type="button"
                  className="palette-btn"
                  data-status={status}
                  data-current={i === index ? "true" : "false"}
                  onClick={() => goToIndex(i)}
                  title={`Q${q.number} ${q.subject} · ${status.replaceAll("_", " ")}`}
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
