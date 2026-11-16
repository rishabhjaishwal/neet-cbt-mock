"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  figureSrc?: string | null;
  figureKind?: string | null;
  missingLabel: string;
  schematicLabel: string;
};

function resolveFigureUrl(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return src;
  }
  // Prefer static public path; also expose API alias for Vercel edge cases
  if (src.startsWith("/figures/")) {
    return src;
  }
  if (src.startsWith("figures/")) return `/${src}`;
  return src.startsWith("/") ? src : `/figures/${src}`;
}

export function QuestionFigure({
  figureSrc,
  figureKind,
  missingLabel,
  schematicLabel,
}: Props) {
  const [failed, setFailed] = useState(false);
  const primary = useMemo(
    () => (figureSrc ? resolveFigureUrl(figureSrc) : null),
    [figureSrc],
  );
  const apiFallback = useMemo(() => {
    if (!figureSrc) return null;
    const name = figureSrc.split("/").pop();
    return name ? `/api/figures/${encodeURIComponent(name)}` : null;
  }, [figureSrc]);
  const [src, setSrc] = useState<string | null>(primary);

  useEffect(() => {
    setFailed(false);
    setSrc(primary);
  }, [primary]);

  if (!figureSrc || failed || !src) {
    return (
      <div className="q-figure q-figure-missing mb-4 rounded-md border border-dashed border-amber-400 bg-amber-50 px-4 py-6 text-center text-sm text-amber-950">
        {missingLabel}
      </div>
    );
  }

  const caption =
    figureKind === "missing-placeholder"
      ? missingLabel
      : figureKind === "schematic"
        ? schematicLabel
        : null;

  return (
    <figure className="q-figure mb-5 overflow-hidden rounded-md border border-slate-200 bg-[#f8fafc]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Question figure"
        className="mx-auto max-h-[360px] w-auto max-w-full object-contain p-3"
        loading="eager"
        decoding="async"
        onError={() => {
          if (apiFallback && src !== apiFallback) {
            setSrc(apiFallback);
            return;
          }
          setFailed(true);
        }}
      />
      {caption && (
        <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
