#!/usr/bin/env node
/**
 * API-level E2E against production (or BASE_URL).
 * Covers auth, exam start, answer, multi-correct, figures, checkpoint,
 * proctor, submit lock, examiner approve, results fields, retake.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "https://neet-cbt-mock.vercel.app";
const jar = new Map(); // name -> value per role jar key

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

async function req(jarKey, method, urlPath, body) {
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
  return { status: res.status, json, text, headers: res.headers };
}

function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail: String(detail).slice(0, 400) });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${id}  ${name}${detail ? " — " + String(detail).slice(0, 160) : ""}`);
}

async function fetchBytes(urlPath) {
  const res = await fetch(`${BASE}${urlPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, ctype: res.headers.get("content-type") || "" };
}

async function main() {
  const stamp = Date.now();
  const email = `e2e+${stamp}@test.local`;
  const password = "Test@12345";

  // 1 landing
  {
    const res = await fetch(BASE);
    const html = await res.text();
    const notebook =
      html.includes("landing-root") ||
      html.includes("NEET CBT Mock") ||
      html.includes("landing-paper");
    record("S1", "Landing page loads (notebook hero)", res.status === 200 && notebook, `status=${res.status} notebook=${notebook}`);
  }

  // 2 signup
  {
    const r = await req("student", "POST", "/api/auth/signup", {
      name: "E2E Student",
      email,
      password,
    });
    record("S2", "Student signup", r.status === 200 && r.json?.ok, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // 2b login demo (also)
  {
    const r = await req("demo", "POST", "/api/auth/login", {
      email: "student@neet.local",
      password: "Student@123",
    });
    record("S2b", "Demo student login", r.status === 200 && r.json?.ok, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // 3 dashboard HTML for new student
  {
    const r = await req("student", "GET", "/dashboard");
    const html = r.text || "";
    const hasYears = /2016|2017|2024|2025/.test(html);
    record("S3", "Dashboard year picker (HTML)", r.status === 200 && hasYears, `status=${r.status} years=${hasYears}`);
  }

  // 4 start exam 2024
  let attemptId = null;
  {
    const r = await req("student", "POST", "/api/attempts/start", { year: 2024, retake: true });
    attemptId = r.json?.attemptId || null;
    record("S4", "Start exam year 2024", r.status === 200 && !!attemptId, `${r.status} ${JSON.stringify(r.json)}`);
  }

  if (!attemptId) {
    console.error("Cannot continue without attemptId");
    printSummary();
    process.exit(1);
  }

  // 5 exam page loads (fullscreen is client-only — check page has exam markers)
  {
    const r = await req("student", "GET", `/exam/${attemptId}`);
    const html = r.text || "";
    const ok =
      r.status === 200 &&
      (/ExamCbt|question|palette|fullscreen|Remaining|Physics|Biology/i.test(html) ||
        html.includes(attemptId));
    record("S5", "Exam page SSR loads", ok, `status=${r.status} len=${html.length}`);
  }

  // Fetch attempt payload
  let questions = [];
  let attemptMeta = null;
  {
    const r = await req("student", "GET", `/api/attempts/${attemptId}`);
    questions = r.json?.questions || [];
    attemptMeta = r.json?.attempt || null;
    record(
      "S6",
      "Attempt payload + timer ends_at",
      r.status === 200 && questions.length > 0 && !!attemptMeta?.ends_at,
      `qs=${questions.length} ends=${attemptMeta?.ends_at} remaining fields ok`,
    );
  }

  // 7 subjects/sections present
  {
    const subjects = new Set(questions.map((q) => q.subject));
    const sections = new Set(questions.map((q) => q.section));
    record(
      "S7",
      "Subject/section fields on questions",
      subjects.has("Physics") && subjects.has("Chemistry") && subjects.has("Biology") && sections.has("A"),
      `subjects=${[...subjects]} sections=${[...sections]}`,
    );
  }

  // 8/9 answer + mark statuses
  const q0 = questions[0];
  const q1 = questions[1];
  {
    const r = await req("student", "POST", `/api/attempts/${attemptId}/answer`, {
      questionId: q0.id,
      selectedOption: "1",
      status: "attempted",
    });
    record("S8a", "Answer question (attempted)", r.status === 200 && r.json?.ok, `${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req("student", "POST", `/api/attempts/${attemptId}/answer`, {
      questionId: q1.id,
      selectedOption: "2",
      status: "marked",
    });
    record("S8b", "Mark for review", r.status === 200 && r.json?.ok, `${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req("student", "GET", `/api/attempts/${attemptId}`);
    const a0 = r.json.questions.find((q) => q.id === q0.id);
    const a1 = r.json.questions.find((q) => q.id === q1.id);
    record(
      "S9",
      "Palette statuses persist (attempted/marked)",
      a0?.status === "attempted" && a0?.selectedOption === "1" && a1?.status === "marked",
      `q0=${a0?.status}/${a0?.selectedOption} q1=${a1?.status}/${a1?.selectedOption}`,
    );
  }

  // 10 figures
  {
    const withFig = questions.filter((q) => q.figureSrc && String(q.figureSrc).endsWith(".png"));
    let okFetch = false;
    let detail = `count=${withFig.length}`;
    if (withFig.length) {
      const f = withFig.find((q) => q.number === 1) || withFig[0];
      const img = await fetchBytes(f.figureSrc);
      const isPng = img.buf[0] === 0x89 && img.buf[1] === 0x50;
      okFetch = img.status === 200 && isPng && img.buf.length > 2000;
      detail += ` Q${f.number} ${f.figureSrc} bytes=${img.buf.length} png=${isPng}`;
    }
    record("S10", "Diagram figureSrc PNG loads", withFig.length > 0 && okFetch, detail);
  }

  // 11 symbols / KaTeX CSS present on exam page
  {
    const r = await req("student", "GET", `/exam/${attemptId}`);
    const html = r.text || "";
    const hasKatex = /katex/i.test(html);
    // also check a stem with μ or π or √ or latex-ish in API
    const stemHit = questions.some((q) => /[μπ√°]|\\frac|Omega|ohm|\\times/i.test(q.stem + JSON.stringify(q.options)));
    record("S11", "KaTeX assets + symbolic stems present", hasKatex || stemHit, `katex=${hasKatex} stemHit=${stemHit}`);
  }

  // 12 multi-correct
  {
    const mc = questions.find((q) => q.multiCorrect);
    if (!mc) {
      record("S12", "Multi-correct question present", false, "no multiCorrect:true in 2024 payload");
    } else {
      const r = await req("student", "POST", `/api/attempts/${attemptId}/answer`, {
        questionId: mc.id,
        selectedOptions: ["1", "3"],
        status: "attempted",
      });
      const g = await req("student", "GET", `/api/attempts/${attemptId}`);
      const saved = g.json.questions.find((q) => q.id === mc.id);
      const opts = saved?.selectedOptions || [];
      record(
        "S12",
        "Multi-correct select subset",
        r.status === 200 &&
          r.json?.ok &&
          Array.isArray(opts) &&
          opts.includes("1") &&
          opts.includes("3"),
        `Q${mc.number} status=${r.status} selectedOptions=${JSON.stringify(opts)}`,
      );
    }
  }

  // 13 checkpoint
  {
    const r = await req("student", "POST", `/api/attempts/${attemptId}/checkpoint`, {
      currentQuestionIndex: 5,
      subjectFilter: "Physics",
      sectionFilter: "A",
    });
    const g = await req("student", "GET", `/api/attempts/${attemptId}/checkpoint`);
    const resume = await req("student", "POST", "/api/attempts/start", { year: 2024 });
    record(
      "S13",
      "Checkpoint save + resume in_progress",
      r.status === 200 &&
        resume.json?.resumed === true &&
        resume.json?.attemptId === attemptId &&
        (g.status === 200 || g.status === 404),
      `ckpt=${r.status} get=${g.status} resume=${JSON.stringify(resume.json)}`,
    );
  }

  // proctor screen switch
  {
    const bad = await req("student", "POST", `/api/attempts/${attemptId}/proctor`, {
      event: "fullscreen_exit",
    });
    const r = await req("student", "POST", `/api/attempts/${attemptId}/proctor`, {
      reason: "fullscreen_exit",
    });
    const g = await req("student", "GET", `/api/attempts/${attemptId}`);
    const count = g.json?.attempt?.screenSwitchCount ?? 0;
    record(
      "S14p",
      "Proctor screen-switch increment",
      bad.status === 400 && r.status === 200 && count >= 1,
      `bad=${bad.status} post=${r.status} count=${count}`,
    );
  }

  // 14 submit lock
  {
    const r = await req("student", "POST", `/api/attempts/${attemptId}/submit`);
    const locked = await req("student", "POST", `/api/attempts/${attemptId}/answer`, {
      questionId: q0.id,
      selectedOption: "2",
      status: "attempted",
    });
    record(
      "S14",
      "Submit locks attempt",
      r.status === 200 && r.json?.locked === true && locked.status === 409,
      `submit=${JSON.stringify(r.json)} answerAfter=${locked.status}`,
    );
  }

  // Examiner
  {
    const r = await req("examiner", "POST", "/api/auth/login", {
      email: "examiner@neet.local",
      password: "Examiner@123",
    });
    record("E15", "Examiner login", r.status === 200 && r.json?.role === "examiner", `${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req("examiner", "GET", "/api/examiner/attempts");
    const list = r.json?.attempts || r.json || [];
    const arr = Array.isArray(list) ? list : list.items || [];
    const found = arr.find((a) => String(a.id || a._id) === attemptId || String(a.attemptId) === attemptId);
    const anySubmitted = arr.some((a) => a.status === "submitted");
    const switches = found?.screenSwitchCount ?? 0;
    record(
      "E16",
      "Examiner sees submitted attempts + screen switches",
      r.status === 200 && Boolean(found || anySubmitted) && switches >= 1,
      `count=${arr.length} found=${!!found} switches=${switches}`,
    );
  }
  {
    const r = await req("examiner", "POST", `/api/examiner/attempts/${attemptId}/approve`);
    record("E17", "Examiner approve attempt", r.status === 200 && r.json?.ok, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // Post-approval student
  {
    const r = await req("student", "GET", `/api/attempts/${attemptId}`);
    const a = r.json?.attempt;
    const qs = r.json?.questions || [];
    const hasCorrect = qs.some((q) => q.correctOption != null);
    record(
      "R18",
      "Results payload after approve",
      r.status === 200 && a?.status === "approved" && a?.score != null,
      `status=${a?.status} score=${a?.score} rank=${a?.estimated_rank} pct=${a?.percentile}`,
    );
    record(
      "R19",
      "Chosen vs correct revealed",
      hasCorrect && qs.some((q) => "isCorrect" in q || q.correctOption),
      `withCorrectOption=${qs.filter((q) => q.correctOption).length}`,
    );
    record(
      "R20",
      "Rank / analytics fields",
      a?.estimated_rank != null && a?.percentile != null && a?.subject_stats != null,
      `rank=${a?.estimated_rank} pct=${a?.percentile} subjects=${!!a?.subject_stats} topics=${!!a?.topic_stats}`,
    );
  }
  {
    const page = await req("student", "GET", `/results/${attemptId}`);
    record("R20b", "Results page HTML loads", page.status === 200, `status=${page.status} len=${(page.text || "").length}`);
  }
  {
    const r = await req("student", "POST", "/api/attempts/start", { year: 2024, retake: true });
    record(
      "R21",
      "Retake after approval",
      r.status === 200 && r.json?.attemptId && r.json.attemptId !== attemptId,
      `${r.status} ${JSON.stringify(r.json)}`,
    );
    // cleanup: submit the retake so we don't leave dangling in_progress if possible
    if (r.json?.attemptId) {
      await req("student", "POST", `/api/attempts/${r.json.attemptId}/submit`);
    }
  }

  printSummary();
}

function printSummary() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log("\n=== SUMMARY ===");
  console.log(`PASS ${pass}  FAIL ${fail}  TOTAL ${results.length}`);
  console.log(JSON.stringify({ base: BASE, pass, fail, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
