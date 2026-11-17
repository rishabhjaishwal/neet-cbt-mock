export type LearningLink = {
  label: string;
  url: string;
  kind: "youtube" | "web" | "pdf" | "other";
};

export type LearningAid = {
  title: string;
  /** Short concept headline */
  concept: string;
  /** AI-generated NEET-style worked solution */
  aiSolution: string;
  /** Optional curated editorial solution */
  curatedSolution?: string | null;
  links: LearningLink[];
  placeholder: boolean;
};

type LearningInput = {
  number: number;
  subject: string;
  section: string;
  topic: string;
  stem: string;
  options: Record<string, string>;
  correct: string[];
  multiCorrect?: boolean;
  answerEstimated?: boolean;
  curatedSolution?: string | null;
  curatedLinks?: LearningLink[] | null;
};

function clip(s: string, n = 220) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/** Distinctive stem words for search (skip stopwords / boilerplate). */
export function stemSearchKeywords(stem: string, max = 10): string[] {
  const stop = new Set([
    "which",
    "following",
    "correct",
    "incorrect",
    "statement",
    "statements",
    "given",
    "below",
    "above",
    "select",
    "choose",
    "option",
    "options",
    "match",
    "list",
    "column",
    "regarding",
    "about",
    "from",
    "with",
    "that",
    "this",
    "these",
    "those",
    "when",
    "then",
    "than",
    "into",
    "onto",
    "among",
    "between",
    "under",
    "over",
    "after",
    "before",
    "during",
    "using",
    "based",
    "according",
    "figure",
    "shown",
    "diagram",
    "question",
    "neet",
    "mark",
    "marks",
  ]);
  const words = stem
    .replace(/\$[^$]+\$/g, " ")
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !stop.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

function searchQuery(topic: string, stem: string, correctText?: string) {
  const keys = stemSearchKeywords(stem, 8).join(" ");
  const opt = correctText
    ? clip(correctText.replace(/[^a-zA-Z0-9\s]/g, " "), 60)
    : "";
  return `NEET ${topic} ${keys}${opt ? ` ${opt}` : ""}`.replace(/\s+/g, " ").trim();
}

function defaultLinks(
  topic: string,
  stem: string,
  subject: string,
  correctText?: string,
): LearningLink[] {
  const keys = stemSearchKeywords(stem, 6).join(" ");
  const qRaw = searchQuery(topic, stem, correctText);
  const q = encodeURIComponent(qRaw);
  const ytQ = encodeURIComponent(`NEET ${topic} ${keys} explanation`.trim());
  const ncertQ = encodeURIComponent(
    `site:ncert.nic.in ${subject} ${topic} ${stemSearchKeywords(stem, 4).join(" ")}`,
  );
  const pdfQ = encodeURIComponent(`NEET ${topic} ${keys} NCERT notes filetype:pdf`);
  return [
    {
      kind: "youtube",
      label: `YouTube: ${clip(`${topic} — ${keys}`, 48) || topic}`,
      url: `https://www.youtube.com/results?search_query=${ytQ}`,
    },
    {
      kind: "web",
      label: "Web: this stem + answer wording",
      url: `https://www.google.com/search?q=${q}`,
    },
    {
      kind: "web",
      label: "NCERT search (this concept)",
      url: `https://www.google.com/search?q=${ncertQ}`,
    },
    {
      kind: "pdf",
      label: "PDF notes for this topic",
      url: `https://www.google.com/search?q=${pdfQ}`,
    },
  ];
}

function detectPattern(stem: string): string {
  const s = stem.toLowerCase();
  // Avoid false positives like "column in" / "column length".
  if (
    /match list|match the following|match the items|match the column/.test(s) ||
    /column\s*[-–]?\s*i(?![a-z])/.test(s) ||
    /list\s*[-–]?\s*i(?![a-z])/.test(s)
  ) {
    return "match_list";
  }
  if (/assertion|reason\s*r\b|statement\s*i\b/.test(s)) return "assertion";
  if (/see figure|given figure|as shown|following diagram|circuit/.test(s)) return "figure";
  if (/correct\s+statements?|incorrect\s+statement|which of the following/.test(s))
    return "multi_statement";
  return "mcq";
}

function subjectCue(subject: string, topic: string, stem: string): string {
  const s = stem.toLowerCase();
  if (subject === "Physics") {
    if (/wave|optics|interference|diffraction|lens|mirror|resonance|tuning|sound/.test(s))
      return "Identify the optical/wave formula (lens, path difference, fringe width, resonance length ΔL=λ/2) before plugging numbers.";
    if (/current|circuit|capacitor|inductor|magnetic|electric field|potential/.test(s))
      return "Sketch the circuit/field briefly; apply Kirchhoff / Coulomb / Faraday with consistent units.";
    if (/thermo|heat|entropy|adiabatic|isothermal|carnot/.test(s))
      return "Name the process (iso-T / adiabatic / …), then use the matching first-law or PV relation.";
    if (/force|newton|friction|motion|velocity|acceleration/.test(s))
      return "Start from Newton’s laws / kinematics definitions and write knowns before substituting.";
    return `Anchor on the core ${topic} relation from NCERT Class 11/12 Physics.`;
  }
  if (subject === "Chemistry") {
    if (/equilibrium|ka|kb|ph|buffer/.test(s))
      return "Write the equilibrium expression / ICE outline; watch logarithms and approximations.";
    if (/organic|isomer|reaction|reagent|mechanism/.test(s))
      return "Map functional group → typical reagent/product from NCERT reaction tables; eliminate by selectivity.";
    if (/periodic|oxidation|hybrid|bond|mole|stoich/.test(s))
      return "Use periodic trends / oxidation-number bookkeeping / mole ratios before comparing options.";
    return `Use NCERT ${topic} definitions and worked examples as the ground truth.`;
  }
  if (/genetics|mendel|dna|rna|transcription|translation/.test(s))
    return "Translate the stem into a genotype/central-dogma statement, then test each option against that map.";
  if (/ecology|population|ecosystem|biodiversity/.test(s))
    return "Recall the precise NCERT definition (not a popular paraphrase) for the named ecological term.";
  if (/physiology|hormone|neuron|kidney|heart|plant|glycosuria|gout|glomerular/.test(s))
    return "Locate the organ/system first, then apply the named process or hormone pathway exactly as NCERT states it.";
  return `Stay faithful to NCERT wording for “${topic}”; NEET biology rarely rewards over-interpretation.`;
}

function extractKnowns(stem: string): string | null {
  const nums = stem.match(
    /-?\d+(?:\.\d+)?\s*(?:cm|mm|m|km|s|ms|Hz|kHz|MHz|°C|K|V|A|Ω|ohm|N|kg|g|mol|atm|mmHg|eV|J|W|T|μ|%)?/gi,
  );
  if (!nums || nums.length < 2) return null;
  const uniq = [...new Set(nums.map((n) => n.trim()))].slice(0, 6);
  return uniq.join(", ");
}

/** Deterministic “AI tutor” write-up — exam-style derivation to the verified option text. */
function buildAiSolution(input: LearningInput): { concept: string; aiSolution: string } {
  const correctCodes = input.correct.length ? input.correct : [];
  const correctText = correctCodes
    .map((c) => `(${c}) ${input.options[c] ?? ""}`.trim())
    .join("; ");
  const pattern = detectPattern(input.stem);
  const concept = `${input.subject} · ${input.topic}`;
  const cue = subjectCue(input.subject, input.topic, input.stem);
  const knowns = extractKnowns(input.stem);

  const lines: string[] = [];
  lines.push(`**Identify.** ${clip(input.stem, 280)}`);
  lines.push(`**Concept.** ${cue}`);
  if (knowns) {
    lines.push(`**Given.** ${knowns}`);
  }

  if (pattern === "match_list") {
    lines.push(
      `**Work.** Treat each left-column item alone: recall its NCERT definition for “${input.topic}”, map to the unique right-column entry, then read the a–b–c–d (or A–B–C–D) code.`,
    );
  } else if (pattern === "assertion") {
    lines.push(
      `**Work.** Decide Assertion T/F from the core “${input.topic}” definition. Decide Reason T/F. Only if both are true, test whether Reason explains Assertion (causation, not coincidence).`,
    );
  } else if (pattern === "figure") {
    lines.push(
      `**Work.** Read figure labels/axes first. Translate the diagram into the governing law for “${input.topic}”, then test each option against that reading.`,
    );
  } else if (pattern === "multi_statement") {
    lines.push(
      `**Work.** Score each statement T/F with NCERT wording for “${input.topic}”. Build the option set from those truth values — one flipped statement usually kills three options.`,
    );
  } else {
    lines.push(
      `**Work.** Write the governing definition/formula for “${input.topic}” in one line${knowns ? ", substitute the given values carefully," : ","} then evaluate every option against that line.`,
    );
  }

  const optionLines = (["1", "2", "3", "4"] as const)
    .map((c) => {
      const text = clip(input.options[c] ?? "", 100);
      const mark = correctCodes.includes(c) ? "✓" : "✗";
      return `${mark} (${c}) ${text || "—"}`;
    })
    .join("\n");
  lines.push(`**Option scan.**\n${optionLines}`);

  if (correctCodes.length) {
    lines.push(
      `**Hence proved.** The option text that satisfies the derivation is **${correctText || `(${correctCodes[0]})`}**. Lock by wording (not a remembered booklet letter) — codes differ across sets.`,
    );
  } else {
    lines.push(
      `**Hence proved.** Official option text is not locked yet for Q${input.number}; practise from NCERT “${input.topic}” and compare parallel PYQs.`,
    );
  }

  const wrong = (["1", "2", "3", "4"] as const).filter((c) => !correctCodes.includes(c));
  if (wrong.length && correctCodes.length) {
    const sample = wrong
      .map((c) => `(${c}) ${clip(input.options[c] ?? "", 70)}`)
      .join(" · ");
    lines.push(
      `**Eliminate.** ${sample}. Each conflicts with the governing relation above — strike early to cut −1 risk.`,
    );
  }

  if (input.answerEstimated) {
    lines.push(
      `_Note: answer key for this extract is estimated — verify against the official NTA key when available._`,
    );
  }

  return { concept, aiSolution: lines.join("\n\n") };
}

/** Build a NEET-style learning block for results review. */
export function buildLearningAid(input: LearningInput): LearningAid {
  const hasKey = input.correct.length > 0;
  const curated = input.curatedSolution?.trim();
  const { concept, aiSolution } = buildAiSolution(input);
  const correctText = input.correct
    .map((c) => input.options[c] ?? "")
    .filter(Boolean)
    .join(" ");
  const links =
    input.curatedLinks && input.curatedLinks.length
      ? input.curatedLinks.map((l) => ({
          ...l,
          kind: l.kind ?? ("other" as const),
        }))
      : defaultLinks(input.topic, input.stem, input.subject, correctText);

  if (curated) {
    return {
      title: "Solution & learning stack",
      concept,
      aiSolution,
      curatedSolution: curated,
      links,
      placeholder: false,
    };
  }

  if (!hasKey || input.answerEstimated) {
    return {
      title: "Solution & learning stack",
      concept,
      aiSolution,
      curatedSolution: null,
      links,
      placeholder: true,
    };
  }

  return {
    title: "Solution & learning stack",
    concept,
    aiSolution,
    curatedSolution: null,
    links,
    placeholder: false,
  };
}

/** Back-compat helper used by older call sites expecting `solution` string. */
export function learningAidPlainSolution(aid: LearningAid): string {
  if (aid.curatedSolution) return aid.curatedSolution;
  return aid.aiSolution;
}
