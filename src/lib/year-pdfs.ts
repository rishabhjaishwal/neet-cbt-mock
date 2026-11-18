/**
 * Year booklet PDFs are **not** hosted on this app / Vercel.
 * Public GitHub raw URLs → View paper (Google Docs viewer embed + open-in-tab).
 *
 * Exam "View paper" must only open **question** booklets — never answer keys /
 * solutions. Keys and worked solutions live on the results page (markdown review).
 *
 * PDF.js on mozilla.github.io cannot load many CDNs (CORS / timeouts → "0 of 0").
 * Google Docs gview fetches server-side and works inside our iframe.
 */

import { assertQuestionPaperPdfUrl } from "@/lib/exam-secrets";

export type YearPdfRef = {
  year: number;
  /** Direct PDF URL (open in new tab). */
  url: string;
  label: string;
  source: string;
};

const RAW = "https://raw.githubusercontent.com/Shabber10/ALL-PYQ-Papers/main";

const YEAR_PDFS: Record<number, YearPdfRef> = {
  2016: {
    year: 2016,
    label: "Phase1",
    source: RAW,
    url: `${RAW}/NEET/2016/Phase1/NEET-2016-Phase1-question.pdf`,
  },
  2017: {
    year: 2017,
    label: "A",
    source: RAW,
    url: `${RAW}/NEET/2017/A/NEET-2017-A-question.pdf`,
  },
  2018: {
    year: 2018,
    label: "main",
    source: RAW,
    url: `${RAW}/NEET/2018/main/NEET-2018-main-question.pdf`,
  },
  2019: {
    year: 2019,
    label: "G1",
    source: RAW,
    url: `${RAW}/NEET/2019/G1/NEET-2019-G1-question.pdf`,
  },
  2020: {
    year: 2020,
    label: "E1",
    source: RAW,
    url: `${RAW}/NEET/2020/E1/NEET-2020-E1-question.pdf`,
  },
  2021: {
    year: 2021,
    label: "M1",
    source: RAW,
    url: `${RAW}/NEET/2021/M1/NEET-2021-M1-question.pdf`,
  },
  2022: {
    year: 2022,
    label: "main",
    source: RAW,
    url: `${RAW}/NEET/2022/main/NEET-2022-main-question.pdf`,
  },
  2023: {
    year: 2023,
    label: "F1",
    source: RAW,
    url: `${RAW}/NEET/2023/F1/NEET-2023-F1-question.pdf`,
  },
  2024: {
    year: 2024,
    label: "R1",
    source: RAW,
    url: `${RAW}/NEET/2024/R1/NEET-2024-R1-question.pdf`,
  },
  2025: {
    year: 2025,
    label: "46",
    source: RAW,
    url: `${RAW}/NEET/2025/46/NEET-2025-46-question.pdf`,
  },
  2026: {
    year: 2026,
    label: "RE",
    source: "https://brilliantpala.org",
    url: "https://brilliantpala.org/wp-content/uploads/2026/06/RE-NEET-QUESTIONS-COMPRESSED.pdf",
  },
};

/** Direct public **question** PDF URL for a year (not served from this host). */
export function yearPaperPdfUrl(year: number): string | null {
  const url = YEAR_PDFS[year]?.url ?? null;
  if (!url) return null;
  return assertQuestionPaperPdfUrl(url);
}

export function yearPaperPdfRef(year: number): YearPdfRef | null {
  const ref = YEAR_PDFS[year] ?? null;
  if (!ref) return null;
  assertQuestionPaperPdfUrl(ref.url);
  return ref;
}

/** Iframe-friendly viewer URL (Google fetches the PDF; no CORS/X-Frame on raw GitHub). */
export function yearPaperPdfEmbedUrl(year: number): string | null {
  const url = yearPaperPdfUrl(year);
  if (!url) return null;
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
}

export function listYearPaperPdfs(): YearPdfRef[] {
  return Object.values(YEAR_PDFS).sort((a, b) => a.year - b.year);
}
