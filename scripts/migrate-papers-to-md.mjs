#!/usr/bin/env node
/**
 * Convert data/papers/neet-*.json → content/papers/*.paper.md + *.key.md
 * MD is the runtime canonical store; JSON remains optional regenerate input.
 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const srcDir = path.join(root, "data", "papers");
const outDir = path.join(root, "content", "papers");

function yamlEscape(s) {
  const t = String(s ?? "");
  if (/[:#{}[\],&*?|>!%@`]/.test(t) || t.includes("\n") || t.includes('"')) {
    return JSON.stringify(t);
  }
  return t || '""';
}

async function convertOne(file) {
  const paper = JSON.parse(await readFile(path.join(srcDir, file), "utf8"));
  const year = paper.year;
  const studentQuestions = (paper.questions || []).map((q) => ({
    id: q.id,
    number: q.number,
    subject: q.subject,
    section: q.section,
    topic: q.topic,
    stem: q.stem,
    options: q.options || {},
    multiCorrect: Boolean(q.multiCorrect),
    placeholder: Boolean(q.placeholder),
    figureSrc: q.figureSrc ?? null,
    figureKind: q.figureKind ?? null,
  }));
  const keys = {};
  for (const q of paper.questions || []) {
    keys[q.id] = {
      correctOption: q.correctOption,
      correctOptions: q.correctOptions?.length
        ? q.correctOptions
        : String(q.correctOption || "")
            .split(/[,/\s]+/)
            .filter((x) => /^[1-4]$/.test(x)),
      multiCorrect: Boolean(
        q.multiCorrect ||
          (q.correctOptions && q.correctOptions.length > 1) ||
          String(q.correctOption || "").includes(","),
      ),
      answerEstimated: Boolean(q.answerEstimated),
      solution: q.solution ?? null,
      studyLinks: q.studyLinks ?? null,
    };
  }

  const front = [
    "---",
    `year: ${year}`,
    `code: ${yamlEscape(paper.code)}`,
    `title: ${yamlEscape(paper.title)}`,
    `candidateCount: ${paper.candidateCount}`,
    `durationMinutes: ${paper.durationMinutes}`,
    `totalQuestions: ${paper.totalQuestions}`,
    `attemptLimit: ${paper.attemptLimit}`,
    `structure: ${yamlEscape(paper.structure || "")}`,
    `source: ${yamlEscape(paper.source || "")}`,
    `gaps: ${JSON.stringify(paper.gaps || [])}`,
    "---",
    "",
  ].join("\n");

  const paperMd =
    front +
    `# ${paper.title}\n\n` +
    `Private markdown paper pack (student stems/options/figures). **Answer keys are not in this file** — see \`neet-${year}.key.md\` (server-only).\n\n` +
    `- Questions: **${studentQuestions.length}**\n` +
    `- Attempt limit: **${paper.attemptLimit}** / ${paper.totalQuestions}\n` +
    `- Duration: **${paper.durationMinutes}** min\n\n` +
    "```neet-paper-json\n" +
    JSON.stringify({ questions: studentQuestions }, null, 2) +
    "\n```\n";

  const keyMd =
    [
      "---",
      `year: ${year}`,
      `title: ${yamlEscape(paper.title + " — keys")}`,
      "serverOnly: true",
      "---",
      "",
      `# Answer key — NEET ${year}`,
      "",
      "Server-only. Never ship via unauthenticated routes.",
      "",
      "```neet-keys-json",
      JSON.stringify({ keys }, null, 2),
      "```",
      "",
    ].join("\n");

  await writeFile(path.join(outDir, `neet-${year}.paper.md`), paperMd, "utf8");
  await writeFile(path.join(outDir, `neet-${year}.key.md`), keyMd, "utf8");
  return { year, q: studentQuestions.length, keys: Object.keys(keys).length };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(srcDir))
    .filter((f) => /^neet-\d{4}\.json$/.test(f))
    .sort();
  const rows = [];
  for (const f of files) rows.push(await convertOne(f));
  const manifest = {
    contentRoot: "content/papers",
    generatedAt: new Date().toISOString(),
    papers: rows.map((r) => ({
      year: r.year,
      paper: `neet-${r.year}.paper.md`,
      key: `neet-${r.year}.key.md`,
      questions: r.q,
      keys: r.keys,
    })),
  };
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
