"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartAttemptButton({ year }: { year: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        className="rounded-md bg-[var(--cbt-accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--cbt-accent-dark)] disabled:opacity-60"
        onClick={async () => {
          setLoading(true);
          setError("");
          const res = await fetch("/api/attempts/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ year }),
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
        {loading ? "Starting…" : "Start / Resume"}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
