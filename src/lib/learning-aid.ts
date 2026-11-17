export type LearningLink = { label: string; url: string };

export type LearningAid = {
  title: string;
  solution: string;
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
  const q = encodeURIComponent(searchQuery(topic, stem));
  return [
    {
      label: "YouTube — NEET topic videos",
      url: `https://www.youtube.com/results?search_query=${q}`,
    },
    {
      label: "Web study results (NCERT / coaching explainers)",
      url: `https://www.google.com/search?q=${q}+site%3Ancert.nic.in+OR+site%3Abyjus.com+OR+site%3Avedantu.com+OR+site%3Aphysicswallah.live`,
    },
  ];
}

function buildApproach(input: LearningInput): string {
  const correctCodes = input.correct.length ? input.correct : [];
  const correctText = correctCodes
    .map((c) => `(${c}) ${input.options[c] ?? ""}`.trim())
    .join("; ");

  const lines: string[] = [];
  lines.push(
    `Topic focus: ${input.subject} · Section ${input.section} · ${input.topic}.`,
  );
  lines.push(
    `NEET approach: read the stem carefully, identify the tested concept under “${input.topic}”, then eliminate options that contradict a definition, law, or standard exception.`,
  );

  if (correctCodes.length) {
    if (input.multiCorrect) {
      lines.push(
        `Correct set: ${correctText || correctCodes.map((c) => `(${c})`).join(", ")}. For multi-correct items, every required option must match; any extra wrong choice usually scores −1.`,
      );
    } else {
      lines.push(
        `Correct choice: ${correctText || `(${correctCodes[0]})`}. Match this option back to the core idea in the stem rather than memorising the letter alone.`,
      );
    }
  }

  const wrong = (["1", "2", "3", "4"] as const).filter((c) => !correctCodes.includes(c));
  if (wrong.length) {
    const sample = wrong
      .slice(0, 2)
      .map((c) => `(${c}) ${clip(input.options[c] ?? "", 90)}`)
      .join(" · ");
    lines.push(
      `Elimination cue: options such as ${sample} conflict with the governing concept — strike them before you lock the answer.`,
    );
  }

  lines.push(
    `Relearn loop: rewrite the concept in one line, solve 2–3 similar ${input.topic} MCQs, then re-attempt this stem without looking at the key.`,
  );

  return lines.join("\n\n");
}

/** Build a NEET-style learning block for results review. */
export function buildLearningAid(input: LearningInput): LearningAid {
  const hasKey = input.correct.length > 0;
  const curated = input.curatedSolution?.trim();

  if (curated) {
    return {
      title: "Learn this idea",
      solution: curated,
      links:
        input.curatedLinks && input.curatedLinks.length
          ? input.curatedLinks
          : defaultLinks(input.topic, input.stem),
      placeholder: false,
    };
  }

  if (!hasKey || input.answerEstimated) {
    return {
      title: "Learning notes (limited key confidence)",
      solution:
        `A full worked solution is not locked for Q${input.number} yet` +
        (input.answerEstimated ? " (answer key is estimated for this extract)." : ".") +
        ` Study the topic “${input.topic}” from NCERT and coaching explainers, then practise similar stems. Use the links below to relearn the concept and attempt parallel questions.`,
      links: defaultLinks(input.topic, input.stem),
      placeholder: true,
    };
  }

  return {
    title: "Learn this idea",
    solution: buildApproach(input),
    links: defaultLinks(input.topic, input.stem),
    placeholder: false,
  };
}
