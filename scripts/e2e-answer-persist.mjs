#!/usr/bin/env node
/**
 * Focused E2E: answers must survive checkpoint races + submit-with-pending.
 * Simulates throttled/offline-ish client behavior (flush fail → submit body).
 */
const BASE = process.env.BASE_URL || "https://neet-cbt-mock.vercel.app";
const jar = new Map();
const results = [];

function cookieHeader(jarKey) {
  const m = jar.get(jarKey) || new Map();
  return [...m.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(jarKey, res) {
  const raw = res.headers.getSetCookie?.() || [];
  const m = jar.get(jarKey) || new Map();
  for (const c of raw) {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    if (i > 0) m.set(nv.slice(0, i), nv.slice(i + 1));
  }
  jar.set(jarKey, m);
}

async function req(jarKey, method, urlPath, body, { slowMs = 0 } = {}) {
  if (slowMs) await new Promise((r) => setTimeout(r, slowMs));
  const headers = { Accept: "application/json" };
  const ck = cookieHeader(jarKey);
  if (ck) headers.Cookie = ck;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  storeCookies(jarKey, res);
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
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`,
  );
}

function isAttempted(q) {
  const opts =
    Array.isArray(q.selectedOptions) && q.selectedOptions.length
      ? q.selectedOptions
      : q.selectedOption
        ? [q.selectedOption]
        : [];
  return q.status !== "not_attempted" && opts.length > 0;
}

async function main() {
  const stamp = Date.now();
  const email = `persist+${stamp}@test.local`;
  const password = "Test@12345";

  {
    const r = await req("s", "POST", "/api/auth/signup", {
      name: "Persist Student",
      email,
      password,
    });
    record("P1", "Signup", r.status === 200 && r.json?.ok, `${r.status}`);
  }

  let attemptId = null;
  {
    const r = await req("s", "POST", "/api/attempts/start", {
      year: 2024,
      retake: true,
    });
    attemptId = r.json?.attemptId || null;
    record("P2", "Start attempt", !!attemptId, `${r.status} ${attemptId}`);
  }
  if (!attemptId) {
    printSummary();
    process.exit(1);
  }

  const payload = await req("s", "GET", `/api/attempts/${attemptId}`);
  const questions = payload.json?.questions || [];
  record("P3", "Load questions", questions.length >= 180, `n=${questions.length}`);

  // Prefer Section A Physics (no 10-cap) for bulk answers
  const sectionA = questions.filter(
    (q) => String(q.section).toUpperCase() === "A" && q.subject === "Physics",
  );
  const bulk = sectionA.slice(0, 25);
  const answers = bulk.map((q, i) => ({
    questionId: q.id,
    questionKey: q.questionKey || undefined,
    selectedOption: String((i % 4) + 1),
    selectedOptions: [String((i % 4) + 1)],
    status: "attempted",
  }));

  // Batch checkpoint (partial-apply server)
  {
    const r = await req("s", "POST", `/api/attempts/${attemptId}/checkpoint`, {
      answers,
      currentQuestionIndex: 10,
    });
    const applied = r.json?.applied ?? -1;
    record(
      "P4",
      "Batch checkpoint applies many answers",
      r.status === 200 && applied >= 20,
      `status=${r.status} applied=${applied} rejected=${r.json?.rejectedCount}`,
    );
  }

  {
    const g = await req("s", "GET", `/api/attempts/${attemptId}/checkpoint`);
    const saved = (g.json?.answers || []).filter(isAttempted);
    record(
      "P5",
      "Checkpoint GET shows attempted",
      saved.length >= 20,
      `attempted=${saved.length}`,
    );
  }

  // Second attempt: answers only via submit body (simulate failed flush)
  {
    const r2 = await req("s", "POST", "/api/attempts/start", {
      year: 2025,
      retake: true,
    });
    const id2 = r2.json?.attemptId;
    record("P6", "Start second year attempt", !!id2, `${r2.status}`);
    if (id2) {
      const p2 = await req("s", "GET", `/api/attempts/${id2}`);
      const qs2 = p2.json?.questions || [];
      const aQs = qs2
        .filter((q) => String(q.section).toUpperCase() === "A")
        .slice(0, 30);
      const pending = aQs.map((q, i) => ({
        questionId: q.id,
        questionKey: q.questionKey,
        selectedOption: "1",
        selectedOptions: ["1"],
        status: "attempted",
      }));

      // Deliberately skip checkpoint — submit carries pending (race/offline path)
      await new Promise((r) => setTimeout(r, 250)); // mild throttle
      const sub = await req("s", "POST", `/api/attempts/${id2}/submit`, {
        answers: pending,
      });
      const merged = sub.json?.merged ?? 0;
      const un = sub.json?.unattemptedCount;
      const expectedUnMax = qs2.length - 25; // allow a few rejects
      record(
        "P7",
        "Submit-with-pending merges answers",
        sub.status === 200 &&
          sub.json?.status === "approved" &&
          merged >= 25 &&
          typeof un === "number" &&
          un <= expectedUnMax,
        `merged=${merged} unattempted=${un} score=${sub.json?.score} expectedUnMax=${expectedUnMax}`,
      );

      const review = await req("s", "GET", `/api/attempts/${id2}`);
      const attempted = (review.json?.questions || []).filter(isAttempted).length;
      record(
        "P8",
        "Results API shows attempted after submit-merge",
        attempted >= 25,
        `attempted=${attempted} unattempted_count=${review.json?.attempt?.unattempted_count}`,
      );

      const html = await req("s", "GET", `/results/${id2}`);
      const unattemptedLabel = (html.text || "").match(/Unattempted/gi)?.length || 0;
      // Page always mentions the word; ensure score/review present and not all blank
      record(
        "P9",
        "Results HTML loads with score",
        html.status === 200 && /score|marks|correct/i.test(html.text || ""),
        `status=${html.status} Unattempted mentions=${unattemptedLabel}`,
      );
    }
  }

  // questionKey-only checkpoint (ObjectId omitted — reseed-safe path)
  {
    const r3 = await req("s", "POST", "/api/attempts/start", {
      year: 2023,
      retake: true,
    });
    const id3 = r3.json?.attemptId;
    if (id3) {
      const p3 = await req("s", "GET", `/api/attempts/${id3}`);
      const qs3 = p3.json?.questions || [];
      const sample = qs3
        .filter((q) => String(q.section).toUpperCase() === "A")
        .slice(0, 12);
      // Need questionKey on payload — from checkpoint GET after empty, or from answers
      const ck = await req("s", "GET", `/api/attempts/${id3}/checkpoint`);
      const keyById = new Map(
        (ck.json?.answers || []).map((a) => [a.questionId, a.questionKey]),
      );
      const byKey = sample.map((q, i) => ({
        questionKey: keyById.get(q.id) || q.questionKey,
        selectedOption: "2",
        selectedOptions: ["2"],
        status: "attempted",
      })).filter((a) => a.questionKey);

      const cp = await req("s", "POST", `/api/attempts/${id3}/checkpoint`, {
        answers: byKey,
      });
      record(
        "P10",
        "Checkpoint by questionKey only",
        cp.status === 200 && (cp.json?.applied ?? 0) >= 8,
        `applied=${cp.json?.applied} keys=${byKey.length}`,
      );

      const sub = await req("s", "POST", `/api/attempts/${id3}/submit`, {});
      record(
        "P11",
        "Submit after key-based checkpoint",
        sub.status === 200 &&
          typeof sub.json?.unattemptedCount === "number" &&
          sub.json.unattemptedCount <= qs3.length - 8,
        `unattempted=${sub.json?.unattemptedCount} score=${sub.json?.score}`,
      );
    } else {
      record("P10", "Checkpoint by questionKey only", false, "no attempt");
      record("P11", "Submit after key-based checkpoint", false, "no attempt");
    }
  }

  // Finish first attempt so it doesn't linger
  {
    const leftover = await req("s", "POST", `/api/attempts/${attemptId}/submit`, {});
    record(
      "P12",
      "Submit first batch-checkpoint attempt",
      leftover.status === 200 &&
        typeof leftover.json?.unattemptedCount === "number" &&
        leftover.json.unattemptedCount <= questions.length - 20,
      `unattempted=${leftover.json?.unattemptedCount} merged=${leftover.json?.merged}`,
    );
  }

  printSummary();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log("\n=== ANSWER PERSIST SUMMARY ===");
  console.log(`PASS ${pass}  FAIL ${fail}  TOTAL ${results.length}`);
  console.log(JSON.stringify({ base: BASE, pass, fail, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
