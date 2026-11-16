"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartAttemptButton({
  year,
  mode = "start",
}: {
  year: number;
  mode?: "start" | "retake";
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        className={
          mode === "retake"
            ? "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            : "rounded-md bg-[var(--cbt-accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--cbt-accent-dark)] disabled:opacity-60"
        }
        onClick={async () => {
          setLoading(true);
          setError("");
          const res = await fetch("/api/attempts/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ year, retake: mode === "retake" }),
          });
          const data = await res.json();
          setLoading(false);
          if (!res.ok) {
            setError(data.error || "Could not start");
            return;
          }
          router.push(`/exam/${data.attemptId}`);
        }}
      >
        {loading ? "Starting…" : mode === "retake" ? "Retake year" : "Start / Resume"}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
