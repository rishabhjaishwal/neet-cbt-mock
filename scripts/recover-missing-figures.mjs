#!/usr/bin/env node
/**
 * Multi-source recovery for figureKind=missing-placeholder:
 * 1) Crop from year PDF page (pdftoppm) when stem keywords match
 * 2) Fall back to curated SVG schematics for known thermodynamics diagrams
 *
 * Updates content/papers/*.paper.md + data/papers/*.json figureSrc/figureKind.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas } = (() => {
  try {
    return require("@napi-rs/canvas");
  } catch {
    return { createCanvas: null };
  }
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const papersDir = path.join(root, "content", "papers");
const pdfDir = path.join(root, "data", "raw", "pdfs");
const figDir = path.join(root, "public", "figures");
const tmp = path.join("/tmp", "neet-fig-recover");
mkdirSync(tmp, { recursive: true });

const PDF_BY_YEAR = {
  2016: "NEET2016_Phase1.pdf",
  2017: "NEET2017_A.pdf",
  2018: "NEET2018.pdf",
  2019: "NEET2019_G1.pdf",
  2020: "NEET2020_E1.pdf",
  2021: "NEET2021_M1.pdf",
  2022: "NEET2022.pdf",
  2023: "NEET2023.pdf",
  2024: "NEET2024.pdf",
  2025: "NEET2025.pdf",
};

function extractFence(raw, lang) {
  const re = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)\\n```");
  const m = raw.match(re);
  return m ? m[1] : null;
}

function writePvIsothermAdiabatSvg(dest) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 320" role="img" aria-label="P-V diagram isothermal AB adiabatic AC">
  <rect width="520" height="320" fill="#ffffff"/>
  <line x1="70" y1="260" x2="470" y2="260" stroke="#0f172a" stroke-width="2"/>
  <line x1="70" y1="260" x2="70" y2="40" stroke="#0f172a" stroke-width="2"/>
  <polygon points="470,260 458,254 458,266" fill="#0f172a"/>
  <polygon points="70,40 64,52 76,52" fill="#0f172a"/>
  <text x="482" y="266" font-family="Georgia, serif" font-size="18" fill="#0f172a">V</text>
  <text x="58" y="34" font-family="Georgia, serif" font-size="18" fill="#0f172a">P</text>
  <path d="M 110 90 C 180 95, 280 130, 390 175" fill="none" stroke="#0f172a" stroke-width="2.5"/>
  <path d="M 110 90 C 160 110, 240 175, 330 230" fill="none" stroke="#0f172a" stroke-width="2.5"/>
  <circle cx="110" cy="90" r="4.5" fill="#0f172a"/>
  <circle cx="390" cy="175" r="4.5" fill="#0f172a"/>
  <circle cx="330" cy="230" r="4.5" fill="#0f172a"/>
  <text x="118" y="78" font-family="Georgia, serif" font-size="15" fill="#0f172a">A (P_A, V_A, T_A)</text>
  <text x="398" y="172" font-family="Georgia, serif" font-size="15" fill="#0f172a">B (P_B, V_B, T_B)</text>
  <text x="338" y="248" font-family="Georgia, serif" font-size="15" fill="#0f172a">C (P_C, V_C, T_C)</text>
  <text x="70" y="292" font-family="Georgia, serif" font-size="14" fill="#334155">AB → Isothermal expansion</text>
  <text x="70" y="312" font-family="Georgia, serif" font-size="14" fill="#334155">AC → Adiabatic expansion</text>
</svg>
`;
  writeFileSync(dest, svg);
}

function findPdfPage(pdfPath, needle) {
  try {
    const text = execSync(`pdftotext -layout "${pdfPath}" -`, {
      encoding: "utf8",
      maxBuffer: 20_000_000,
    });
    const pages = text.split("\f");
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].includes(needle) || pages[i].toLowerCase().includes(needle.toLowerCase())) {
        return i + 1;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function cropFromPdf(pdfPath, page, outPng) {
  const prefix = path.join(tmp, `p${page}`);
  execSync(
    `pdftoppm -png -r 200 -f ${page} -l ${page} "${pdfPath}" "${prefix}"`,
    { stdio: "ignore" },
  );
  const rendered = `${prefix}-${String(page).padStart(1, "0")}.png`;
  const alt = readdirSync(tmp).find((f) => f.startsWith(`p${page}`) && f.endsWith(".png"));
  const src = existsSync(rendered)
    ? rendered
    : alt
      ? path.join(tmp, alt)
      : null;
  if (!src) return false;
  // Keep full page mid band as a usable figure fallback; downstream can refine.
  execSync(
    `python3 - <<'PY'
from PIL import Image, ImageOps
im=Image.open(${JSON.stringify(src)})
w,h=im.size
box=(int(w*0.08), int(h*0.28), int(w*0.92), int(h*0.72))
c=im.crop(box)
c=ImageOps.autocontrast(c, cutoff=1)
c.save(${JSON.stringify(outPng)})
print('ok', c.size)
PY`,
    { stdio: "inherit" },
  );
  return existsSync(outPng);
}

function updatePaperQuestion(year, id, patch) {
  const mdPath = path.join(papersDir, `neet-${year}.paper.md`);
  if (!existsSync(mdPath)) return false;
  const raw = readFileSync(mdPath, "utf8");
  const json = extractFence(raw, "neet-paper-json");
  if (!json) return false;
  const parsed = JSON.parse(json);
  const q = (parsed.questions || []).find((x) => x.id === id);
  if (!q) return false;
  Object.assign(q, patch);
  if (patch.stemClean) {
    q.stem = patch.stemClean;
    delete q.stemClean;
  }
  const next = raw.replace(
    /```neet-paper-json\n[\s\S]*?\n```/,
    "```neet-paper-json\n" + JSON.stringify(parsed, null, 2) + "\n```",
  );
  writeFileSync(mdPath, next);

  const jp = path.join(root, "data", "papers", `neet-${year}.json`);
  if (existsSync(jp)) {
    const data = JSON.parse(readFileSync(jp, "utf8"));
    const jq = (data.questions || []).find((x) => x.id === id);
    if (jq) {
      Object.assign(jq, {
        figureSrc: patch.figureSrc,
        figureKind: patch.figureKind,
        ...(patch.stem ? { stem: patch.stem } : {}),
        ...(patch.options ? { options: patch.options } : {}),
      });
      writeFileSync(jp, JSON.stringify(data, null, 2) + "\n");
    }
  }
  return true;
}

const report = [];

for (const file of readdirSync(papersDir).filter((f) => f.endsWith(".paper.md"))) {
  const year = Number(file.match(/neet-(\d{4})/)?.[1]);
  const raw = readFileSync(path.join(papersDir, file), "utf8");
  const json = extractFence(raw, "neet-paper-json");
  if (!json) continue;
  const qs = JSON.parse(json).questions || [];
  for (const q of qs) {
    if (q.figureKind !== "missing-placeholder") continue;
    const id = q.id;
    const stem = q.stem || "";
    let recovered = false;
    let method = "";

    // Known thermodynamics PV isotherm/adiabat (2019 Q135 and clones)
    if (/isothermal and adiabatic/i.test(stem) && /reversible expansion/i.test(stem)) {
      const svgName = `${id}.svg`;
      const svgPath = path.join(figDir, svgName);
      writePvIsothermAdiabatSvg(svgPath);
      const cleanStem =
        "Reversible expansion of an ideal gas under isothermal and adiabatic conditions are as shown in the figure. AB → Isothermal expansion. AC → Adiabatic expansion. Which of the following options is not correct?";
      updatePaperQuestion(year, id, {
        figureSrc: `/figures/${svgName}`,
        figureKind: "diagram",
        stem: cleanStem,
        options: {
          "1": "ΔS_isothermal > ΔS_adiabatic",
          "2": "T_A = T_B",
          "3": "W_isothermal > W_adiabatic",
          "4": "T_C > T_A",
        },
      });
      recovered = true;
      method = "svg-schematic+stem-clean";
    } else {
      // Speculative mid-page PDF crops proved unreliable (wrong Q / bilingual
      // page dumps). Leave missing-placeholder so the student quality gate
      // hides figure-required items until a verified crop is attached.
      method = "needs-verified-crop";
    }

    report.push({ year, id, recovered, method });
    console.log(
      recovered ? "RECOVERED" : "SKIP",
      year,
      id,
      method || "no-source",
    );
  }
}

writeFileSync(
  path.join(root, "data", "papers", "figure-recovery-report.json"),
  JSON.stringify({ at: new Date().toISOString(), report }, null, 2) + "\n",
);
console.log(
  "done",
  report.filter((r) => r.recovered).length,
  "/",
  report.length,
);
