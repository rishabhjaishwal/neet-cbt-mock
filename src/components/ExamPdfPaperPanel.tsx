"use client";

type Props = {
  year: number;
  /** Direct public PDF URL (CDN). */
  pdfUrl: string;
  /** Optional PDF.js / viewer URL for iframe embedding. */
  embedUrl?: string | null;
  title: string;
  closeLabel: string;
  onClose: () => void;
};

/** Year booklet from a public CDN — iframe popup; close and continue CBT. */
export function ExamPdfPaperPanel({
  year,
  pdfUrl,
  embedUrl,
  title,
  closeLabel,
  onClose,
}: Props) {
  const iframeSrc = embedUrl || pdfUrl;

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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cbt-btn cbt-btn-secondary cbt-btn-sm"
            >
              Open PDF tab
            </a>
            <button type="button" className="cbt-btn cbt-btn-primary" onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100">
          <iframe
            title={`NEET ${year} question paper PDF`}
            src={iframeSrc}
            className="h-full w-full border-0"
            // Public CDN / PDF.js — not same-origin hosting
            referrerPolicy="no-referrer"
            allow="fullscreen"
          />
        </div>
        <p className="shrink-0 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          Booklet loads from a public mirror (not this server). If the stem or figure
          looks unclear, use this PDF, then close and continue — the timer keeps running.
        </p>
      </div>
    </div>
  );
}
