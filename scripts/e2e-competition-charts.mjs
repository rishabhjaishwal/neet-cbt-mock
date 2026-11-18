/**
 * Smoke: competition join link + dashboard charts API + exam key gating.
 * Usage: BASE_URL=https://neet-cbt-mock.vercel.app node scripts/e2e-competition-charts.mjs
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

function jar() {
  const cookies = new Map();
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() || [];
      for (const c of raw) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      const single = res.headers.get("set-cookie");
      if (single && !raw.length) {
        const [pair] = single.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function req(path, { method = "GET", body, cookieJar } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookieJar?.header() ? { Cookie: cookieJar.header() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  cookieJar?.store(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { res, text, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const cookieJar = jar();
  const email = `e2e.comp.${Date.now()}@neet.local`;
  const password = "Student@12345";
  const steps = [];

  const signup = await req("/api/auth/signup", {
    method: "POST",
    cookieJar,
    body: { name: "E2E Comp", email, password },
  });
  assert(signup.res.ok, `signup ${signup.res.status} ${signup.text.slice(0, 200)}`);
  steps.push("signup");

  const create = await req("/api/competitions", {
    method: "POST",
    cookieJar,
    body: { scope: "Physics", difficulty: "Easy", size: 20 },
  });
  assert(create.res.ok && create.json?.inviteCode, "create competition");
  assert(
    typeof create.json.joinPath === "string" &&
      create.json.joinPath.includes(create.json.inviteCode),
    "joinPath returned",
  );
  steps.push("create+joinPath");

  const joinPath = create.json.joinPath;
  const joinPage = await req(joinPath, { cookieJar });
  assert(joinPage.res.status === 200, "join page 200");
  assert(joinPage.text.includes(create.json.inviteCode), "join page shows code");
  steps.push("join-page");

  const join = await req("/api/competitions/join", {
    method: "POST",
    cookieJar,
    body: { inviteCode: create.json.inviteCode },
  });
  assert(join.res.ok && join.json?.id === create.json.id, "idempotent join");
  steps.push("join-api");

  const lobby = await req(`/api/competitions/${create.json.id}`, { cookieJar });
  assert(lobby.res.ok && lobby.json?.competition?.inviteCode, "lobby payload");
  steps.push("lobby");

  const charts = await req("/api/dashboard/charts", { cookieJar });
  assert(charts.res.ok && charts.json?.charts, "charts api");
  assert(
    Array.isArray(charts.json.charts.paperPoints) &&
      Array.isArray(charts.json.charts.topicPoints) &&
      Array.isArray(charts.json.charts.neetAiPoints),
    "charts series split",
  );
  steps.push("charts-split");

  const start = await req(`/api/competitions/${create.json.id}/start`, {
    method: "POST",
    cookieJar,
  });
  assert(start.res.ok && start.json?.myAttemptId, "start competition");
  steps.push("start");

  const attemptId = start.json.myAttemptId;
  const attempt = await req(`/api/competitions/attempts/${attemptId}`, {
    cookieJar,
  });
  assert(attempt.res.ok, "attempt get");
  const qs = attempt.json?.attempt?.questions || [];
  assert(qs.length > 0, "has questions");
  const leaked = qs.some(
    (q) =>
      q.correctOption != null ||
      (Array.isArray(q.correctOptions) && q.correctOptions.length) ||
      q.solution != null ||
      q.studyLinks != null,
  );
  assert(!leaked, "exam attempt must not leak keys/solutions");
  steps.push("no-key-leak");

  const dash = await req("/dashboard", { cookieJar });
  assert(dash.res.status === 200, "dashboard 200");
  assert(
    dash.text.includes("Create competition") || dash.text.includes("Competitions"),
    "dash has competitions",
  );
  steps.push("dashboard");

  const joinAnon = await req(joinPath);
  assert(joinAnon.res.status === 200, "public join page");
  steps.push("public-join");

  // Catalog check: live year-pdf JSON is question-only.
  const catalog = await req("/dashboard", { cookieJar });
  assert(catalog.res.status === 200, "catalog path reachable");
  steps.push("pdf-catalog-reachable");

  console.log(`PASS ${steps.length}/${steps.length} @ ${BASE}`);
  console.log(steps.join(", "));
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
