"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  name: string;
  email: string;
  status: string;
  score: number | null;
  attemptId: string | null;
  isYou: boolean;
};

type Comp = {
  id: string;
  title: string;
  inviteCode: string;
  scope: string;
  difficulty: string;
  size: number;
  durationMin: number;
  status: string;
  isHost: boolean;
  members: Member[];
  myAttemptId: string | null;
  myAttemptStatus: string | null;
  endsAt?: string | null;
};

export function CompetitionLobby({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [comp, setComp] = useState<Comp | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/competitions/${competitionId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load");
      return;
    }
    setComp(data.competition);
  }, [competitionId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [load]);

  async function start() {
    if (!comp?.isHost) return;
    if (!window.confirm("Start now? Everyone gets the same random paper and timer."))
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/competitions/${competitionId}/start`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setBusy(false);
        setError(data.error || "Start failed");
        return;
      }
      if (data.myAttemptId) {
        router.push(`/competitions/exam/${data.myAttemptId}`);
      } else {
        await load();
        setBusy(false);
      }
    } catch {
      setBusy(false);
      setError("Network error");
    }
  }

  function inviteUrl() {
    if (!comp) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/competitions/join?code=${comp.inviteCode}`;
  }

  async function copyText(text: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy — share the code manually.");
    }
  }

  if (!comp && !error) {
    return <p className="text-sm text-slate-600">Loading lobby…</p>;
  }
  if (!comp) {
    return <p className="text-sm text-[var(--danger)]">{error}</p>;
  }

  const live = comp.status === "live";
  const closed = comp.status === "closed";
  const shareUrl = inviteUrl();

  return (
    <div className="space-y-4">
      <div className="desk-card desk-card--pad">
        <h2 className="desk-section-title">{comp.title}</h2>
        <p className="desk-kicker mt-1">
          {comp.scope === "ALL" ? "All subjects" : comp.scope} · {comp.difficulty} ·{" "}
          {comp.size} Q · ~{comp.durationMin} min ·{" "}
          <span className="font-semibold capitalize">{comp.status}</span>
        </p>

        {comp.status === "open" && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/90 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Shareable join link
            </div>
            <p className="mt-1 font-mono text-lg font-bold tracking-wider text-slate-900">
              {comp.inviteCode}
            </p>
            <label className="mt-2 block text-xs font-semibold text-slate-500">
              Copy this URL — friends open it after student login
            </label>
            <input
              readOnly
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Shareable competition join link"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="cbt-btn cbt-btn-primary cbt-btn-sm"
                onClick={() => void copyText(shareUrl, "link")}
              >
                {copied === "link" ? "Link copied!" : "Copy join link"}
              </button>
              <button
                type="button"
                className="cbt-btn cbt-btn-secondary cbt-btn-sm"
                onClick={() => void copyText(comp.inviteCode, "code")}
              >
                {copied === "code" ? "Code copied!" : "Copy code"}
              </button>
              {"share" in navigator && (
                <button
                  type="button"
                  className="cbt-btn cbt-btn-secondary cbt-btn-sm"
                  onClick={() => {
                    void navigator.share?.({
                      title: comp.title,
                      text: `Join my NEET competition (${comp.inviteCode})`,
                      url: shareUrl,
                    });
                  }}
                >
                  Share…
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {comp.isHost && comp.status === "open" && (
            <button
              type="button"
              disabled={busy}
              className="cbt-btn cbt-btn-primary"
              onClick={() => void start()}
            >
              {busy ? "Starting…" : "Start competition"}
            </button>
          )}
          {live && comp.myAttemptId && comp.myAttemptStatus !== "submitted" && (
            <button
              type="button"
              className="cbt-btn cbt-btn-primary"
              onClick={() => router.push(`/competitions/exam/${comp.myAttemptId}`)}
            >
              Enter exam
            </button>
          )}
          {comp.myAttemptId && comp.myAttemptStatus === "submitted" && (
            <button
              type="button"
              className="cbt-btn cbt-btn-secondary"
              onClick={() =>
                router.push(`/competitions/results/${comp.myAttemptId}`)
              }
            >
              View my results
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      </div>

      <div className="desk-card desk-card--pad">
        <h3 className="desk-section-title">Players ({comp.members.length})</h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {comp.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <span className="font-semibold text-slate-800">
                  {m.name}
                  {m.isYou ? " (you)" : ""}
                </span>
                <div className="text-xs text-slate-500">{m.email}</div>
              </div>
              <div className="text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                {m.status}
                {typeof m.score === "number" ? ` · ${m.score}` : ""}
              </div>
            </li>
          ))}
        </ul>
        {closed || live ? (
          <p className="mt-3 text-xs text-slate-500">
            Scores appear as each friend submits. Same paper for everyone.
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Waiting room — host starts when everyone has joined.
          </p>
        )}
      </div>
    </div>
  );
}
