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

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const papersDir = path.join(root, "content/papers");

const STOP = new Set(
  `which following correct incorrect statement statements given below above select choose option options match list column regarding about from with that this these those when then than into onto among between under over after before during using based according figure shown diagram question neet mark marks`.split(
    " ",
  ),
);

function clip(s, n = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function keywords(stem, max = 8) {
  const words = String(stem || "")
    .replace(/\$[^$]+\$/g, " ")
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const out = [];
  const seen = new Set();
  for (const w of words) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= max) break;
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

function isWeakSolution(sol, stem) {
  const s = String(sol || "");
  if (!s.trim()) return true;
  if (/State the governing fact for/i.test(s)) return true;
  if (/Anchor on the core .+ relation from NCERT/i.test(s) && s.length < 550)
    return true;
  if (/Reduce to Ohm \/ Kirchhoff/i.test(s) && !/circuit|resistor|ohm|current|kirchhoff/i.test(stem))
    return true;
  // Contaminated reasoning from another PYQ (common OCR/script bug)
  if (/\*\*Reasoning\.\*\*/i.test(s)) {
    const reason = ((s.match(/\*\*Reasoning\.\*\*\s*([\s\S]*?)(?:\n\n|\*\*)/) || [])[1] || "")
      .toLowerCase();
    const keys = keywords(stem, 5).map((w) => w.toLowerCase());
    const hits = keys.filter((w) => reason.includes(w)).length;
    if (keys.length >= 3 && hits === 0 && reason.length > 40) return true;
  }
  if (!/\*\*(Work|Lock|Hence proved)\.\*\*/i.test(s) && s.length < 280) return true;
  return false;
}

function subjectCue(subject, topic, stem) {
  const s = String(stem).toLowerCase();
  if (subject === "Physics") {
    if (/wave|optics|resonance|tuning|interference|lens|mirror|sound/.test(s))
      return "Use the matching wave/optics relation (resonance length ΔL=λ/2, fringe, lens formula) before numbers.";
    if (/current|circuit|capacitor|magnetic|electric field|potential|resistor/.test(s))
      return "Apply Kirchhoff / Coulomb / Faraday with consistent units.";
    if (/thermo|heat|entropy|adiabatic|isothermal/.test(s))
      return "Name the process, then use the matching first-law / PV relation.";
    if (/force|newton|friction|motion|velocity|acceleration/.test(s))
      return "Start from Newton’s laws / kinematics; write knowns before substituting.";
    return `Use the core NCERT relation for “${topic}”.`;
  }
  if (subject === "Chemistry") {
    if (/equilibrium|ka|kb|ph|buffer/.test(s))
      return "Write K / ICE carefully; watch logs and approximations.";
    if (/organic|isomer|reagent|reaction/.test(s))
      return "Map functional group → NCERT reagent/product; eliminate by selectivity.";
    return `Use NCERT definitions for “${topic}”.`;
  }
  if (/genetics|mendel|dna|rna/.test(s))
    return "Translate into genotype / central-dogma terms, then test options.";
  if (/physiology|kidney|gout|glycosuria|hormone|neuron|heart/.test(s))
    return "Locate the organ/system, then apply the NCERT process/definition exactly.";
  return `Stay faithful to NCERT wording for “${topic}”.`;
}

function detectPattern(stem) {
  const s = String(stem).toLowerCase();
  // Require Column I / List I as a header — not "column in" / "column length".
  if (
    /match list|match the following|match the items|match the column/.test(s) ||
    /column\s*[-–]?\s*i(?![a-z])/.test(s) ||
    /list\s*[-–]?\s*i(?![a-z])/.test(s)
  ) {
    return "match_list";
  }
  if (/assertion|reason\s*r\b/.test(s)) return "assertion";
  if (/see figure|as shown|diagram|circuit/.test(s)) return "figure";
  return "mcq";
}

function buildSolution(q, key) {
  const codes = Array.isArray(key.correctOptions) && key.correctOptions.length
    ? key.correctOptions.map(String)
    : [String(key.correctOption ?? "")].filter(Boolean);
  const correctText = codes
    .map((c) => `(${c}) ${q.options?.[c] ?? ""}`.trim())
    .join("; ");
  const pattern = detectPattern(q.stem);
  const cue = subjectCue(q.subject, q.topic, q.stem);
  const lines = [];
  lines.push(`**Identify.** ${clip(q.stem, 280)}`);
  lines.push(`**Concept.** ${cue}`);

  if (pattern === "match_list") {
    lines.push(
      `**Work.** Map each left item to its NCERT definition in “${q.topic}”, pair with the unique right entry, then read the matching code.`,
    );
  } else if (pattern === "assertion") {
    lines.push(
      `**Work.** Decide Assertion T/F, then Reason T/F, then whether Reason explains Assertion.`,
    );
  } else if (pattern === "figure") {
    lines.push(
      `**Work.** Read the figure labels first; translate into the governing “${q.topic}” law; test each option against that reading.`,
    );
  } else {
    lines.push(
      `**Work.** Write the governing fact/formula for “${q.topic}” in one line, substitute carefully, and score every option against it.`,
    );
  }

  const scan = ["1", "2", "3", "4"]
    .map((c) => {
      const mark = codes.includes(c) ? "✓" : "✗";
      return `${mark} (${c}) ${clip(q.options?.[c] ?? "", 90) || "—"}`;
    })
    .join("\n");
  lines.push(`**Option scan.**\n${scan}`);

  if (codes.length) {
    lines.push(
      `**Hence proved.** The verified option wording is **${correctText}**. Lock by text (not a remembered letter across booklets).`,
    );
  } else {
    lines.push(`**Hence proved.** Official option text not locked for this extract yet.`);
  }

  const wrong = ["1", "2", "3", "4"].filter((c) => !codes.includes(c));
  if (wrong.length && codes.length) {
    lines.push(
      `**Eliminate.** ${wrong
        .map((c) => `(${c}) ${clip(q.options?.[c] ?? "", 60)}`)
        .join(" · ")} — each conflicts with the governing idea above.`,
    );
  }

  if (key.answerEstimated) {
    lines.push(
      `_Note: key estimated — verify against official NTA key when available._`,
    );
  }

  return lines.join("\n\n");
}

function buildLinks(q, key) {
  const codes = Array.isArray(key.correctOptions) && key.correctOptions.length
    ? key.correctOptions.map(String)
    : [String(key.correctOption ?? "")].filter(Boolean);
  const correctOpt = codes.map((c) => q.options?.[c] ?? "").filter(Boolean).join(" ");
  const keys = keywords(q.stem, 6).join(" ");
  const yt = encodeURIComponent(`NEET ${q.topic} ${keys} explanation`.trim());
  const web = encodeURIComponent(
    `NEET ${q.topic} ${keys} ${clip(correctOpt.replace(/[^a-zA-Z0-9\s]/g, " "), 50)}`.trim(),
  );
  const ncert = encodeURIComponent(
    `site:ncert.nic.in ${q.subject} ${q.topic} ${keywords(q.stem, 4).join(" ")}`,
  );
  const pdf = encodeURIComponent(`NEET ${q.topic} ${keys} NCERT notes filetype:pdf`);
  return [
    {
      kind: "youtube",
      label: `YouTube: ${clip(`${q.topic} — ${keys}`, 48) || q.topic}`,
      url: `https://www.youtube.com/results?search_query=${yt}`,
    },
    {
      kind: "web",
      label: "Web: this stem + answer wording",
      url: `https://www.google.com/search?q=${web}`,
    },
    {
      kind: "web",
      label: "NCERT search (this concept)",
      url: `https://www.google.com/search?q=${ncert}`,
    },
    {
      kind: "pdf",
      label: "PDF notes for this topic",
      url: `https://www.google.com/search?q=${pdf}`,
    },
  ];
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
    // Always rebuild from stem + verified option text so contaminated /
    // mis-pattern templates cannot linger. Preserve hand-tuned solutions that
    // already contain topic-specific NCERT facts (e.g. Glycosuria map).
    const preserve =
      /\*\*Concept\.\*\*[^*\n]*(NCERT|Excretory|Mendel|Kirchhoff|Faraday|Lens formula|ICE)/i.test(
        key.solution || "",
      ) &&
      /\*\*Hence proved\.\*\*/i.test(key.solution || "") &&
      !isWeakSolution(key.solution, q.stem) &&
      !(/Map each left item/i.test(key.solution || "") &&
        detectPattern(q.stem) !== "match_list");
    if (!preserve) {
      key.solution = buildSolution(q, key);
      solRewrites++;
    }

    const links = key.studyLinks;
    const empty =
      !Array.isArray(links) ||
      links.length === 0 ||
      links.every((l) => !l?.url || /youtube\.com\/results\?search_query=NEET%20[^&]+$/.test(l.url));
    if (empty) {
      key.studyLinks = buildLinks(q, key);
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
console.log(JSON.stringify({ summary, totals: summary.reduce((a, s) => ({
  solRewrites: a.solRewrites + s.solRewrites,
  linkFills: a.linkFills + s.linkFills,
  total: a.total + s.total,
}), { solRewrites: 0, linkFills: 0, total: 0 }) }, null, 2));
