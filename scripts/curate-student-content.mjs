#!/usr/bin/env node
/**
 * Physically drop student-unsafe questions from MD papers + topic banks.
 * Keeps keys aligned. Regenerates topic catalog counts.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Inline the same rules as src/lib/content-quality.ts (script stays zero-build).
const PLACEHOLDER_RE =
  /\[PLACEHOLDER\]|could not be recovered|Placeholder option/i;
const INCOMPLETE_RE = /incomplete in source PDF|\[Option\s*\d/i;
const OCR_JUNK_RE =
  /c:fi|w:rr|w::rr|IEnglish\s*\+\s*Hindi|English\+Hindi|English\+Hilidi|z\s*I\s*English|qldl|91cl|@dl|fiB\s|fiRUT|gm;@|m¼affl|cfiT|fll\{/i;
const LATIN_OCR_RE =
  /\bcfi[A-Za-z]|qff{2,}|wtiif|ftcR|a_,uy|@ct|:if\(|\\if[a-z]|r1i\.|:if\(1f/i;
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const PUA_RE = /[\uE000-\uF8FF]/;
const NEEDS_FIGURE_RE =
  /as shown in (the )?figure|see (the )?figure|shown in (the )?figure|following diagram|given figure|in the figure|figure below|from the given figure/i;
const MIN_STUDENT_PAPER_QUESTIONS = 80;

function listIssues(q) {
  const stem = String(q.stem ?? "").trim();
  const opts = ["1", "2", "3", "4"].map((k) =>
    String(q.options?.[k] ?? "").trim(),
  );
  const blob = `${stem}\n${opts.join("\n")}`;
  const issues = [];
  if (!stem) issues.push("empty");
  if (q.placeholder) issues.push("placeholder");
  if (PLACEHOLDER_RE.test(blob)) issues.push("placeholder");
  if (INCOMPLETE_RE.test(blob)) issues.push("incomplete-option");
  if (opts.some((o) => !o)) issues.push("missing-option");
  if (DEVANAGARI_RE.test(blob)) issues.push("devanagari");
  if (PUA_RE.test(blob)) issues.push("pua-junk");
  if (OCR_JUNK_RE.test(blob)) issues.push("ocr-junk");
  if (LATIN_OCR_RE.test(blob)) issues.push("latin-ocr");
  if (stem.replace(/\s+/g, "").length < 15) issues.push("short-stem");
  const paren = stem.match(/\(\s*[1-4]\s*\)/g) || [];
  if (paren.length >= 3) {
    const isMatchList =
      /match the|column\s*[12i]|list[\s-]*[i1]\b|assertion|reason/i.test(stem);
    if (!isMatchList) issues.push("options-in-stem");
  }
  for (const o of opts) {
    if (/\(\s*[2-4]\s*\)/.test(o)) { issues.push("option-mash"); break; }
    if (o.length > 100 && (o.match(/\.\s+[A-Z]/g) || []).length >= 2) {
      issues.push("option-mash"); break;
    }
  }
  const lens = opts.map((o) => o.length).sort((a, b) => a - b);
  if (lens[3] > 120 && lens[3] > Math.max(lens[1], 1) * 4) issues.push("option-mash");
  const noise = (stem.match(/[^A-Za-z0-9\s.,;:?'"\(\)\-+/=%°μµΔδθαβγλσω_]/g) || []).length;
  if (stem.length > 50 && noise / stem.length > 0.14) issues.push("noisy-stem");
  if (
    q.figureKind === "missing-placeholder" ||
    /unmatched crop|Figure not matched/i.test(String(q.figureSrc ?? ""))
  ) {
    if (NEEDS_FIGURE_RE.test(stem)) issues.push("missing-figure");
  }
  return [...new Set(issues)];
}

function trimMerged(stem) {
  const m = stem.match(/^(.*?)\s*\(\s*1\s*\)\s+/s);
  if (!m) return null;
  const prefix = m[1].replace(/\s+/g, " ").trim();
  if (prefix.length < 20) return null;
  if (DEVANAGARI_RE.test(prefix) || OCR_JUNK_RE.test(prefix) || PUA_RE.test(prefix))
    return null;
  if (PLACEHOLDER_RE.test(prefix) || INCOMPLETE_RE.test(prefix)) return null;
  const letters = prefix.match(/[A-Za-z]/g) || [];
  if (letters.length < 18) return null;
  return prefix;
}

function prepare(q) {
  const options = {
    "1": String(q.options?.["1"] ?? "").trim(),
    "2": String(q.options?.["2"] ?? "").trim(),
    "3": String(q.options?.["3"] ?? "").trim(),
    "4": String(q.options?.["4"] ?? "").trim(),
  };
  let stem = String(q.stem ?? "").trim();
  const early = listIssues({ ...q, stem, options });
  if (early.some((i) => i !== "options-in-stem")) return null;
  if (early.includes("options-in-stem")) {
    const t = trimMerged(stem);
    if (!t) return null;
    stem = t;
  }
  if (listIssues({ ...q, stem, options, placeholder: false }).length) return null;
  return { ...q, stem, options, placeholder: false };
}

function parseFence(raw, lang) {
  if (!raw.startsWith("---")) return { fm: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { fm: "", body: raw };
  return {
    fm: raw.slice(0, end + 4),
    body: raw.slice(end + 4).replace(/^\s*\n/, ""),
  };
}

function extractJson(body, lang) {
  const re = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)\\n```");
  const m = body.match(re);
  return m ? m[1] : null;
}

function rewriteFmField(fmBlock, key, value) {
  const lines = fmBlock.split("\n");
  let hit = false;
  const out = lines.map((line) => {
    if (line.startsWith(`${key}:`)) {
      hit = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  if (!hit && out[0] === "---") {
    out.splice(1, 0, `${key}: ${value}`);
  }
  return out.join("\n");
}

const papersDir = path.join(root, "content", "papers");
const summary = { papers: [], topics: [], droppedKeys: 0 };

for (const file of readdirSync(papersDir).filter((f) => f.endsWith(".paper.md"))) {
  const year = Number(file.match(/neet-(\d{4})/)?.[1]);
  const paperPath = path.join(papersDir, file);
  const keyPath = path.join(papersDir, `neet-${year}.key.md`);
  const raw = readFileSync(paperPath, "utf8");
  const { fm, body } = parseFence(raw);
  const json = extractJson(body, "neet-paper-json");
  if (!json) continue;
  const parsed = JSON.parse(json);
  const before = (parsed.questions || []).length;
  const kept = [];
  for (const q of parsed.questions || []) {
    const ready = prepare(q);
    if (ready) kept.push(ready);
  }
  parsed.questions = kept;
  const ready = kept.length >= MIN_STUDENT_PAPER_QUESTIONS;
  let fm2 = fm;
  fm2 = rewriteFmField(fm2, "totalQuestions", kept.length);
  fm2 = rewriteFmField(
    fm2,
    "attemptLimit",
    Math.min(Number(fm.match(/attemptLimit:\s*(\d+)/)?.[1] || kept.length), kept.length),
  );
  fm2 = rewriteFmField(fm2, "studentReady", ready ? "true" : "false");
  const gapsNote = ready
    ? []
    : [
        `Student-ready curation: only ${kept.length} clean English items (need ${MIN_STUDENT_PAPER_QUESTIONS}). Hidden from start until repaired.`,
      ];
  if (gapsNote.length) {
    fm2 = rewriteFmField(fm2, "gaps", JSON.stringify(gapsNote));
  }
  const title = `NEET ${year}`;
  const newBody = `# ${title}\n\nStudent-safe English stems/options. Keys live in the sibling \`.key.md\`.\n\n\`\`\`neet-paper-json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
  writeFileSync(paperPath, `${fm2.replace(/\n---\s*$/, "\n---")}\n${newBody}`);

  let keyDropped = 0;
  try {
    const keyRaw = readFileSync(keyPath, "utf8");
    const { fm: kfm, body: kbody } = parseFence(keyRaw);
    const kjson = extractJson(kbody, "neet-keys-json");
    if (kjson) {
      const kparsed = JSON.parse(kjson);
      const keepIds = new Set(kept.map((q) => q.id));
      const next = {};
      for (const [id, val] of Object.entries(kparsed.keys || {})) {
        if (keepIds.has(id)) next[id] = val;
        else keyDropped += 1;
      }
      kparsed.keys = next;
      const newKeyBody = `# Answer key — NEET ${year}\n\nServer-only. Never ship via unauthenticated routes.\n\n\`\`\`neet-keys-json\n${JSON.stringify(kparsed, null, 2)}\n\`\`\`\n`;
      writeFileSync(keyPath, `${kfm.replace(/\n---\s*$/, "\n---")}\n${newKeyBody}`);
    }
  } catch {
    /* no key file */
  }
  summary.droppedKeys += keyDropped;
  summary.papers.push({ year, before, after: kept.length, ready, keyDropped });
  console.log(
    `paper ${year}: ${before} → ${kept.length} (ready=${ready}, keys dropped=${keyDropped})`,
  );
}

