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

/** Deterministic “AI tutor” write-up — exam-style steps, no invented facts beyond stem/key. */
function buildAiSolution(input: LearningInput): { concept: string; aiSolution: string } {
  const correctCodes = input.correct.length ? input.correct : [];
  const correctText = correctCodes
    .map((c) => `(${c}) ${input.options[c] ?? ""}`.trim())
    .join("; ");
  const pattern = detectPattern(input.stem);
  const concept = `${input.subject} · ${input.topic}`;

  const lines: string[] = [];
  lines.push(`**Step 1 — Spot the ask.** ${clip(input.stem, 260)}`);

  if (pattern === "match_list") {
    lines.push(
      `**Step 2 — Method.** Treat List I rows independently. Recall the defining property for each left item, then map to the unique List II entry. Cross-check that no two left items claim the same right entry unless the key allows it.`,
    );
  } else if (pattern === "assertion") {
    lines.push(
      `**Step 2 — Method.** Decide Assertion true/false using the core definition under “${input.topic}”. Then decide Reason true/false. Only if both are true, test whether Reason actually explains Assertion (causation, not mere correlation).`,
    );
  } else if (pattern === "figure") {
    lines.push(
      `**Step 2 — Method.** Read labels/axes on the figure first. Translate the diagram into the governing law or definition for “${input.topic}”, then test each option against that reading — do not reverse-engineer from options alone.`,
    );
  } else if (pattern === "multi_statement") {
    lines.push(
      `**Step 2 — Method.** Score each statement A/B/C… as T/F using NCERT wording for “${input.topic}”. Build the option set from those truth values; one flipped statement usually kills three options.`,
    );
  } else {
    lines.push(
      `**Step 2 — Method.** Identify the tested concept under “${input.topic}”. Write the governing definition/formula/exception in one line, then evaluate options against it.`,
    );
  }

  if (correctCodes.length) {
    if (input.multiCorrect) {
      lines.push(
        `**Step 3 — Lock the set.** Required correct option(s): ${correctText || correctCodes.map((c) => `(${c})`).join(", ")}. For multi-correct NEET items, the full correct set must match; an extra wrong choice typically costs −1.`,
      );
    } else {
      lines.push(
        `**Step 3 — Lock the answer.** Correct choice: ${correctText || `(${correctCodes[0]})`}. Re-read the stem once to confirm the option matches the concept — not just a familiar letter.`,
      );
    }
  } else {
    lines.push(
      `**Step 3 — Key pending.** A locked official option is not available yet for Q${input.number}; practise the topic from NCERT and compare with parallel PYQs.`,
    );
  }

  const wrong = (["1", "2", "3", "4"] as const).filter((c) => !correctCodes.includes(c));
  if (wrong.length && correctCodes.length) {
    const sample = wrong
      .slice(0, 2)
      .map((c) => `(${c}) ${clip(input.options[c] ?? "", 80)}`)
      .join(" · ");
    lines.push(
      `**Step 4 — Eliminate traps.** Options such as ${sample} conflict with the governing idea — strike them early to reduce negative marking risk.`,
    );
  } else {
    lines.push(
      `**Step 4 — Exam habit.** If two options look close, prefer the one that matches NCERT language for “${input.topic}” over a stretched interpretation.`,
    );
  }

  lines.push(
    `**Step 5 — Relearn loop.** Rewrite the concept in one line → solve 2–3 similar ${input.topic} MCQs → re-attempt this stem without the key.`,
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
