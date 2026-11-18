#!/usr/bin/env node
/**
 * Purge weak “CURATED SOLUTION” templates across NEET AI, year keys, and topic banks.
 * Also applies high-confidence key fixes (≥2 independent sources / NCERT knowledge).
 *
 * Usage:
 *   node scripts/purge-generic-solutions.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRealSolution,
  buildStudyLinks,
  isWeakSolution,
  clip,
} from "./lib/real-solution.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function walkQuestions(obj, out = []) {
  if (Array.isArray(obj)) {
    for (const x of obj) walkQuestions(x, out);
    return out;
  }
  if (obj && typeof obj === "object") {
    if (obj.stem && obj.options) out.push(obj);
    for (const v of Object.values(obj)) walkQuestions(v, out);
  }
  return out;
}

function extractFence(raw, lang) {
  const m = raw.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)\\n```"));
  return m ? m[1] : null;
}

function writeFence(raw, lang, jsonObj) {
  const body = JSON.stringify(jsonObj, null, 2);
  return raw.replace(
    new RegExp("```" + lang + "\\n[\\s\\S]*?\\n```"),
    "```" + lang + "\n" + body + "\n```",
  );
}

function normOpt(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/[^a-z0-9+−–—×x.^°μµ]/gi, "")
    .replace(/[−–—]/g, "-")
    .replace(/×|x/gi, "x")
    .replace(/µ|μ/g, "u");
}

/**
 * High-confidence key overrides by stem fingerprint + verified option TEXT.
 * Each entry needs ≥2 sources documented in comment / sources array.
 */
const KEY_OVERRIDES = [
  {
    // NEET 2021 PYQ — mole concept; topic-bank + web/NCERT STP
    id: "catch-43013efae5",
    stemIncludes: "number of molecules in 2.24 L",
    correctText: "6.022",
    correctMustMatch: /6\.022.*10.*22|10²²|10\^?22|10²2/i,
    correctOption: "2",
    sources: ["neet-2021-pyq", "ncert-stp-22.4", "topic-bank"],
  },
  {
    // NCERT excretory map — topic-bank + NCERT + coaching notes
    id: "sweatbio-81197ed3b1",
    stemIncludes: "correctly matched with its excretory organs",
    correctText: "Frog",
    correctMustMatch: /Frog.*Kidney/i,
    correctOption: "3",
    sources: ["ncert-excretory-map", "topic-bank", "coaching-notes"],
  },
];

