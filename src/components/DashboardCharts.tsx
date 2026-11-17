"use client";

import type { DashAttemptPoint } from "@/lib/dashboard-points";

export type { DashAttemptPoint };

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Calcutta",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Stock-like performance line: marks obtained vs time. */
function PerformanceLineChart({ points }: { points: DashAttemptPoint[] }) {
  if (points.length === 0) return null;
  const W = 640;
  const H = 220;
  const pad = { t: 24, r: 16, b: 36, l: 44 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxY = Math.max(720, ...points.map((p) => Math.max(p.totalMarks, p.score)));
  const minY = Math.min(0, ...points.map((p) => p.score));
  const spanY = Math.max(1, maxY - minY);
  const n = points.length;

  const xy = points.map((p, i) => {
    const x = pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = pad.t + innerH - ((p.score - minY) / spanY) * innerH;
    return { x, y, p };
  });

  const line = xy.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area =
    line +
    ` L${xy[xy.length - 1].x.toFixed(1)},${(pad.t + innerH).toFixed(1)}` +
    ` L${xy[0].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const up = !prev || last.score >= prev.score;
  const stroke = up ? "#0f9f6e" : "#c2410c";

  return (
    <div className="desk-chart-frame">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Performance over time">
        <defs>
          <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={gy}
                y2={gy}
                stroke="rgba(36,48,65,0.08)"
                strokeDasharray={t === 0 || t === 1 ? undefined : "3 4"}
              />
              <text
                x={pad.l - 8}
                y={gy + 4}
                textAnchor="end"
                fontSize="10"
                fill="#64748b"
              >
                {Math.round(minY + spanY * t)}
              </text>
            </g>
          );
        })}
        {/* Total marks reference */}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={pad.t + innerH - ((720 - minY) / spanY) * innerH}
          y2={pad.t + innerH - ((720 - minY) / spanY) * innerH}
          stroke="rgba(30,77,123,0.35)"
          strokeDasharray="5 5"
        />
        <text
          x={W - pad.r}
          y={pad.t + innerH - ((720 - minY) / spanY) * innerH - 6}
          textAnchor="end"
          fontSize="10"
          fill="#1e4d7b"
        >
          720 total
        </text>
        <path d={area} fill="url(#perfFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
        {xy.map(({ x, y, p }) => (
          <g key={p.id}>
            <circle cx={x} cy={y} r="4.5" fill="#fff" stroke={stroke} strokeWidth="2" />
            <title>{`${p.label}: ${p.score}/${p.totalMarks} · ${formatWhen(p.at)}`}</title>
          </g>
        ))}
        {xy.map(({ x, p }, i) =>
          i % Math.ceil(n / 6) === 0 || i === n - 1 ? (
            <text
              key={`lbl-${p.id}`}
              x={x}
              y={H - 10}
              textAnchor="middle"
              fontSize="9"
              fill="#64748b"
            >
              {p.kind === "paper" ? String(p.year ?? "") : "T"}
            </text>
          ) : null,
        )}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
        <span>
          Latest{" "}
          <strong className="text-slate-800">
            {last.score}/{last.totalMarks}
          </strong>{" "}
          · {formatWhen(last.at)}
        </span>
        <span className={up ? "font-semibold text-emerald-700" : "font-semibold text-orange-700"}>
          {prev
            ? up
              ? `▲ +${last.score - prev.score} vs prior`
              : `▼ ${last.score - prev.score} vs prior`
            : "First scored attempt"}
        </span>
      </div>
    </div>
  );
}

/** Grouped bars: last N paper attempts × subject marks. */
function SubjectBarChart({ points }: { points: DashAttemptPoint[] }) {
  const papers = points.filter((p) => p.kind === "paper").slice(-10);
  if (!papers.length) {
    return (
      <p className="text-sm text-slate-600">
        Subject bars appear after you submit a full-year paper.
      </p>
    );
  }
  const W = 640;
  const H = 240;
  const pad = { t: 20, r: 12, b: 48, l: 36 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const groupW = innerW / papers.length;
  const barW = Math.min(14, groupW / 4.2);
  const maxSub = Math.max(
    180,
    ...papers.flatMap((p) => [
      p.subjectScores.Physics,
      p.subjectScores.Chemistry,
      p.subjectScores.Biology,
    ]),
  );
  const colors = {
    Physics: "#2563eb",
    Chemistry: "#059669",
    Biology: "#c026d3",
  } as const;
  const subjects = ["Physics", "Chemistry", "Biology"] as const;

  return (
    <div className="desk-chart-frame">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Subject scores last attempts">
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y}
                y2={y}
                stroke="rgba(36,48,65,0.08)"
              />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">
                {Math.round(maxSub * t)}
              </text>
            </g>
          );
        })}
        {papers.map((p, gi) => {
          const gx = pad.l + gi * groupW + groupW / 2;
          return (
            <g key={p.id}>
              {subjects.map((sub, si) => {
                const val = Math.max(0, p.subjectScores[sub]);
                const h = (val / maxSub) * innerH;
                const x = gx - (barW * 3) / 2 + si * barW;
                const y = pad.t + innerH - h;
                return (
                  <rect
                    key={sub}
                    x={x}
                    y={y}
                    width={barW - 2}
                    height={Math.max(1, h)}
                    rx={2}
                    fill={colors[sub]}
                    opacity={0.9}
                  >
                    <title>{`${p.label} ${sub}: ${val}`}</title>
                  </rect>
                );
              })}
              <text
                x={gx}
                y={H - 28}
                textAnchor="middle"
                fontSize="10"
                fontWeight={600}
                fill="#334155"
              >
                {p.year}
              </text>
              <text x={gx} y={H - 14} textAnchor="middle" fontSize="9" fill="#64748b">
                {p.score}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-3 border-t border-slate-100 px-3 py-2 text-xs">
        {subjects.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[s] }} />
            {s}
          </li>
        ))}
        <li className="text-slate-500">Last {papers.length} paper attempts</li>
      </ul>
    </div>
  );
}

export function DashboardCharts({ points }: { points: DashAttemptPoint[] }) {
  if (!points.length) {
    return (
      <div className="desk-card desk-card--pad">
        <h2 className="desk-section-title">Your performance</h2>
        <p className="desk-kicker">
          Submit a year paper or topic mock — stock-style score trend, wrong /
          skipped counts, and subject bars show up here.
        </p>
      </div>
    );
  }

  const totals = points.reduce(
    (acc, p) => {
      acc.wrong += p.wrong;
      acc.unattempted += p.unattempted;
      acc.correct += p.correct;
      acc.scoreSum += p.score;
      return acc;
    },
    { wrong: 0, unattempted: 0, correct: 0, scoreSum: 0 },
  );
  const avg = Math.round(totals.scoreSum / points.length);
  const best = points.reduce((a, b) => (a.score >= b.score ? a : b));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Attempts", String(points.length), "desk-sticky-chip--mint"],
          ["Avg score", `${avg}`, "desk-sticky-chip--butter"],
          ["Wrong picks", String(totals.wrong), "desk-sticky-chip--pink"],
          ["Unattempted", String(totals.unattempted), "desk-sticky-chip--mint"],
        ].map(([label, value, chip]) => (
          <div key={label} className="desk-card desk-card--pad flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-800">{value}</div>
            </div>
            <span className={`desk-sticky-chip ${chip}`}>{label === "Avg score" ? "/720" : "Σ"}</span>
          </div>
        ))}
      </div>

      <div className="desk-card desk-card--pad">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="desk-section-title">Score over time</h2>
            <p className="desk-kicker">
              Marks obtained vs attempt time · best {best.score}/{best.totalMarks} (
              {best.label})
            </p>
          </div>
        </div>
        <PerformanceLineChart points={points} />
      </div>

      <div className="desk-card desk-card--pad">
        <div className="mb-3">
          <h2 className="desk-section-title">Subject scores — last attempts</h2>
          <p className="desk-kicker">
            Estimated subject marks (+4/−1) for your last 5–10 year papers.
          </p>
        </div>
        <SubjectBarChart points={points} />
      </div>

      <div className="desk-card desk-card--pad overflow-x-auto">
        <h2 className="desk-section-title">All submitted tests</h2>
        <p className="desk-kicker mb-3">Wrong + unattempted counts with each attempt.</p>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">When (IST)</th>
              <th className="px-2 py-2">Test</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Wrong</th>
              <th className="px-2 py-2">Unattempted</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                  {formatWhen(p.at)}
                </td>
                <td className="px-2 py-2 font-medium">{p.label}</td>
                <td className="px-2 py-2 font-semibold">
                  {p.score}
                  <span className="font-normal text-slate-500">/{p.totalMarks}</span>
                </td>
                <td className="px-2 py-2 text-rose-700">{p.wrong}</td>
                <td className="px-2 py-2 text-slate-600">{p.unattempted}</td>
                <td className="px-2 py-2">
                  <a
                    href={
                      p.kind === "paper"
                        ? `/results/${p.id}`
                        : `/topic-series/results/${p.id}`
                    }
                    className="cbt-btn cbt-btn-sm cbt-btn-secondary"
                  >
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
