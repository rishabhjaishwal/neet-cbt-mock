#!/usr/bin/env node
/**
 * E2E: year paper (~25 answers + submit) + full topic series 30Q submit.
 * Prefers 2025, then 2024. No 2026 paper in catalog.
 *
 * Usage: BASE_URL=https://neet-cbt-mock.vercel.app node scripts/e2e-year-topic-run.mjs
 */
const BASE = process.env.BASE_URL || "https://neet-cbt-mock.vercel.app";
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
  results.push({ id, name, pass, detail: String(detail).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? " — " + String(detail).slice(0, 180) : ""}`);
}

async function pickYear() {
  for (const year of [2025, 2024, 2023]) {
    const r = await req("POST", "/api/attempts/start", { year, retake: true });
    if (r.status === 200 && r.json?.attemptId) return { year, attemptId: r.json.attemptId, raw: r };
  }
  return null;
}

async function main() {
  console.log(`BASE=${BASE}`);
  const stamp = Date.now();
  const email = `e2e.yt+${stamp}@test.local`;
  const password = "Test@12345";

  {
    const r = await req("POST", "/api/auth/signup", {
      name: "E2E YearTopic",
      email,
      password,
    });
    record("A1", "Signup", r.status === 200 && r.json?.ok, `${r.status}`);
    if (!(r.status === 200 && r.json?.ok)) {
      const login = await req("POST", "/api/auth/login", { email, password });
      record("A1b", "Login fallback", login.status === 200 && login.json?.ok, `${login.status}`);
    }
  }

  // Theme assets — check unauthenticated landing (no cookies)
  {
    const res = await fetch(BASE + "/", { redirect: "manual" });
    // If somehow redirected, still fetch login which always has ThemeToggle
    const target =
      res.status >= 300 && res.status < 400
        ? await fetch(BASE + "/login", { redirect: "follow" })
        : res.status === 200
          ? res
          : await fetch(BASE + "/login", { redirect: "follow" });
    const html = await target.text();
    const hasDark =
      html.includes("neet-cbt-theme") ||
      html.includes("theme-toggle") ||
      html.includes("ThemeToggle") ||
      html.includes("landing-root") ||
      html.includes("desk-auth-card") ||
      /html\.dark|data-theme/.test(html);
    record(
      "A0",
      "Landing/login dark-mode ready",
      target.status === 200 && hasDark,
      `status=${target.status} via=${res.status}`,
    );
  }

  const picked = await pickYear();
  if (!picked) {
    record("Y0", "Start year paper (2025/2024/2023)", false, "no attemptId");
    printSummary();
    process.exit(1);
  }
  record("Y0", `Start year paper ${picked.year}`, true, picked.attemptId);
  const { year, attemptId } = picked;

  const get = await req("GET", `/api/attempts/${attemptId}`);
  const questions = get.json?.questions || [];
  record("Y1", "Attempt questions loaded", questions.length >= 80, `n=${questions.length}`);

  // View paper URL present on exam page
  {
    const page = await req("GET", `/exam/${attemptId}`);
    const html = page.text || "";
    const hasView =
      /View paper|viewPaper|paperPdf|gview|ALL-PYQ-Papers/i.test(html) ||
      html.includes("ExamPdfPaperPanel") ||
      html.includes("ExamCbt");
    record("Y1b", "Exam page + View paper wiring", page.status === 200 && hasView, `status=${page.status}`);
  }

  const N = Math.min(25, questions.length);
  let answered = 0;
  const batch = [];
  for (let i = 0; i < N; i++) {
    const q = questions[i];
    const opt = q.multiCorrect ? undefined : "1";
    const selectedOptions = q.multiCorrect ? ["1"] : undefined;
    batch.push({
      questionId: q.id,
      questionKey: q.questionKey,
      selectedOption: opt ?? null,
      selectedOptions: selectedOptions ?? (opt ? [opt] : []),
      status: "attempted",
    });
  }
  // Prefer checkpoint with answers if supported; else per-question
  {
    const ck = await req("POST", `/api/attempts/${attemptId}/checkpoint`, {
      currentQuestionIndex: N - 1,
      answers: batch,
    });
    if (ck.status === 200 && ck.json?.ok !== false) {
      answered = N;
      record("Y2", `Checkpoint ${N} answers`, true, `${ck.status}`);
    } else {
      for (let i = 0; i < N; i++) {
        const q = questions[i];
        const body = q.multiCorrect
          ? { questionId: q.id, selectedOptions: ["1"], status: "attempted" }
          : { questionId: q.id, selectedOption: "1", status: "attempted" };
        const r = await req("POST", `/api/attempts/${attemptId}/answer`, body);
        if (r.status === 200) answered++;
      }
      record("Y2", `Answer ${answered}/${N} via /answer`, answered >= 20, `answered=${answered}`);
    }
  }

  {
    const r = await req("POST", `/api/attempts/${attemptId}/submit`);
    const ok =
      r.status === 200 &&
      (r.json?.released === true ||
        r.json?.status === "approved" ||
        r.json?.locked === true ||
        r.json?.ok);
    record("Y3", `Submit year ${year} after ~${answered} Q`, ok, `${r.status} ${JSON.stringify(r.json)}`);
    if (ok) {
      const resultsPage = await req("GET", r.json?.resultsUrl || `/results/${attemptId}`);
      record(
        "Y4",
        "Results page loads",
        resultsPage.status === 200 && /score|correct|results|Physics/i.test(resultsPage.text || ""),
        `status=${resultsPage.status}`,
      );
    }
  }

  // Topic series: catalog + start Easy 30Q + answer all + submit
  {
    const cat = await req("GET", "/api/topic-series");
    const topics = cat.json?.topics || cat.json?.catalog?.topics || [];
    // API may return catalog differently — also try page
    let topicId = topics.find((t) => t.id === "physics-mechanics")?.id;
    if (!topicId && topics[0]) topicId = topics[0].id;
    if (!topicId) {
      // parse from HTML catalog endpoint absence — use known id
      topicId = "physics-mechanics";
    }
    record("T0", "Topic catalog / pick mechanics", !!topicId, topicId);

    const start = await req("POST", "/api/topic-series/start", {
      topicId,
      difficulty: "Easy",
      sequence: 1,
    });
    const topicAttemptId = start.json?.attemptId;
    record(
      "T1",
      "Start topic Easy sequence 1",
      start.status === 200 && !!topicAttemptId,
      `${start.status} ${JSON.stringify(start.json)}`,
    );

    if (!topicAttemptId) {
      printSummary();
      process.exit(results.some((r) => !r.pass) ? 1 : 0);
    }

    const tGet = await req("GET", `/api/topic-series/${topicAttemptId}`);
    const tQuestions = tGet.json?.questions || [];
    record("T2", "Topic attempt has 30 Q", tQuestions.length === 30, `n=${tQuestions.length} get=${tGet.status}`);

    const tBatch = tQuestions.slice(0, 30).map((q) => ({
      questionKey: q.questionKey || q.id,
      selectedOption: "1",
      selectedOptions: ["1"],
      status: "attempted",
    }));
    const tCk = await req("POST", `/api/topic-series/${topicAttemptId}/checkpoint`, {
      currentQuestionIndex: Math.max(0, tBatch.length - 1),
      answers: tBatch,
    });
    record("T3", "Topic checkpoint 30 answers", tCk.status === 200, `${tCk.status} ${JSON.stringify(tCk.json)}`);

    const tSub = await req("POST", `/api/topic-series/${topicAttemptId}/submit`, {
      answers: tBatch,
    });
    const tOk =
      tSub.status === 200 &&
      (tSub.json?.ok || tSub.json?.resultsUrl || typeof tSub.json?.score === "number");
    record("T4", "Submit full topic 30Q", tOk, `${tSub.status} ${JSON.stringify(tSub.json)}`);

    if (tOk) {
      const rp = await req(
        "GET",
        tSub.json?.resultsUrl || `/topic-series/results/${topicAttemptId}`,
      );
      record("T5", "Topic results page", rp.status === 200, `status=${rp.status}`);
    }
  }

  printSummary();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.pass).length;
  console.log(`\nSummary: ${pass}/${results.length} passed`);
  for (const r of results.filter((x) => !x.pass)) {
    console.log(`  FAIL ${r.id}: ${r.name} — ${r.detail}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
