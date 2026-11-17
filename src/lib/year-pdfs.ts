/**
 * Year booklet PDFs are **not** hosted on this app / Vercel.
 * Stable public CDN URLs → exam "View paper" iframe only.
 *
 * Primary mirror: cdn.statically.io → Shabber10/ALL-PYQ-Papers
 * (jsDelivr blocks some of the same paths with 403).
 */

export type YearPdfRef = {
  year: number;
  /** Direct PDF URL (CORS-friendly CDN). */
  url: string;
  /** Human label for code / mirror. */
  label: string;
  source: string;
};

const CDN = "https://cdn.statically.io/gh/Shabber10/ALL-PYQ-Papers/main";

const YEAR_PDFS: Record<number, YearPdfRef> = {
  2016: {
    year: 2016,
    label: "Phase1",
    source: CDN,
    url: `${CDN}/NEET/2016/Phase1/NEET-2016-Phase1-question.pdf`,
  },
  2017: {
    year: 2017,
    label: "A",
    source: CDN,
    url: `${CDN}/NEET/2017/A/NEET-2017-A-question.pdf`,
  },
  2018: {
    year: 2018,
    label: "main",
    source: CDN,
    url: `${CDN}/NEET/2018/main/NEET-2018-main-question.pdf`,
  },
  2019: {
    year: 2019,
    label: "G1",
    source: CDN,
    url: `${CDN}/NEET/2019/G1/NEET-2019-G1-question.pdf`,
  },
  2020: {
    year: 2020,
    label: "E1",
    source: CDN,
    url: `${CDN}/NEET/2020/E1/NEET-2020-E1-question.pdf`,
  },
  2021: {
    year: 2021,
    label: "M1",
    source: CDN,
    url: `${CDN}/NEET/2021/M1/NEET-2021-M1-question.pdf`,
  },
  2022: {
    year: 2022,
    label: "main",
    source: CDN,
    url: `${CDN}/NEET/2022/main/NEET-2022-main-question.pdf`,
  },
  2023: {
    year: 2023,
    label: "F1",
    source: CDN,
    url: `${CDN}/NEET/2023/F1/NEET-2023-F1-question.pdf`,
  },
  2024: {
    year: 2024,
    label: "R1",
    source: CDN,
    url: `${CDN}/NEET/2024/R1/NEET-2024-R1-question.pdf`,
  },
  2025: {
    year: 2025,
    label: "46",
    source: CDN,
    url: `${CDN}/NEET/2025/46/NEET-2025-46-question.pdf`,
  },
};

/** Direct public PDF URL for a year (not served from this host). */
export function yearPaperPdfUrl(year: number): string | null {
  return YEAR_PDFS[year]?.url ?? null;
}

export function yearPaperPdfRef(year: number): YearPdfRef | null {
  return YEAR_PDFS[year] ?? null;
}

/**
 * Iframe src for View paper — Mozilla PDF.js with CDN `file=` (CORS OK on statically.io).
 */
export function yearPaperPdfEmbedUrl(year: number): string | null {
  const url = yearPaperPdfUrl(year);
  if (!url) return null;
  return `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}`;
}

export function listYearPaperPdfs(): YearPdfRef[] {
  return Object.values(YEAR_PDFS).sort((a, b) => a.year - b.year);
}
