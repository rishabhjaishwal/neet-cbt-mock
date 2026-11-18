#!/usr/bin/env node
/**
 * E2E: NEET AI Easy / Medium / Hard start → answer → submit → results.
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/e2e-neet-ai.mjs
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const jar = new Map();
const results = [];

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    if (i > 0) jar.set(nv.slice(0, i), nv.slice(i + 1));
  }
}
async function req(method, urlPath, body) {
  const headers = { Accept: "application/json" };
  const ck = cookieHeader();
  if (ck) headers.Cookie = ck;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text };
}
function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail: String(detail).slice(0, 400) });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? " — " + String(detail).slice(0, 160) : ""}`,
  );
}

async function runDifficulty(diff) {
  const start = await req("POST", "/api/neet-ai/start", {
    difficulty: diff,
    sequence: 1,
  });
  record(
    `${diff}-start`,
    `Start ${diff}`,
    start.status === 200 && start.json?.attemptId,
    `${start.status} ${start.json?.error || start.json?.attemptId || ""}`,
  );
  if (!(start.status === 200 && start.json?.attemptId)) return null;
  const id = start.json.attemptId;

  const get = await req("GET", `/api/neet-ai/${id}`);
  const questions = get.json?.questions || [];
  record(
    `${diff}-load`,
    `Load ${diff} exam`,
    get.status === 200 && questions.length === 30,
    `q=${questions.length}`,
  );

  const answers = questions.slice(0, 12).map((q, i) => ({
    questionKey: q.questionKey,
    selectedOption: String((i % 4) + 1),
    selectedOptions: [String((i % 4) + 1)],
    status: "attempted",
  }));
  // leave rest unattempted via omit

  const submit = await req("POST", `/api/neet-ai/${id}/submit`, { answers });
  record(
    `${diff}-submit`,
    `Submit ${diff}`,
    submit.status === 200 && submit.json?.ok,
    `score=${submit.json?.score} c=${submit.json?.correctCount} w=${submit.json?.wrongCount} u=${submit.json?.unattemptedCount}`,
  );

  const resultsHtml = await fetch(`${BASE}/neet-ai/results/${id}`, {
    headers: { Cookie: cookieHeader(), Accept: "text/html" },
    redirect: "manual",
  });
  const html = await resultsHtml.text();
  record(
    `${diff}-results`,
    `Results page ${diff}`,
    resultsHtml.status === 200 &&
      /Hence proved|Solution|NCERT|study/i.test(html) &&
      !/Correct Answer:\s*\([A-D]\)\s*$/m.test(html.slice(0, 500)),
    `status=${resultsHtml.status} len=${html.length}`,
  );
  return id;
}

async function main() {
  console.log(`BASE=${BASE}`);
  const stamp = Date.now();
  const email = `e2e.neetai+${stamp}@test.local`;
  const password = "Test@12345";
  const signup = await req("POST", "/api/auth/signup", {
    name: "E2E NeetAI",
    email,
    password,
  });
  record("A1", "Signup", signup.status === 200 && signup.json?.ok, `${signup.status}`);

  const catalog = await req("GET", "/api/neet-ai");
  record(
    "A2",
    "Catalog",
    catalog.status === 200 &&
      Array.isArray(catalog.json?.catalog) &&
      catalog.json.catalog.length === 3,
    JSON.stringify(catalog.json?.catalog?.map((c) => [c.difficulty, c.packs, c.count])),
  );

  const dash = await fetch(`${BASE}/dashboard`, {
    headers: { Cookie: cookieHeader(), Accept: "text/html" },
  });
  const dashHtml = await dash.text();
  record(
    "A3",
    "Dashboard NEET AI entry",
    dash.status === 200 && /NEET AI/i.test(dashHtml) && /href="\/neet-ai"/i.test(dashHtml),
    `${dash.status}`,
  );

  for (const d of ["Easy", "Medium", "Hard"]) {
    await runDifficulty(d);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
