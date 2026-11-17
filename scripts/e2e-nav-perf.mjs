#!/usr/bin/env node
/**
 * Single-user open/back/forward + API timing smoke against BASE_URL.
 */
const BASE = process.env.BASE_URL || "https://neet-cbt-mock.vercel.app";
const jar = new Map();
const findings = [];

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    if (i > 0) jar.set(nv.slice(0, i), nv.slice(i + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - t0;
    findings.push({ label, ok: true, ms, detail: out?.detail || "" });
    console.log(`PASS  ${label}  ${ms}ms  ${out?.detail || ""}`);
    return out;
  } catch (e) {
    const ms = Date.now() - t0;
    findings.push({ label, ok: false, ms, detail: String(e.message || e) });
    console.log(`FAIL  ${label}  ${ms}ms  ${e.message || e}`);
    return null;
  }
}

async function req(method, path, body) {
  const headers = { Accept: "application/json, text/html" };
  const ck = cookieHeader();
  if (ck) headers.Cookie = ck;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
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
  return { status: res.status, json, text, headers: res.headers };
}

async function main() {
  console.log("BASE", BASE);

  await timed("landing HTML", async () => {
    const r = await req("GET", "/");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return { detail: `len=${r.text.length}` };
  });

  await timed("login page", async () => {
    const r = await req("GET", "/login");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return { detail: `len=${r.text.length}` };
  });

  await timed("signup+login", async () => {
    const email = `perf+${Date.now()}@test.local`;
    const password = "Test@12345";
    const s = await req("POST", "/api/auth/signup", {
      name: "Perf Student",
      email,
      password,
    });
    if (s.status !== 200 || !s.json?.ok) throw new Error(JSON.stringify(s.json));
    return { detail: email };
  });

  await timed("dashboard HTML (post-auth)", async () => {
    const r = await req("GET", "/dashboard");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!/Topic-wise|Choose a year|Start/i.test(r.text)) {
      throw new Error("dashboard markers missing");
    }
    return { detail: `len=${r.text.length}` };
  });

  await timed("topic-series HTML", async () => {
    const r = await req("GET", "/topic-series");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!/Topic-wise mock series/i.test(r.text)) throw new Error("missing heading");
    return { detail: `len=${r.text.length}` };
  });

  await timed("topic-series API", async () => {
    const r = await req("GET", "/api/topic-series");
    if (r.status !== 200 || !r.json?.topics?.length) {
      throw new Error(JSON.stringify(r.json));
    }
    return { detail: `topics=${r.json.topics.length}` };
  });

  // open / back simulation: dashboard -> topic-series -> dashboard
  await timed("nav open dashboard again", async () => {
    const r = await req("GET", "/dashboard");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return { detail: "ok" };
  });

  let attemptId = null;
  await timed("start exam 2024", async () => {
    const r = await req("POST", "/api/attempts/start", { year: 2024, retake: true });
    attemptId = r.json?.attemptId;
    if (!attemptId) throw new Error(JSON.stringify(r.json));
    return { detail: attemptId };
  });

  await timed("exam page SSR", async () => {
    const r = await req("GET", `/exam/${attemptId}`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return { detail: `len=${r.text.length}` };
  });

  let q0 = null;
  await timed("GET attempt (questions)", async () => {
    const g = await req("GET", `/api/attempts/${attemptId}`);
    q0 = g.json?.questions?.[0];
    if (!q0) throw new Error("no questions");
    return { detail: `questions=${g.json.questions.length}` };
  });

  await timed("checkpoint POST", async () => {
    const c = await req("POST", `/api/attempts/${attemptId}/checkpoint`, {
      answers: [
        {
          questionId: q0.id,
          questionKey: q0.questionKey,
          selectedOption: "1",
          selectedOptions: ["1"],
          status: "attempted",
        },
      ],
      currentQuestionIndex: 0,
    });
    if (c.status !== 200 || !c.json?.ok) throw new Error(JSON.stringify(c.json));
    return { detail: `applied=${c.json.applied}` };
  });

  await timed("checkpoint POST warm", async () => {
    const c = await req("POST", `/api/attempts/${attemptId}/checkpoint`, {
      answers: [
        {
          questionId: q0.id,
          questionKey: q0.questionKey,
          selectedOption: "2",
          selectedOptions: ["2"],
          status: "attempted",
        },
      ],
      currentQuestionIndex: 0,
    });
    if (c.status !== 200 || !c.json?.ok) throw new Error(JSON.stringify(c.json));
    return { detail: `applied=${c.json.applied}` };
  });

  await timed("submit + results HTML", async () => {
    const s = await req("POST", `/api/attempts/${attemptId}/submit`, {});
    if (s.status !== 200) throw new Error(JSON.stringify(s.json));
    const r = await req("GET", `/results/${attemptId}`);
    if (r.status !== 200) throw new Error(`results ${r.status}`);
    const hasCharts =
      /Outcome mix|Pros & cons|Subject stacked|AI NEET|Question review/i.test(
        r.text,
      );
    if (!hasCharts) throw new Error("results charts/solution markers missing");
    if (!/Showing\s+\d+[–-]\d+\s+of\s+\d+\s+solutions/i.test(r.text)) {
      throw new Error("results pagination marker missing");
    }
    if (!/page 1\//i.test(r.text) && !/\(200\)/.test(r.text)) {
      // 200-Q paper should show pager or full count chip
      throw new Error("expected multi-page review or 200 count");
    }
    return { detail: `score=${s.json.score} charts=yes paginated=yes` };
  });

  await timed("results page 2 HTML", async () => {
    const r = await req("GET", `/results/${attemptId}?page=2#review`);
    if (r.status !== 200) throw new Error(`results p2 ${r.status}`);
    if (!/Showing\s+11[–-]20\s+of/i.test(r.text)) {
      throw new Error("page 2 range missing");
    }
    if (!/AI NEET-style solution/i.test(r.text)) {
      throw new Error("page 2 solutions missing");
    }
    return { detail: "page2=ok" };
  });

  await timed("results wrong filter", async () => {
    const r = await req("GET", `/results/${attemptId}?outcome=wrong`);
    if (r.status !== 200) throw new Error(`results filter ${r.status}`);
    if (!/Showing\s+\d+[–-]\d+\s+of\s+\d+\s+solutions/i.test(r.text)) {
      throw new Error("filtered pagination missing");
    }
    return { detail: "filter=wrong ok" };
  });

  // second dashboard hit (warm path)
  await timed("dashboard warm", async () => {
    const r = await req("GET", "/dashboard");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return { detail: "ok" };
  });

  const pass = findings.filter((f) => f.ok).length;
  const fail = findings.filter((f) => !f.ok).length;
  const slow = findings.filter((f) => f.ok && f.ms > 3000);
  console.log("\n=== NAV PERF SUMMARY ===");
  console.log(JSON.stringify({ base: BASE, pass, fail, slow, findings }, null, 2));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
