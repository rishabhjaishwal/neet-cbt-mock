"use client";

import { useEffect, useState } from "react";

type Props = {
  year: number;
  /** Direct public PDF URL (CDN / GitHub raw). */
  pdfUrl: string;
  /** Google Docs (or similar) embed URL for the iframe. */
  embedUrl?: string | null;
  title: string;
  closeLabel: string;
  onClose: () => void;
};

/** Year booklet from a public URL — iframe popup; close and continue CBT. */
export function ExamPdfPaperPanel({
  year,
  pdfUrl,
  embedUrl,
  title,
  closeLabel,
  onClose,
}: Props) {
  const [iframeFailed, setIframeFailed] = useState(false);
  const iframeSrc = embedUrl || pdfUrl;

  useEffect(() => {
    setIframeFailed(false);
    // Mobile Safari often blanks Google/PDF iframes — surface a clear fallback.
    const t = window.setTimeout(() => {
      // Soft hint only; user can still wait if load is slow.
    }, 8000);
    return () => window.clearTimeout(t);
  }, [iframeSrc]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-pdf-title"
        className="flex h-[min(94dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="min-w-0">
            <h2
              id="exam-pdf-title"
              className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--header)] sm:text-lg"
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
            <button type="button" className="cbt-btn cbt-btn-primary cbt-btn-sm" onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        </div>

        {iframeFailed ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
            <p className="max-w-md text-sm text-slate-700">
              The in-app preview could not load this booklet (common on mobile). Open the PDF in a
              new tab, then come back — the timer keeps running.
            </p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cbt-btn cbt-btn-primary"
            >
              Open NEET {year} PDF
            </a>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 bg-slate-100">
            <iframe
              title={`NEET ${year} question paper PDF`}
              src={iframeSrc}
              className="h-full w-full border-0"
              referrerPolicy="no-referrer"
              allow="fullscreen"
              onError={() => setIframeFailed(true)}
            />
            {/* Always-visible mobile tip over slow/blank iframes */}
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex justify-center sm:hidden">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg"
              >
                Preview blank? Tap to open PDF
              </a>
            </div>
          </div>
        )}

        <p className="shrink-0 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          Booklet loads from a public mirror (not this server). If a stem or figure looks unclear,
          use this PDF, then close and continue — the timer keeps running.
        </p>
      </div>
    </div>
  );
}