/** Science fixes when option text is clearly wrong (≥2 NCERT facts). */
const SCIENCE_OPTION_FIXES = [
  {
    test: (q) =>
      /functional unit of kidney/i.test(q.stem) &&
      /Nephron/i.test(JSON.stringify(q.options)),
    wantText: /Nephron/i,
    sources: ["ncert-excretory", "authored-ncert"],
  },
  {
    test: (q) =>
      /Mitochondria are the sites of/i.test(q.stem) &&
      /Cellular respiration/i.test(JSON.stringify(q.options)),
    wantText: /Cellular respiration/i,
    sources: ["ncert-cell", "authored-ncert"],
  },
  {
    test: (q) =>
      /Casparian strip is present in/i.test(q.stem) &&
      /Endodermis/i.test(JSON.stringify(q.options)),
    wantText: /Endodermis/i,
    sources: ["ncert-transport", "authored-ncert"],
  },
  {
    test: (q) =>
      /Bt cotton carries toxin genes from/i.test(q.stem) &&
      /Bacillus thuringiensis/i.test(JSON.stringify(q.options)),
    wantText: /Bacillus thuringiensis/i,
    sources: ["ncert-biotech", "authored-ncert"],
  },
  {
    test: (q) =>
      /Primary producers in an ecosystem are/i.test(q.stem) &&
      /Autotrophs/i.test(JSON.stringify(q.options)),
    wantText: /Autotrophs/i,
    sources: ["ncert-ecology", "authored-ncert"],
  },
  {
    test: (q) =>
      /correctly matched with its excretory organs/i.test(q.stem) &&
      /Frog/i.test(JSON.stringify(q.options)) &&
      /Kidney/i.test(JSON.stringify(q.options)),
    wantText: /Frog.*Kidney/i,
    sources: ["ncert-excretory-map", "coaching-notes"],
  },
  {
    test: (q) =>
      /number of molecules in 2\.24 L/i.test(q.stem) &&
      /6\.022/.test(JSON.stringify(q.options)),
    wantText: /6\.022.*(?:10²²|10\^?22|10²2|10\u00b2\u00b2)/i,
    sources: ["neet-2021", "ncert-stp"],
  },
  {
    test: (q) =>
      /DNA fragments are/i.test(q.stem) &&
      /Negatively charged/i.test(JSON.stringify(q.options)),
    wantText: /Negatively charged/i,
    sources: ["ncert-biotech", "gel-electrophoresis"],
  },
  {
    test: (q) =>
      /venturi-meter works on/i.test(q.stem) &&
      /Bernoulli/i.test(JSON.stringify(q.options)),
    wantText: /Bernoulli/i,
    sources: ["ncert-fluids", "year-key"],
  },
  {
    test: (q) =>
      /Pacemaker of the heart is/i.test(q.stem) &&
      /SA node/i.test(JSON.stringify(q.options)),
    wantText: /SA node/i,
    sources: ["ncert-physiology", "authored-ncert"],
  },
  {
    test: (q) =>
      /Insulin is secreted by/i.test(q.stem) &&
      /β-cells|beta-cells|β cells/i.test(JSON.stringify(q.options)),
    wantText: /β-cells|beta/i,
    sources: ["ncert-physiology", "authored-ncert"],
  },
  {
    test: (q) =>
      /Okazaki fragments are joined by/i.test(q.stem) &&
      /DNA ligase/i.test(JSON.stringify(q.options)),
    wantText: /DNA ligase/i,
    sources: ["ncert-molecular", "authored-ncert"],
  },
  {
    test: (q) =>
      /Ribosomes are the site of/i.test(q.stem) &&
      /Translation/i.test(JSON.stringify(q.options)),
    wantText: /Translation/i,
    sources: ["ncert-cell", "authored-ncert"],
  },
  {
    test: (q) =>
      /DNA replication is/i.test(q.stem) &&
      /Semi-conservative/i.test(JSON.stringify(q.options)),
    wantText: /Semi-conservative/i,
    sources: ["ncert-molecular", "authored-ncert"],
  },
  {
    test: (q) =>
      /Pyramid of energy is always/i.test(q.stem) &&
      /Upright/i.test(JSON.stringify(q.options)),
    wantText: /Upright/i,
    sources: ["ncert-ecology", "authored-ncert"],
  },
  {
    test: (q) =>
      /Analogous organs indicate/i.test(q.stem) &&
      /Convergent evolution/i.test(JSON.stringify(q.options)),
    wantText: /Convergent evolution/i,
    sources: ["ncert-evolution", "authored-ncert"],
  },
  {
    test: (q) =>
      /Kranz anatomy is associated with/i.test(q.stem) &&
      /C4 plants/i.test(JSON.stringify(q.options)),
    wantText: /C4 plants/i,
    sources: ["ncert-photosynthesis", "authored-ncert"],
  },
  {
    test: (q) =>
      /C4 plants minimize/i.test(q.stem) &&
      /Photorespiration/i.test(JSON.stringify(q.options)),
    wantText: /Photorespiration/i,
    sources: ["ncert-photosynthesis", "authored-ncert"],
  },
  {
    test: (q) =>
      /Glomerular filtrate is formed in/i.test(q.stem) &&
      /Bowman/i.test(JSON.stringify(q.options)),
    wantText: /Bowman/i,
    sources: ["ncert-excretory", "authored-ncert"],
  },
  {
    test: (q) =>
      /Crossing over occurs during/i.test(q.stem) &&
      /Pachytene/i.test(JSON.stringify(q.options)),
    wantText: /Pachytene/i,
    sources: ["ncert-cell-cycle", "authored-ncert"],
  },
  {
    test: (q) =>
      /Lysosomes are rich in/i.test(q.stem) &&
      /Hydrolytic/i.test(JSON.stringify(q.options)),
    wantText: /Hydrolytic/i,
    sources: ["ncert-cell", "authored-ncert"],
  },
  {
    test: (q) =>
      /Golgi apparatus is mainly involved in/i.test(q.stem) &&
      /Packaging/i.test(JSON.stringify(q.options)),
    wantText: /Packaging/i,
    sources: ["ncert-cell", "authored-ncert"],
  },
  {
    test: (q) =>
      /Hardy–Weinberg assumes|Hardy-Weinberg assumes/i.test(q.stem) &&
      /Infinite population/i.test(JSON.stringify(q.options)),
    wantText: /Infinite population/i,
    sources: ["ncert-evolution", "authored-ncert"],
  },
  {
    test: (q) =>
      /Nitrogen-fixing symbiotic bacterium with legumes/i.test(q.stem) &&
      /Rhizobium/i.test(JSON.stringify(q.options)),
    wantText: /Rhizobium/i,
    sources: ["ncert-mineral", "authored-ncert"],
  },
];

