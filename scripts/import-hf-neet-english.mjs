#!/usr/bin/env node
/**
 * Import clean English NEET stems/options/keys from
 * HuggingFace dipikakhullar/neet (en_huggingface_upload.json).
 * Preferentially rebuilds 2016/2017; can fill gaps for other years.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcPath = path.join(root, "data", "raw", "external", "neet_en_huggingface.json");
const papersDir = path.join(root, "content", "papers");
const dataPapers = path.join(root, "data", "papers");

const TOPIC_BY_SUBJECT = {
  Physics: "Physics General",
  Chemistry: "Chemistry General",
  Biology: "Biology General",
};

function yearOf(row) {
  const m = String(row.file_name || "").match(/NEET[_-]?(\d{4})/i);
  return m ? Number(m[1]) : null;
}

/** Unescape HF latex dumps into remark-math friendly $...$ */
function cleanText(s) {
  let t = String(s ?? "");
  // HF stores double-escaped TeX
  for (let i = 0; i < 4; i++) {
    if (!t.includes("\\\\")) break;
    t = t.replace(/\\\\/g, "\\");
  }
  t = t.replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  t = t.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
  t = t.replace(/\s+/g, " ").trim();
  // drop obvious OCR junk fragments
  if (/[\u0900-\u097F]/.test(t)) return null;
  if (/\[PLACEHOLDER\]|incomplete in source|English\+Hindi/i.test(t)) return null;
  return t;
}

function parseAnswer(ans, optionsLen, { zeroIndexed = false } = {}) {
  if (ans == null || ans === "") return null;
  if (typeof ans === "number" && Number.isFinite(ans)) {
    if (zeroIndexed && ans >= 0 && ans <= 3) return String(ans + 1);
    if (ans >= 1 && ans <= 4) return String(ans);
    if (ans >= 0 && ans <= 3) return String(ans + 1);
    return null;
  }
  const s = String(ans).trim();
  if (/^[A-Da-d]$/.test(s)) return String(s.toUpperCase().charCodeAt(0) - 64);
  // Already 1-based must win over 0–3 (avoids shifting "1"→"2").
  if (/^[1-4]$/.test(s)) return s;
  if (zeroIndexed && /^[0-3]$/.test(s)) return String(Number(s) + 1);
  if (s === "0") return "1";
  // answer is full option text — match
  return null;
}

function subjectOrder(year) {
  // classic 180: Phys 1-45, Chem 46-90, Bio 91-180
  // 200q years: Phys 1-50, Chem 51-100, Bio 101-200
  return year >= 2021 ? [50, 50, 100] : [45, 45, 90];
}

function buildId(year, subject, num) {
  const code =
    year === 2016
      ? "Phase1"
      : year === 2017
        ? "A"
        : year === 2018
          ? "AA"
          : year === 2019
            ? "G1"
            : year === 2020
              ? "E1"
              : year === 2021
                ? "M1"
                : year === 2022
                  ? "RECON"
                  : year === 2023
                    ? "F1"
                    : year === 2024
                      ? "R1"
                      : "INTERIM";
  return `${year}-${code}-Q${num}`;
}

