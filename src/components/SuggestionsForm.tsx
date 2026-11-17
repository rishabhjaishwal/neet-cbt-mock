"use client";

import { useCallback, useEffect, useState } from "react";

type Past = {
  id: string;
  bodyMarkdown: string;
  status: string;
  createdAt: string;
};

function previewLines(md: string) {
  return md
    .split("\n")
    .slice(0, 8)
    .map((line, i) => {
      if (line.startsWith("### "))
        return (
          <h4 key={i} className="mt-2 font-semibold text-slate-800">
            {line.slice(4)}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3 key={i} className="mt-2 text-base font-semibold text-slate-900">
            {line.slice(3)}
          </h3>
        );
      if (line.startsWith("# "))
        return (
          <h2 key={i} className="mt-2 text-lg font-semibold text-slate-900">
            {line.slice(2)}
          </h2>
        );
      if (line.startsWith("- "))
        return (
          <li key={i} className="ml-4 list-disc text-sm text-slate-700">
            {line.slice(2)}
          </li>
        );
      if (!line.trim()) return <div key={i} className="h-2" />;
      return (
        <p key={i} className="text-sm leading-relaxed text-slate-700">
          {line}
        </p>
      );
    });
}

export function SuggestionsForm() {
  const [text, setText] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [past, setPast] = useState<Past[]>([]);

  const loadPast = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      const data = await res.json();
      if (res.ok && Array.isArray(data.suggestions)) {
        setPast(
          data.suggestions.map(
            (s: {
              id: string;
              bodyMarkdown: string;
              status: string;
              createdAt: string;
            }) => ({
              ...s,
              createdAt:
                typeof s.createdAt === "string"
                  ? s.createdAt
                  : new Date(s.createdAt).toISOString(),
            }),
          ),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPast();
  }, [loadPast]);

  async function submit() {
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyMarkdown: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save");
        setBusy(false);
        return;
      }
      setOkMsg(data.message || "Saved.");
      setText("");
      setBusy(false);
      void loadPast();
    } catch {
      setBusy(false);
      setError("Network error");
    }
  }

  const chars = text.length;
  const ready = chars >= 8 && chars <= 8000 && !busy;

  return (
    <div className="space-y-6">
      <div className="desk-card desk-card--pad relative overflow-hidden">
        <span
          className="desk-sticky-chip desk-sticky-chip--butter absolute right-4 top-4 hidden sm:inline-flex"
          aria-hidden
        >
          Markdown
        </span>
        <h2 className="desk-section-title">You suggest, we implement</h2>
        <p className="desk-kicker mt-1 max-w-2xl">
          You suggest, we implement to improve it for you — drop ideas, bugs, or
          wish-list notes in this notebook box. Plain text or light markdown is fine.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["Night mode idea", "Add darker night mode for late-night mocks"],
              [
                "Wish list",
                "## Wish\n- More Biology ecology drills\n- Faster results load",
              ],
              ["Report a bug", "Bug: palette filter resets after checkpoint"],
            ] as const
          ).map(([label, hint]) => (
            <button
              key={label}
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-[var(--ink-blue,#1e4d7b)] hover:text-slate-900"
              onClick={() => setText(hint)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Your note
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"## What would help?\n- …\n\nThanks!"}
          className="mt-1 w-full resize-y rounded-xl border border-slate-300 bg-[#fffef8] px-3 py-3 font-mono text-sm leading-relaxed text-slate-800 shadow-inner outline-none focus:border-[var(--ink-blue,#1e4d7b)] focus:ring-2 focus:ring-sky-100"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {chars}/8000 · markdown supported (# headings, - lists)
          </span>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showPreview}
              onChange={(e) => setShowPreview(e.target.checked)}
            />
            Live preview
          </label>
        </div>

        {showPreview && text.trim() && (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/90 px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Preview
            </div>
            <div className="mt-1">{previewLines(text)}</div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!ready}
            className={`cbt-btn cbt-btn-primary ${busy ? "cbt-btn-loading" : ""}`}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Send suggestion"}
          </button>
          {okMsg && (
            <p className="text-sm font-medium text-emerald-700">{okMsg}</p>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </div>

      {past.length > 0 && (
        <div className="desk-card desk-card--pad">
          <h2 className="desk-section-title">Your recent notes</h2>
          <p className="desk-kicker mb-3">Saved on this account · newest first</p>
          <ul className="space-y-3">
            {past.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {new Date(s.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Calcutta",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    IST
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold uppercase tracking-wide text-slate-600">
                    {s.status}
                  </span>
                </div>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-700">
                  {s.bodyMarkdown}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
