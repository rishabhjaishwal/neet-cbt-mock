"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartTopicButton({
  topicId,
  difficulty,
  disabled,
}: {
  topicId: string;
  difficulty: "Easy" | "Medium" | "Hard";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={disabled || loading}
        className={`cbt-btn cbt-btn-sm cbt-btn-primary ${loading ? "cbt-btn-loading" : ""}`}
        onClick={async () => {
          setLoading(true);
          setError("");
          try {
            const res = await fetch("/api/topic-series/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ topicId, difficulty, limit: 30 }),
            });
            const data = await res.json();
            if (!res.ok) {
              setLoading(false);
              setError(data.error || "Could not start");
              return;
            }
            router.push(`/topic-series/exam/${data.attemptId}`);
          } catch {
            setLoading(false);
            setError("Network error");
          }
        }}
      >
        {loading ? "…" : "Start"}
      </button>
      {error && <p className="mt-1 text-[10px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}
