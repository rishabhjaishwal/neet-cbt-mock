"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApproveButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        onClick={async () => {
          setLoading(true);
          setError("");
          const res = await fetch(`/api/examiner/attempts/${attemptId}/approve`, {
            method: "POST",
          });
          const data = await res.json();
          setLoading(false);
          if (!res.ok) {
            setError(data.error || "Approve failed");
            return;
          }
          router.refresh();
        }}
      >
        {loading ? "Approving…" : "Approve result for student"}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
