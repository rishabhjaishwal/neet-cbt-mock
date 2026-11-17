#!/usr/bin/env node
/**
 * Fix OCR-flat Column I/II stems (esp. Glycosuria / excretory match) and
 * remap keys by option TEXT to the verified match iv-i-ii-iii.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const GLYCO_STEM =
  "Match the items given in Column I with those in Column II and select the correct option given below: Column I Column II a. Glycosuria i. Accumulation of uric acid in joints b. Gout ii. Mass of crystallised salts within the kidney c. Renal calculi iii. Inflammation in glomeruli d. Glomerular nephritis iv. Presence of glucose in urine";

const GLYCO_ANSWER_TEXT = "iv i ii iii";

const STEM_FIXES = [
  {
    needle: /Glycosuria[\s\S]*?Glomerular\s+iv\.\s*Presence of glucose in nephritis urine/i,
    stem: GLYCO_STEM,
    answerText: GLYCO_ANSWER_TEXT,
    solution: [
      "**Identify.** Match Column I disorders with Column II descriptions.",
      "**Concept.** NCERT Class XI *Excretory Products and their Elimination*: glycosuria = glucose in urine; gout = uric acid in joints; renal calculi = crystallised salts in kidney; glomerular nephritis = inflammation of glomeruli.",
      "**Work.** Map each left item to its defining description, then read the a–b–c–d code.",
      "**Lock.** Correct matching is **a → iv, b → i, c → ii, d → iii** (option text **iv i ii iii**).",
      "**Eliminate.** Any code that sends Glycosuria to uric-acid/joints or Gout to glucose-in-urine conflicts with NCERT definitions.",
    ].join("\n\n"),
  },
  {
    needle: /Ultrafiltration[\s\S]*?Concentration\s+ii\.\s*Ureter of urine/i,
    stem: "Match the items given in Column I with those in Column II and select the correct option given below: Column I Column II (Function) (Part of Excretory System) a. Ultrafiltration i. Henle’s loop b. Concentration of urine ii. Ureter c. Transport of urine iii. Urinary bladder d. Storage of urine iv. Malpighian corpuscle v. Proximal convoluted tubule",
    answerText: null, // leave key; only clean stem/options OCR
    optionClean: {
      "OUGH WORK English": "",
    },
  },
];

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
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

function mapAnswer(options, answerText) {
  const target = normOpt(answerText);
  if (!target) return null;
  for (const [k, v] of Object.entries(options || {})) {
    if (normOpt(v) === target) return String(k);
  }
  // loose: same roman tokens in order
  const tokens = String(answerText)
    .toLowerCase()
    .match(/\b(iv|iii|ii|i)\b/g);
  if (!tokens) return null;
  for (const [k, v] of Object.entries(options || {})) {
    const ot = String(v)
      .toLowerCase()
      .match(/\b(iv|iii|ii|i)\b/g);
    if (ot && ot.join(" ") === tokens.join(" ")) return String(k);
  }
  return null;
}

function applyToQuestion(q, key) {
  let changed = false;
  for (const fix of STEM_FIXES) {
    if (!fix.needle.test(q.stem || "")) continue;
    if (fix.stem && q.stem !== fix.stem) {
      q.stem = fix.stem;
      changed = true;
    }
    if (fix.optionClean && q.options) {
      for (const [k, v] of Object.entries(q.options)) {
        let nv = v;
        for (const [junk, rep] of Object.entries(fix.optionClean)) {
          if (nv.includes(junk)) {
            nv = nv.replace(junk, rep).trim();
            changed = true;
          }
        }
        q.options[k] = nv;
      }
    }
    if (fix.answerText && key) {
      const mapped = mapAnswer(q.options, fix.answerText);
      if (mapped && String(key.correctOption) !== mapped) {
        key.correctOption = mapped;
        key.correctOptions = [mapped];
        key.answerEstimated = false;
        key.keyConfidence = Math.max(key.keyConfidence || 0, 3);
        changed = true;
      }
      if (fix.solution) {
        const ot = q.options?.[String(key.correctOption)] || fix.answerText;
        key.solution = fix.solution.replace(
          "**Lock.** Correct matching is **a → iv, b → i, c → ii, d → iii** (option text **iv i ii iii**).",
          `**Lock.** Correct matching is **a → iv, b → i, c → ii, d → iii** — option **(${key.correctOption}) ${ot}**.`,
        );
        changed = true;
      }
    }
  }
  return changed;
}

let paperFixes = 0;
let keyFixes = 0;
for (const year of [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
  const paperPath = path.join(root, "content/papers", `neet-${year}.paper.md`);
  const keyPath = path.join(root, "content/papers", `neet-${year}.key.md`);
  let paperRaw = readFileSync(paperPath, "utf8");
  let keyRaw = readFileSync(keyPath, "utf8");
  const paper = JSON.parse(extractFence(paperRaw, "neet-paper-json"));
  const keyDoc = JSON.parse(extractFence(keyRaw, "neet-keys-json"));
  let pChanged = false;
  let kChanged = false;
  for (const q of paper.questions) {
    const k = keyDoc.keys[q.id] || null;
    const before = JSON.stringify({ stem: q.stem, options: q.options, key: k });
    applyToQuestion(q, k);
    const after = JSON.stringify({ stem: q.stem, options: q.options, key: k });
    if (before !== after) {
      pChanged = true;
      if (k) kChanged = true;
      paperFixes++;
      if (k && k.correctOption) keyFixes++;
    }
  }
  if (pChanged) writeFileSync(paperPath, writeFence(paperRaw, "neet-paper-json", paper));
  if (kChanged) writeFileSync(keyPath, writeFence(keyRaw, "neet-keys-json", keyDoc));
}

let bankFixes = 0;
const bankDir = path.join(root, "data/topic-series/banks");
for (const file of readdirSync(bankDir).filter((f) => f.endsWith(".json"))) {
  const p = path.join(bankDir, file);
  const data = JSON.parse(readFileSync(p, "utf8"));
  let changed = false;
  for (const diff of Object.keys(data.questions || {})) {
    for (const q of data.questions[diff]) {
      const key = {
        correctOption: q.correctOption,
        correctOptions: q.correctOptions,
        answerEstimated: q.answerEstimated,
        solution: q.solution,
        keyConfidence: q.keyConfidence,
      };
      if (applyToQuestion(q, key)) {
        q.correctOption = key.correctOption;
        q.correctOptions = key.correctOptions || [key.correctOption];
        q.answerEstimated = key.answerEstimated;
        q.solution = key.solution;
        changed = true;
        bankFixes++;
      }
    }
  }
  if (changed) writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

console.log({ paperFixes, keyFixes, bankFixes });
