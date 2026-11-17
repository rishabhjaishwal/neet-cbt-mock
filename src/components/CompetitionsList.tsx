"use client";

import { useEffect, useState } from "react";
import { InstantLink } from "@/components/InstantLink";

type Row = {
  id: string;
  title: string;
  inviteCode: string;
  scope: string;
  difficulty: string;
  size: number;
  durationMin: number;
  status: string;
  isHost: boolean;
  memberCount: number;
};

export function CompetitionsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/competitions");
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error || "Could not load");
          return;
        }
        if (!cancelled) setRows(data.competitions || []);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-[var(--danger)]">{error}</p>;
  }
  if (!rows) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No competitions yet.{" "}
        <InstantLink href="/competitions/new" className="btn-ink-link">
          Create one →
        </InstantLink>
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <InstantLink
              href={`/competitions/${c.id}`}
              className="font-semibold text-slate-900 hover:underline"
            >
              {c.title}
            </InstantLink>
            <p className="text-xs text-slate-500">
              {c.scope === "ALL" ? "All subjects" : c.scope} · {c.difficulty} ·{" "}
              {c.size}Q · ~{c.durationMin} min · {c.memberCount} players
              {c.isHost ? " · host" : ""} · {c.status}
            </p>
          </div>
          <InstantLink
            href={`/competitions/${c.id}`}
            className="cbt-btn cbt-btn-secondary cbt-btn-sm"
          >
            Open
          </InstantLink>
        </li>
      ))}
    </ul>
  );
}