function findOptionByText(options, re) {
  for (const c of ["1", "2", "3", "4"]) {
    if (re.test(String(options?.[c] || ""))) return c;
  }
  return null;
}

function applyKeyFixes(q, audit) {
  let changed = false;
  for (const fix of SCIENCE_OPTION_FIXES) {
    if (!fix.test(q)) continue;
    const want = findOptionByText(q.options, fix.wantText);
    if (!want) continue;
    if (String(q.correctOption) === want) {
      // bump confidence metadata when present
      if (Array.isArray(q.keySources)) {
        const merged = [...new Set([...(q.keySources || []), ...fix.sources])];
        if (merged.length !== (q.keySources || []).length) {
          q.keySources = merged;
          q.keyConfidence = Math.max(Number(q.keyConfidence || 0), merged.length);
          changed = true;
        }
      }
      continue;
    }
    const from = String(q.correctOption);
    q.correctOption = want;
    q.correctOptions = [want];
    q.keySources = [...new Set([...(q.keySources || []), ...fix.sources])];
    q.keyConfidence = Math.max(Number(q.keyConfidence || 0), q.keySources.length);
    q.aiVerified = q.keySources.length >= 2 ? "strict" : q.aiVerified;
    audit.keyFixes.push({
      id: q.id,
      stem: clip(q.stem, 120),
      from,
      to: want,
      toText: q.options[want],
      sources: fix.sources,
    });
    changed = true;
  }

  for (const ov of KEY_OVERRIDES) {
    if (ov.id && q.id && q.id !== ov.id && !String(q.stem).includes(ov.stemIncludes)) continue;
    if (!String(q.stem).toLowerCase().includes(ov.stemIncludes.toLowerCase())) continue;
    const want =
      findOptionByText(q.options, ov.correctMustMatch) ||
      (ov.correctOption && q.options?.[ov.correctOption] ? ov.correctOption : null);
    if (!want) continue;
    if (String(q.correctOption) !== want) {
      audit.keyFixes.push({
        id: q.id,
        stem: clip(q.stem, 120),
        from: String(q.correctOption),
        to: want,
        toText: q.options[want],
        sources: ov.sources,
      });
      q.correctOption = want;
      q.correctOptions = [want];
      changed = true;
    }
    q.keySources = [...new Set([...(q.keySources || []), ...ov.sources])];
    q.keyConfidence = Math.max(Number(q.keyConfidence || 0), q.keySources.length);
  }
  return changed;
}

function rewriteQuestion(q, audit, bucket) {
  const keyChanged = applyKeyFixes(q, audit);
  const weak = isWeakSolution(q.solution);
  // Always rewrite weak; also rewrite if key changed (solution must track key)
  if (!weak && !keyChanged) {
    // Still check solution marks wrong option
    const sol = String(q.solution || "");
    const code = String(q.correctOption);
    if (sol && code && /✓\s*\(/.test(sol) && !new RegExp(`✓\\s*\\(${code}\\)`).test(sol)) {
      // mismatch — force rewrite
    } else {
      audit.skipped.push({ id: q.id, bucket, reason: "already-strong" });
      return false;
    }
  }
  const before = q.solution;
  q.solution = buildRealSolution(q);
  if (!Array.isArray(q.studyLinks) || q.studyLinks.length < 2) {
    q.studyLinks = buildStudyLinks(q);
  }
  audit.solRewrites.push({
    id: q.id,
    bucket,
    stem: clip(q.stem, 100),
    correctOption: q.correctOption,
    weakBefore: weak,
    keyChanged,
    preview: clip(q.solution, 180),
  });
  if (isWeakSolution(q.solution)) {
    audit.stillWeak.push({ id: q.id, bucket, stem: clip(q.stem, 100) });
  }
  return before !== q.solution || keyChanged;
}

function processNeetAi(audit) {
  const dir = path.join(root, "data/neet-ai/banks");
  let n = 0;
  for (const file of ["easy.json", "medium.json", "hard.json"]) {
    const p = path.join(dir, file);
    const doc = JSON.parse(readFileSync(p, "utf8"));
    const qs = doc.questions || [];
    let changed = 0;
    for (const q of qs) {
      if (rewriteQuestion(q, audit, `neet-ai:${file}`)) changed++;
    }
    if (!dryRun && changed) writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
    n += changed;
    audit.files.push({ file: `data/neet-ai/banks/${file}`, rewrites: changed, total: qs.length });
  }
  return n;
}

function processTopicSeries(audit) {
  const dir = path.join(root, "data/topic-series/banks");
  let n = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const p = path.join(dir, file);
    const doc = JSON.parse(readFileSync(p, "utf8"));
    const qs = walkQuestions(doc);
    let changed = 0;
    for (const q of qs) {
      if (!q.solution && !isWeakSolution(q.solution)) {
        // many topic Qs have no solution — only rewrite when present OR when key fix applies
        const beforeKey = q.correctOption;
        applyKeyFixes(q, audit);
        if (q.correctOption !== beforeKey) {
          q.solution = buildRealSolution(q);
          changed++;
          audit.solRewrites.push({
            id: q.id,
            bucket: `topic:${file}`,
            stem: clip(q.stem, 100),
            correctOption: q.correctOption,
            weakBefore: true,
            keyChanged: true,
          });
        }
        continue;
      }
      if (q.solution && rewriteQuestion(q, audit, `topic:${file}`)) changed++;
    }
    if (!dryRun && changed) writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
    n += changed;
    if (changed) audit.files.push({ file: `data/topic-series/banks/${file}`, rewrites: changed, total: qs.length });
  }
  return n;
}

