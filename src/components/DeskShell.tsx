import type { ReactNode } from "react";

/** Notebook desk chrome for every student page except timed exam CBT. */
export function DeskShell({
  children,
  innerClassName = "",
}: {
  children: ReactNode;
  innerClassName?: string;
}) {
  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className={`desk-shell__inner ${innerClassName}`.trim()}>{children}</div>
    </div>
  );
}
