"use client";

type Props = {
  figureSrc?: string | null;
  figureKind?: string | null;
  missingLabel: string;
  schematicLabel: string;
};

export function QuestionFigure({
  figureSrc,
  figureKind,
  missingLabel,
  schematicLabel,
}: Props) {
  if (!figureSrc) {
    return (
      <div className="q-figure q-figure-missing mb-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
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
        src={figureSrc}
        alt="Question figure"
        className="mx-auto max-h-[320px] w-auto max-w-full object-contain p-3"
      />
      {caption && (
        <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
