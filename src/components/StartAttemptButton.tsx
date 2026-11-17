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
            ? `cbt-btn cbt-btn-secondary ${loading ? "cbt-btn-loading" : ""}`
            : `cbt-btn cbt-btn-primary ${loading ? "cbt-btn-loading" : ""}`
        }
        onClick={async () => {
          setLoading(true);
          setError("");
          try {
            const res = await fetch("/api/attempts/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ year, retake: mode === "retake" }),
            });
            const data = await res.json();
            if (!res.ok) {
              setLoading(false);
              setError(data.error || "Could not start");
              return;
            }
            // Keep loading state through navigation for clear feedback.
            router.push(`/exam/${data.attemptId}`);
          } catch {
            setLoading(false);
            setError("Network error — retry");
          }
        }}
      >
        {loading ? "Starting…" : mode === "retake" ? "Retake year" : "Start / Resume"}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
