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

function searchQuery(topic: string, stem: string) {
  const words = stem
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8)
    .join(" ");
  return `NEET ${topic} ${words}`.trim();
}

function defaultLinks(topic: string, stem: string): LearningLink[] {
  const qRaw = searchQuery(topic, stem);
  const q = encodeURIComponent(qRaw);
  const topicQ = encodeURIComponent(`NEET ${topic}`);
  const pdfQ = encodeURIComponent(`NEET ${topic} NCERT notes filetype:pdf`);
  // Prefer stable search landing pages (always resolve) over deep links that rot.
  return [
    {
      kind: "youtube",
      label: `YouTube — ${topic}`,
      url: `https://www.youtube.com/results?search_query=${topicQ}`,
    },
    {
      kind: "web",
      label: "NCERT textbook portal",
      url: "https://ncert.nic.in/textbook.php",
    },
    {
      kind: "web",
      label: "Web explainers (this concept)",
      url: `https://www.google.com/search?q=${q}`,
    },
    {
      kind: "pdf",
      label: "PDF notes search",
      url: `https://www.google.com/search?q=${pdfQ}`,
    },
  ];
}

function detectPattern(stem: string): string {
  const s = stem.toLowerCase();
  if (/match list|match the following|column\s*-?\s*i/.test(s)) return "match_list";
  if (/assertion|reason\s*r\b|statement\s*i\b/.test(s)) return "assertion";
  if (/see figure|given figure|as shown|following diagram|circuit/.test(s)) return "figure";
  if (/correct\s+statements?|incorrect\s+statement|which of the following/.test(s))
    return "multi_statement";
  return "mcq";
}

function subjectCue(subject: string, topic: string, stem: string): string {
  const s = stem.toLowerCase();
  if (subject === "Physics") {
    if (/force|newton|friction|motion|velocity|acceleration/.test(s))
      return "Start from Newton’s laws / kinematics definitions and write knowns before substituting.";
    if (/current|circuit|capacitor|inductor|magnetic|electric field|potential/.test(s))
      return "Sketch the circuit/field briefly; apply Kirchhoff / Coulomb / Faraday with consistent units.";
    if (/thermo|heat|entropy|adiabatic|isothermal|carnot/.test(s))
      return "Name the process (iso-T / adiabatic / …), then use the matching first-law or PV relation.";
    if (/wave|optics|interference|diffraction|lens|mirror/.test(s))
      return "Identify the optical/wave formula (lens, path difference, fringe width) before plugging numbers.";
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
  // Biology
  if (/genetics|mendel|dna|rna|transcription|translation/.test(s))
    return "Translate the stem into a genotype/central-dogma statement, then test each option against that map.";
  if (/ecology|population|ecosystem|biodiversity/.test(s))
    return "Recall the precise NCERT definition (not a popular paraphrase) for the named ecological term.";
  if (/physiology|hormone|neuron|kidney|heart|plant/.test(s))
    return "Locate the organ/system first, then apply the named process or hormone pathway exactly as NCERT states it.";
  return `Stay faithful to NCERT wording for “${topic}”; NEET biology rarely rewards over-interpretation.`;
}

/** Deterministic “AI tutor” write-up — exam-style steps, no invented facts beyond stem/key. */
function buildAiSolution(input: LearningInput): { concept: string; aiSolution: string } {
  const correctCodes = input.correct.length ? input.correct : [];
  const correctText = correctCodes
    .map((c) => `(${c}) ${input.options[c] ?? ""}`.trim())
    .join("; ");
  const pattern = detectPattern(input.stem);
  const concept = `${input.subject} · ${input.topic}`;
  const cue = subjectCue(input.subject, input.topic, input.stem);

  const lines: string[] = [];
  lines.push(`**Step 1 — Spot the ask.** ${clip(input.stem, 280)}`);
  lines.push(`**Step 2 — Concept cue.** ${cue}`);

  if (pattern === "match_list") {
    lines.push(
      `**Step 3 — Method.** Treat List I rows independently. Recall the defining property for each left item, then map to the unique List II entry. Cross-check that no two left items claim the same right entry unless the key allows it.`,
    );
  } else if (pattern === "assertion") {
    lines.push(
      `**Step 3 — Method.** Decide Assertion true/false using the core definition under “${input.topic}”. Then decide Reason true/false. Only if both are true, test whether Reason actually explains Assertion (causation, not mere correlation).`,
    );
  } else if (pattern === "figure") {
    lines.push(
      `**Step 3 — Method.** Read labels/axes on the figure first. Translate the diagram into the governing law or definition for “${input.topic}”, then test each option against that reading — do not reverse-engineer from options alone.`,
    );
  } else if (pattern === "multi_statement") {
    lines.push(
      `**Step 3 — Method.** Score each statement A/B/C… as T/F using NCERT wording for “${input.topic}”. Build the option set from those truth values; one flipped statement usually kills three options.`,
    );
  } else {
    lines.push(
      `**Step 3 — Method.** Write the governing definition/formula/exception in one line, substitute given data carefully, then evaluate every option against that line — not against memory of a similar PYQ.`,
    );
  }

  // Describe each option briefly so weak keys still teach.
  const optionLines = (["1", "2", "3", "4"] as const)
    .map((c) => {
      const text = clip(input.options[c] ?? "", 100);
      const mark = correctCodes.includes(c) ? "✓" : "✗";
      return `${mark} (${c}) ${text || "—"}`;
    })
    .join("\n");
  lines.push(`**Step 4 — Option scan.**\n${optionLines}`);

  if (correctCodes.length) {
    if (input.multiCorrect) {
      lines.push(
        `**Step 5 — Lock the set.** Required correct option(s): ${correctText || correctCodes.map((c) => `(${c})`).join(", ")}. Match by option wording (not a remembered letter) — booklet option order can differ across codes.`,
      );
    } else {
      lines.push(
        `**Step 5 — Lock the answer.** Correct choice by content: ${correctText || `(${correctCodes[0]})`}. Confirm the option text matches the governing fact/calculation — never lock a letter from a different booklet’s order.`,
      );
    }
  } else {
    lines.push(
      `**Step 5 — Key pending.** A locked official option is not available yet for Q${input.number}; practise the topic from NCERT and compare with parallel PYQs.`,
    );
  }

  const wrong = (["1", "2", "3", "4"] as const).filter((c) => !correctCodes.includes(c));
  if (wrong.length && correctCodes.length) {
    const sample = wrong
      .map((c) => `(${c}) ${clip(input.options[c] ?? "", 70)}`)
      .join(" · ");
    lines.push(
      `**Step 6 — Why others fall.** ${sample}. Each conflicts with the governing idea above — strike them early to cut negative-marking risk.`,
    );
  } else {
    lines.push(
      `**Step 6 — Exam habit.** If two options look close, prefer the one that matches NCERT language for “${input.topic}” over a stretched interpretation.`,
    );
  }

  lines.push(
    `**Step 7 — Relearn loop.** Rewrite the concept in one line → solve 2–3 similar ${input.topic} MCQs (same year or adjacent) → re-attempt this stem without looking at the key.`,
  );

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
  const links =
    input.curatedLinks && input.curatedLinks.length
      ? input.curatedLinks.map((l) => ({
          ...l,
          kind: l.kind ?? ("other" as const),
        }))
      : defaultLinks(input.topic, input.stem);

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
