"use client";

type Props = {
  year: number;
  pdfUrl: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
};

/** Full-year booklet PDF in an iframe popup — close and continue the CBT. */
export function ExamPdfPaperPanel({
  year,
  pdfUrl,
  title,
  closeLabel,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-pdf-title"
        className="flex h-[min(94dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="exam-pdf-title"
              className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-[var(--header)]"
            >
              View paper — NEET {year}
            </h2>
            <p className="truncate text-xs text-slate-500">{title}</p>
          </div>
          <button
            type="button"
            className="cbt-btn cbt-btn-primary shrink-0"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100">
          <iframe
            title={`NEET ${year} question paper PDF`}
            src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
            className="h-full w-full border-0"
          />
        </div>
        <p className="shrink-0 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          Use this booklet if a digital stem or figure is unclear. Close to continue
          answering in the CBT — the timer keeps running.
        </p>
      </div>
    </div>
  );
}
