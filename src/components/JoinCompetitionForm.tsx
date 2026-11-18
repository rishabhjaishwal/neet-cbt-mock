"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function JoinCompetitionForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoTried = useRef(false);

  useEffect(() => {
    const q = search.get("code");
    if (q) setCode(q.toUpperCase());
  }, [search]);

  async function join(inviteCode: string, { auto }: { auto?: boolean } = {}) {
    const trimmed = inviteCode.trim().toUpperCase();
    if (trimmed.length < 4) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/competitions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: trimmed }),
      });
      const data = await res.json();
      if (res.status === 401) {
        const next = `/competitions/join?code=${encodeURIComponent(trimmed)}`;
        router.push(`/signup?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!res.ok) {
        setBusy(false);
        setError(data.error || "Could not join");
        return;
      }
      router.push(`/competitions/${data.id}`);
    } catch {
      setBusy(false);
      if (!auto) setError("Network error");
    }
  }

  // Logged-in student with ?code=… → join immediately (shareable URL flow).
  useEffect(() => {
    const q = search.get("code")?.trim();
    if (!q || autoTried.current) return;
    autoTried.current = true;
    void join(q, { auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount/code
  }, [search]);

  return (
    <div className="desk-card desk-card--pad">
      <h2 className="desk-section-title">Join with invite link or code</h2>
      <p className="desk-kicker mb-3">
        Open a friend&apos;s share link while logged in as a student, or paste the
        invite code below. New friends signup first — we bring them back here.
      </p>
      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-lg uppercase tracking-widest"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD1234"
        maxLength={16}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        disabled={busy || code.trim().length < 4}
        className="cbt-btn cbt-btn-primary mt-3"
        onClick={() => void join(code)}
      >
        {busy ? "Joining…" : "Join competition"}
      </button>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Already have an account?{" "}
        <a
          className="font-semibold text-[var(--ink-blue,#1e4d7b)] underline"
          href={`/login?next=${encodeURIComponent(
            `/competitions/join?code=${code.trim() || "CODE"}`,
          )}`}
        >
          Student login
        </a>
      </p>
    </div>
  );
}
