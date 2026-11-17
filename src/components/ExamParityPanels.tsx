"use client";

import { paletteStatus } from "@/lib/attempt-rules";

type QLite = {
  id: string;
  number: number;
  subject: string;
  section: string;
  stem: string;
  selectedOption: string | null;
  selectedOptions?: string[];
  status: "not_attempted" | "attempted" | "marked";
};

type I18n = {
  instructionsTitle: string;
  instructionsAck: string;
  instructionsContinue: string;
  questionPaperTitle: string;
  questionPaperClose: string;
  submitSummaryTitle: string;
  submitConfirm: string;
  submitCancel: string;
  submitBySubject: string;
  attempted: string;
  notAttempted: string;
  marked: string;
  markedAnswered: string;
};

export function ExamInstructionsPanel({
  i18n,
  year,
  title,
  durationMinutes,
  attemptLimit,
  totalQuestions,
  ack,
  onAckChange,
  onContinue,
  onClose,
  requireAck,
}: {
  i18n: I18n;
  year: number;
  title: string;
  durationMinutes: number;
  attemptLimit: number;
  totalQuestions: number;
  ack: boolean;
  onAckChange: (v: boolean) => void;
  onContinue: () => void;
  onClose?: () => void;
  requireAck: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-instructions-title"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2
            id="exam-instructions-title"
            className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--header)]"
          >
            {i18n.instructionsTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            NEET UG CBT — {year} · {title}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-800">
          <p>
            Duration <strong>{durationMinutes} minutes</strong>. Attempt up to{" "}
            <strong>
              {attemptLimit} of {totalQuestions}
            </strong>{" "}
            questions. Timer is server-controlled and does not pause.
          </p>
          <p>
            Marking: <strong>+4</strong> correct · <strong>−1</strong> wrong ·{" "}
            <strong>0</strong> unattempted. Multi-correct items (if any): exact set +4;
            subset +1 each; any wrong option −1.
          </p>
          <p>
            Section A is compulsory within the global attempt budget. Section B is{" "}
            <strong>attempt any 10 of 15</strong> per block (Physics, Chemistry, and each
            Biology block). Hitting 10/10 in one Section B block does{" "}
            <strong>not</strong> lock Section A or other blocks — clear a response in that
            block to attempt a different Section B question there.
          </p>
          <p>
            Palette colours: green = attempted · grey = not attempted · purple = visit later ·
            split = answered and visit later. You may change answers anytime before submit.
          </p>
          <p>
            Full screen is required. Leaving full screen, switching tabs/windows, or pressing
            Esc is logged for the examiner. Answers checkpoint to the server automatically.
          </p>
          <p>
            Keyboard: press <kbd className="rounded bg-slate-100 px-1">1</kbd>–
            <kbd className="rounded bg-slate-100 px-1">4</kbd> to choose an option;{" "}
            <kbd className="rounded bg-slate-100 px-1">←</kbd>/
            <kbd className="rounded bg-slate-100 px-1">→</kbd> for previous/next.
          </p>
          <p>
            If a stem, option, or figure looks unclear or incomplete in this digital
            extract, open <strong>View paper</strong> to read the original year PDF
            booklet in a popup, then close it and continue — the timer does not pause.
          </p>
        </div>
        <div className="space-y-3 border-t border-slate-200 px-5 py-4">
          {requireAck && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={ack}
                onChange={(e) => onAckChange(e.target.checked)}
              />
              <span>{i18n.instructionsAck}</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={requireAck && !ack}
              className="rounded-md bg-[var(--cbt-accent)] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onContinue}
            >
              {i18n.instructionsContinue}
            </button>
            {onClose && (
              <button
                type="button"
                className="rounded-md bg-slate-200 px-4 py-2.5 font-medium text-slate-800"
                onClick={onClose}
              >
                {i18n.questionPaperClose}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExamQuestionPaperPanel({
  i18n,
  questions,
  onJump,
  onClose,
}: {
  i18n: I18n;
  questions: QLite[];
  onJump: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-paper-title"
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2
            id="exam-paper-title"
            className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--header)]"
          >
            {i18n.questionPaperTitle}
          </h2>
          <button
            type="button"
            className="rounded bg-slate-200 px-3 py-1.5 text-sm font-medium"
            onClick={onClose}
          >
            {i18n.questionPaperClose}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {questions.map((q, i) => {
            const status = paletteStatus(
              q.status,
              (q.selectedOptions && q.selectedOptions[0]) || q.selectedOption,
            );
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onJump(i)}
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left hover:border-[var(--cbt-accent)] hover:bg-blue-50"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Q{q.number} · {q.subject} · Section {q.section}
                  </span>
                  <span className="capitalize">{status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-800">{q.stem}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ExamSubmitSummaryPanel({
  i18n,
  counts,
  bySubject,
  busy,
  onConfirm,
  onCancel,
}: {
  i18n: I18n;
  counts: {
    attempted: number;
    not_attempted: number;
    marked: number;
    marked_answered: number;
  };
  bySubject: Array<{
    subject: string;
    attempted: number;
    not_attempted: number;
    marked: number;
  }>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-submit-title"
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
      >
        <h2
          id="exam-submit-title"
          className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--header)]"
        >
          {i18n.submitSummaryTitle}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          You cannot change answers after submit. Review your status counts first.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded bg-emerald-50 px-3 py-2">
            {i18n.attempted}: <strong>{counts.attempted}</strong>
          </div>
          <div className="rounded bg-slate-100 px-3 py-2">
            {i18n.notAttempted}: <strong>{counts.not_attempted}</strong>
          </div>
          <div className="rounded bg-violet-50 px-3 py-2">
            {i18n.marked}: <strong>{counts.marked}</strong>
          </div>
          <div className="rounded bg-amber-50 px-3 py-2">
            {i18n.markedAnswered}: <strong>{counts.marked_answered}</strong>
          </div>
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-800">{i18n.submitBySubject}</h3>
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          {bySubject.map((s) => (
            <div
              key={s.subject}
              className="flex flex-wrap justify-between gap-2 rounded border border-slate-100 px-2 py-1.5"
            >
              <span className="font-medium">{s.subject}</span>
              <span>
                {i18n.attempted} {s.attempted} · {i18n.notAttempted} {s.not_attempted} ·{" "}
                {i18n.marked} {s.marked}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-[var(--danger)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
          >
            {i18n.submitConfirm}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-slate-200 px-4 py-2.5 font-medium"
            onClick={onCancel}
          >
            {i18n.submitCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
