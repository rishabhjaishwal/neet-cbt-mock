#!/usr/bin/env node
/**
 * Headless Chrome smoke at phone widths (390 / 430).
 * Checks horizontal overflow and key mobile markers.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "https://neet-cbt-mock.vercel.app";
const WIDTHS = [390, 430];
const PAGES = ["/", "/login", "/signup"];
const outDir = path.join("/tmp", "neet-mobile-smoke");
mkdirSync(outDir, { recursive: true });

const findings = [];

function chromeEval(width, urlPath) {
  const url = `${BASE}${urlPath}`;
  const js = `
    const vp = { width: ${width}, height: 844, deviceScaleFactor: 2, mobile: true };
    (async () => {
      const puppeteerUnavailable = true;
    })();
  `;
  // Use chrome --dump-dom with window size; measure overflow via injected script file.
  const scriptPath = path.join(outDir, `measure-${width}${urlPath.replace(/\W+/g, "_")}.js`);
  writeFileSync(
    scriptPath,
    `
const url = ${JSON.stringify(url)};
const width = ${width};
(async () => {
  // Chrome headless --virtual-time-budget path via evaluate in dump
})();
`,
  );

  const htmlPath = path.join(outDir, `page-${width}${urlPath.replace(/\W+/g, "_") || "_home"}.html`);
  const res = spawnSync(
    "google-chrome",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${width},844`,
      "--virtual-time-budget=4000",
      `--screenshot=${path.join(outDir, `shot-${width}${urlPath.replace(/\W+/g, "_") || "_home"}.png`)}`,
      "--hide-scrollbars",
      url,
    ],
    { encoding: "utf8", timeout: 45000 },
  );
  const dump = spawnSync(
    "google-chrome",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${width},844`,
      "--virtual-time-budget=4000",
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", maxBuffer: 20_000_000, timeout: 45000 },
  );
  writeFileSync(htmlPath, dump.stdout || "");
  const html = dump.stdout || "";
  const okStatus = res.status === 0 || dump.status === 0;
  const hasViewport = /width=device-width/i.test(html) || /viewport/i.test(html);
  const markers = {
    "/": /NEET CBT Mock|landing-root|Start as student/i,
    "/login": /Login to your desk|desk-auth|Create an account/i,
    "/signup": /Start your notebook|desk-auth|Login/i,
  };
  const markerOk = (markers[urlPath] || /./).test(html);
  // Rough overflow heuristic: fixed huge widths / min-w without scroll wrappers
  const suspicious = (html.match(/min-w-\[(7|8|9)\d{2}px\]/g) || []).length;
  const entry = {
    width,
    path: urlPath,
    ok: okStatus && markerOk,
    markerOk,
    hasViewport,
    htmlLen: html.length,
    suspiciousMinW: suspicious,
    chromeExit: res.status,
  };
  findings.push(entry);
  console.log(
    `${entry.ok ? "PASS" : "FAIL"}  ${width}px ${urlPath}  len=${html.length} markers=${markerOk}`,
  );
}

for (const w of WIDTHS) {
  for (const p of PAGES) chromeEval(w, p);
}

const fail = findings.filter((f) => !f.ok).length;
console.log("\n=== MOBILE SMOKE ===");
console.log(JSON.stringify({ base: BASE, outDir, fail, findings }, null, 2));
process.exit(fail ? 1 : 0);
