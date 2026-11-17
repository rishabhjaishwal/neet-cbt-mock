#!/usr/bin/env node
/**
 * Local micro-bench for MD store algorithms (cold vs warm, student vs keys, byKeys).
 */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const modUrl = pathToFileURL(path.join(root, "src/lib/md-paper-store.ts")).href;

async function run() {
  const store = await import(modUrl);
  store.__resetMdPaperCacheForTests?.();

  const mark = async (label, fn) => {
    const t0 = performance.now();
    const out = await fn();
    const ms = performance.now() - t0;
    return { label, ms: +ms.toFixed(2), n: Array.isArray(out) ? out.length : out?.length ?? null };
  };

  const rows = [];
  rows.push(await mark("listMdPapers cold", () => store.listMdPapers()));
  rows.push(await mark("listMdPapers warm", () => store.listMdPapers()));
  store.__resetMdPaperCacheForTests?.();
  rows.push(await mark("student 2024 cold", () => store.getMdQuestionsForStudent(2024)));
  rows.push(await mark("student 2024 warm", () => store.getMdQuestionsForStudent(2024)));
  rows.push(await mark("withKeys 2024 (upgrade)", () => store.getMdQuestionsWithKeys(2024)));
  rows.push(await mark("withKeys 2024 warm", () => store.getMdQuestionsWithKeys(2024)));
  const keys = (await store.getMdQuestionsForStudent(2024)).slice(0, 10).map((q) => q.questionKey);
  rows.push(await mark("byKeys 10", () => store.getMdQuestionsByKeys(2024, keys, true)));
  rows.push(await mark("byKeys 10 warm", () => store.getMdQuestionsByKeys(2024, keys, true)));

  console.log(JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
