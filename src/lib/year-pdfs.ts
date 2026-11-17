import { existsSync } from "node:fs";
import path from "node:path";

/** Public URL for a year booklet PDF (attached under `public/papers/`). */
export function yearPaperPdfUrl(year: number): string | null {
  const file = `neet-${year}.pdf`;
  const abs = path.join(process.cwd(), "public", "papers", file);
  if (!existsSync(abs)) return null;
  return `/papers/${file}`;
}

export function yearPaperPdfPath(year: number): string | null {
  const file = `neet-${year}.pdf`;
  const abs = path.join(process.cwd(), "public", "papers", file);
  return existsSync(abs) ? abs : null;
}