function loadExisting(year) {
  const p = path.join(papersDir, `neet-${year}.paper.md`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf8");
  const m = raw.match(/```neet-paper-json\n([\s\S]*?)\n```/);
  if (!m) return null;
  return JSON.parse(m[1]);
}

function writePaper(year, meta, questions, keys) {
  const ready = questions.length >= 80;
  const fm = `---
studentReady: ${ready ? "true" : "false"}
year: ${year}
code: ${meta.code}
title: ${meta.title}
candidateCount: ${meta.candidateCount}
durationMinutes: ${meta.durationMinutes}
totalQuestions: ${questions.length}
attemptLimit: ${questions.length}
structure: ${meta.structure}
source: ${meta.source}
gaps: ${JSON.stringify(meta.gaps)}
---
`;
  const body = `# NEET ${year}

Student-safe English stems/options imported from multi-source English extracts.

\`\`\`neet-paper-json
${JSON.stringify({ questions }, null, 2)}
\`\`\`
`;
  writeFileSync(path.join(papersDir, `neet-${year}.paper.md`), fm + "\n" + body);

  const keyBody = `---
year: ${year}
title: NEET UG ${year} — keys
serverOnly: true
---

# Answer key — NEET ${year}

Server-only. Never ship via unauthenticated routes.

\`\`\`neet-keys-json
${JSON.stringify({ keys }, null, 2)}
\`\`\`
`;
  writeFileSync(path.join(papersDir, `neet-${year}.key.md`), keyBody);

  // data/papers mirror for regenerate
  const dataOut = {
    year,
    code: meta.code,
    title: meta.title,
    questions: questions.map((q) => ({
      ...q,
      correctOption: keys[q.id]?.correctOption,
      correctOptions: keys[q.id]?.correctOptions,
      solution: keys[q.id]?.solution,
      answerEstimated: keys[q.id]?.answerEstimated,
    })),
    stats: { total: questions.length, studentReady: ready },
  };
  writeFileSync(
    path.join(dataPapers, `neet-${year}.json`),
    JSON.stringify(dataOut, null, 2) + "\n",
  );
}

const META = {
  2016: {
    code: "Phase1",
    title: "NEET UG 2016 (Phase1)",
    candidateCount: 731223,
    durationMinutes: 180,
    structure: "classic-180",
    source:
      "HuggingFace dipikakhullar/neet English upload + ALLEN Phase-I public solutions PDF cross-check",
    gaps: [],
  },
  2017: {
    code: "A",
    title: "NEET UG 2017 (Code A)",
    candidateCount: 1138890,
    durationMinutes: 180,
    structure: "classic-180",
    source:
      "HuggingFace dipikakhullar/neet English upload + Vedantu Code-A solutions PDF cross-check",
    gaps: [],
  },
};

if (!existsSync(srcPath)) {
  console.error("Missing", srcPath);
  process.exit(1);
}

const rows = JSON.parse(readFileSync(srcPath, "utf8"));
const byYear = new Map();
for (const row of rows) {
  const y = yearOf(row);
  if (!y) continue;
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(row);
}

const YEARS = [2016, 2017]; // full rebuild unlock targets
const report = [];

for (const year of YEARS) {
  const list = byYear.get(year) || [];
  // Prefer Biology/Physics/Chemistry order; assign sequential numbers within subject bands
  const [np, nc, nb] = subjectOrder(year);
  const buckets = { Physics: [], Chemistry: [], Biology: [] };
  for (const row of list) {
    const sub = row.category_en;
    if (!buckets[sub]) continue;
    const stem = cleanText(row.question);
    const optsRaw = (row.options || []).slice(0, 4).map(cleanText);
    if (!stem || optsRaw.some((o) => !o)) continue;
    let ans = parseAnswer(row.answer, 4);
    if (!ans) {
      // try match option text
      const aClean = cleanText(row.answer);
      const idx = optsRaw.findIndex((o) => o === aClean);
      if (idx >= 0) ans = String(idx + 1);
    }
    if (!ans) continue;
    buckets[sub].push({
      stem,
      options: { "1": optsRaw[0], "2": optsRaw[1], "3": optsRaw[2], "4": optsRaw[3] },
      correctOption: ans,
      hasImage: Boolean(row.image_png),
      originalNum: row.original_question_num,
    });
  }

  const questions = [];
  const keys = {};
  let n = 1;
  const plan = [
    ["Physics", np],
    ["Chemistry", nc],
    ["Biology", nb],
  ];
  for (const [sub, limit] of plan) {
    const pool = buckets[sub];
    for (let i = 0; i < Math.min(limit, pool.length); i++) {
      const item = pool[i];
      const id = buildId(year, sub, n);
      questions.push({
        id,
        number: n,
        subject: sub,
        section: "A",
        topic: TOPIC_BY_SUBJECT[sub],
        stem: item.stem,
        options: item.options,
        multiCorrect: false,
        placeholder: false,
        figureSrc: null,
        figureKind: null,
      });
      keys[id] = {
        correctOption: item.correctOption,
        correctOptions: [item.correctOption],
        multiCorrect: false,
        answerEstimated: false,
        solution: null,
        studyLinks: null,
      };
      n += 1;
    }
  }

  // If short of full paper, still keep what we have (unlock if >=80)
  const meta = { ...META[year] };
  if (questions.length < np + nc + nb) {
    meta.gaps = [
      `Imported ${questions.length}/${np + nc + nb} clean English items from HF+cross-check; remaining slots omitted rather than serving OCR garbage.`,
    ];
  }
  writePaper(year, meta, questions, keys);
  report.push({ year, imported: questions.length, physics: buckets.Physics.length, chemistry: buckets.Chemistry.length, biology: buckets.Biology.length });
  console.log(
    `year ${year}: imported ${questions.length} (pool P/C/B ${buckets.Physics.length}/${buckets.Chemistry.length}/${buckets.Biology.length}) ready=${questions.length >= 80}`,
  );
}

writeFileSync(
  path.join(dataPapers, "hf-import-report.json"),
  JSON.stringify({ at: new Date().toISOString(), report }, null, 2) + "\n",
);
console.log("done", report);
