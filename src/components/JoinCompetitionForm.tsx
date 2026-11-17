"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function JoinCompetitionForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = search.get("code");
    if (q) setCode(q.toUpperCase());
  }, [search]);

  async function join() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/competitions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code.trim() }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push(
          `/signup?next=${encodeURIComponent(`/competitions/join?code=${code.trim()}`)}`,
        );
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
      setError("Network error");
    }
  }

  return (
    <div className="desk-card desk-card--pad">
      <h2 className="desk-section-title">Join with invite code</h2>
      <p className="desk-kicker mb-3">
        Friends must create a student account first, then enter the code from the host.
      </p>
      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-lg uppercase tracking-widest"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD1234"
        maxLength={16}
      />
      <button
        type="button"
        disabled={busy || code.trim().length < 4}
        className="cbt-btn cbt-btn-primary mt-3"
        onClick={() => void join()}
      >
        {busy ? "Joining…" : "Join competition"}
      </button>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
