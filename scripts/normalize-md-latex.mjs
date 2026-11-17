#!/usr/bin/env node
/** Normalize HF/TeX dumps in content/papers for KaTeX display. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const papersDir = path.join(root, "content", "papers");

function normalizeTex(s) {
  let t = String(s ?? "");
  for (let i = 0; i < 3; i++) t = t.replace(/\\\\/g, "\\");
  t = t.replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  t = t.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
  t = t.replace(/\s+/g, " ").trim();
  // Wrap bare \frac / \sqrt / \mathrm chunks that aren't already in $...$
  if (!/\$/.test(t) && /\\(frac|sqrt|mathrm|mathbf|text|left|right|times|cdot)/.test(t)) {
    t = `$${t}$`;
  }
  // Fix unbalanced: open math without close at end
  const dollars = (t.match(/\$/g) || []).length;
  if (dollars % 2 === 1) t += "$";
  // Empty frac denominator noise: \frac { x } { }
  t = t.replace(/\\frac\s*\{\s*([^}]*)\s*\}\s*\{\s*\}/g, "$1");
  return t;
}

let changed = 0;
for (const file of readdirSync(papersDir).filter((f) => f.endsWith(".paper.md"))) {
  const p = path.join(papersDir, file);
  let raw = readFileSync(p, "utf8");
  const m = raw.match(/```neet-paper-json\n([\s\S]*?)\n```/);
  if (!m) continue;
  const parsed = JSON.parse(m[1]);
  let n = 0;
  for (const q of parsed.questions || []) {
    const stem = normalizeTex(q.stem);
    const opts = Object.fromEntries(
      Object.entries(q.options || {}).map(([k, v]) => [k, normalizeTex(v)]),
    );
    if (stem !== q.stem || JSON.stringify(opts) !== JSON.stringify(q.options)) {
      q.stem = stem;
      q.options = opts;
      n += 1;
    }
  }
  if (n) {
    raw = raw.replace(
      /```neet-paper-json\n[\s\S]*?\n```/,
      "```neet-paper-json\n" + JSON.stringify(parsed, null, 2) + "\n```",
    );
    writeFileSync(p, raw);
    changed += n;
    console.log(file, "normalized", n);
  }
}
console.log("total question updates", changed);