// Topic banks
const banksDir = path.join(root, "data", "topic-series", "banks");
const catalogPath = path.join(root, "data", "topic-series", "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const catalogById = Object.fromEntries((catalog.topics || []).map((t) => [t.id, t]));

for (const file of readdirSync(banksDir).filter((f) => f.endsWith(".json"))) {
  const bankPath = path.join(banksDir, file);
  const bank = JSON.parse(readFileSync(bankPath, "utf8"));
  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  let before = 0;
  let after = 0;
  for (const d of ["Easy", "Medium", "Hard"]) {
    const src = bank.questions?.[d] || [];
    before += src.length;
    const kept = [];
    for (const q of src) {
      const ready = prepare(q);
      if (ready) kept.push(ready);
    }
    bank.questions[d] = kept;
    counts[d] = kept.length;
    after += kept.length;
  }
  bank.counts = counts;
  const gaps = [];
  for (const d of ["Easy", "Medium", "Hard"]) {
    if (counts[d] < 10) {
      gaps.push(`${d}: have ${counts[d]} clean items (need 10+ to start)`);
    }
  }
  bank.gaps = gaps;
  writeFileSync(bankPath, `${JSON.stringify(bank, null, 2)}\n`);

  const entry = catalogById[bank.id] || {
    id: bank.id,
    subject: bank.subject,
    topic: bank.topic,
  };
  entry.counts = counts;
  entry.gaps = gaps;
  entry.ready = counts.Easy + counts.Medium + counts.Hard >= 10;
  catalogById[bank.id] = entry;
  summary.topics.push({ id: bank.id, before, after, counts });
  console.log(`topic ${bank.id}: ${before} → ${after}`, counts);
}

catalog.topics = Object.values(catalogById);
catalog.version = (catalog.version || 1) + 1;
catalog.note =
  "Student-curated banks: placeholders/OCR/Hindi-garbage/incomplete options removed. Counts are clean English items only.";
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

const manifestPath = path.join(papersDir, "manifest.json");
try {
  const man = JSON.parse(readFileSync(manifestPath, "utf8"));
  man.curatedAt = new Date().toISOString();
  man.papers = summary.papers;
  writeFileSync(manifestPath, `${JSON.stringify(man, null, 2)}\n`);
} catch {
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ curatedAt: new Date().toISOString(), papers: summary.papers }, null, 2)}\n`,
  );
}

console.log(JSON.stringify(summary, null, 2));
