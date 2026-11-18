#!/usr/bin/env node
/**
 * Rewrite curated solutions that are generic / contaminated, and fill studyLinks
 * with stem-specific YouTube/web/NCERT/PDF search URLs.
 *
 * Never remaps keys by Q-number alone. Solutions lock to verified option TEXT.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRealSolution,
  buildStudyLinks,
  isWeakSolution,
} from "./lib/real-solution.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const papersDir = path.join(root, "content/papers");

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

function processYear(yearFile) {
  const paperPath = path.join(papersDir, yearFile);
  const year = yearFile.match(/neet-(\d{4})/)?.[1];
  const keyPath = path.join(papersDir, `neet-${year}.key.md`);
  const paperRaw = readFileSync(paperPath, "utf8");
  const keyRaw = readFileSync(keyPath, "utf8");
  const paper = JSON.parse(extractFence(paperRaw, "neet-paper-json"));
  const keyDoc = JSON.parse(extractFence(keyRaw, "neet-keys-json"));
  const byId = Object.fromEntries((paper.questions || []).map((q) => [q.id, q]));

  let solRewrites = 0;
  let linkFills = 0;
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
      conceptHint: key.conceptHint,
      solution: key.solution,
    };
    const preserve =
      key.solution &&
      !isWeakSolution(key.solution) &&
      /\*\*(Work|Hence proved)\.\*\*/i.test(key.solution) &&
      // keep hand-tuned solutions that already name a concrete NCERT fact
      !/Write the governing fact\/formula|Use NCERT definitions for|Stay faithful to NCERT wording/i.test(
        key.solution,
      );
    if (!preserve) {
      key.solution = buildRealSolution(merged);
      solRewrites++;
    }

    const links = key.studyLinks;
    const empty =
      !Array.isArray(links) ||
      links.length === 0 ||
      links.every(
        (l) =>
          !l?.url ||
          /youtube\.com\/results\?search_query=NEET%20[^&]+$/.test(l.url),
      );
    if (empty) {
      key.studyLinks = buildStudyLinks(merged);
      linkFills++;
    }
  }

  writeFileSync(keyPath, writeFence(keyRaw, "neet-keys-json", keyDoc));
  return { year, solRewrites, linkFills, total: Object.keys(keyDoc.keys || {}).length };
}

const papers = readdirSync(papersDir).filter((f) => f.endsWith(".paper.md"));
const summary = [];
for (const f of papers.sort()) {
  summary.push(processYear(f));
}
console.log(
  JSON.stringify(
    {
      summary,
      totals: summary.reduce(
        (a, s) => ({
          solRewrites: a.solRewrites + s.solRewrites,
          linkFills: a.linkFills + s.linkFills,
          total: a.total + s.total,
        }),
        { solRewrites: 0, linkFills: 0, total: 0 },
      ),
    },
    null,
    2,
  ),
);