function processYearKeys(audit) {
  const papersDir = path.join(root, "content/papers");
  let n = 0;
  for (const file of readdirSync(papersDir).filter((f) => f.endsWith(".paper.md"))) {
    const year = file.match(/neet-(\d{4})/)?.[1];
    if (!year) continue;
    const paperPath = path.join(papersDir, file);
    const keyPath = path.join(papersDir, `neet-${year}.key.md`);
    if (!existsSync(keyPath)) continue;
    const paperRaw = readFileSync(paperPath, "utf8");
    const keyRaw = readFileSync(keyPath, "utf8");
    const paperFence = extractFence(paperRaw, "neet-paper-json");
    const keyFence = extractFence(keyRaw, "neet-keys-json");
    if (!paperFence || !keyFence) continue;
    const paper = JSON.parse(paperFence);
    const keyDoc = JSON.parse(keyFence);
    const byId = Object.fromEntries((paper.questions || []).map((q) => [q.id, q]));
    let changed = 0;
    for (const [id, key] of Object.entries(keyDoc.keys || {})) {
      const q = byId[id];
      if (!q) continue;
      const merged = {
        id,
        stem: q.stem,
        options: q.options,
        subject: q.subject,
        topic: q.topic || key.topic,
        correctOption: key.correctOption,
        correctOptions: key.correctOptions,
        answerEstimated: key.answerEstimated,
        solution: key.solution,
        conceptHint: key.conceptHint,
        keySources: key.keySources,
        keyConfidence: key.keyConfidence,
      };
      const beforeSol = key.solution;
      const beforeKey = String(key.correctOption);
      const did = rewriteQuestion(merged, audit, `year:${year}`);
      if (!did) continue;
      key.solution = merged.solution;
      key.correctOption = merged.correctOption;
      key.correctOptions = merged.correctOptions || [merged.correctOption];
      if (merged.studyLinks) key.studyLinks = merged.studyLinks;
      if (!key.studyLinks || key.studyLinks.length < 2) key.studyLinks = buildStudyLinks(merged);
      if (beforeSol !== key.solution || beforeKey !== String(key.correctOption)) changed++;
    }
    if (!dryRun && changed) writeFileSync(keyPath, writeFence(keyRaw, "neet-keys-json", keyDoc));
    n += changed;
    audit.files.push({ file: `content/papers/neet-${year}.key.md`, rewrites: changed });
  }
  return n;
}

function main() {
  const audit = {
    dryRun,
    at: new Date().toISOString(),
    files: [],
    solRewrites: [],
    keyFixes: [],
    stillWeak: [],
    skipped: [],
  };

  const a = processNeetAi(audit);
  const b = processTopicSeries(audit);
  const c = processYearKeys(audit);

  const summary = {
    dryRun,
    neetAiRewrites: a,
    topicRewrites: b,
    yearRewrites: c,
    totalRewrites: a + b + c,
    keyFixes: audit.keyFixes.length,
    stillWeak: audit.stillWeak.length,
    sampleRewrites: audit.solRewrites.slice(0, 8),
    keyFixSample: audit.keyFixes.slice(0, 20),
    stillWeakSample: audit.stillWeak.slice(0, 10),
    files: audit.files,
  };

  const outDir = path.join(root, "data/neet-ai/audits");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "solution-template-purge.json");
  if (!dryRun) {
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          ...summary,
          allKeyFixes: audit.keyFixes,
          stillWeakIds: audit.stillWeak,
          rewriteCount: audit.solRewrites.length,
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(JSON.stringify(summary, null, 2));
}

main();
