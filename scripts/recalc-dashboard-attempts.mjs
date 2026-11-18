#!/usr/bin/env node
/**
 * Recompute score / subjectStats / topicStats for completed attempts of the
 * real student accounts from stored answers + current MD keys (by questionKey).
 *
 * Targets: arnav@gmail.com + student@neet.local
 *
 * Env: MONGODB_URI, MONGODB_X509_CERT or MONGODB_X509_CERT_PEM, MONGODB_DB
 * Usage: node scripts/recalc-dashboard-attempts.mjs [--dry-run]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const TARGET_EMAILS = ["arnav@gmail.com", "student@neet.local"];

function resolveCertPath() {
  const inline = process.env.MONGODB_X509_CERT_PEM?.trim();
  if (inline) {
    const tmp = path.join(os.tmpdir(), "neet-mongodb-x509.pem");
    const pem = inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
    fs.writeFileSync(tmp, pem, { mode: 0o600 });
    return tmp;
  }
  const raw =
    process.env.MONGODB_X509_CERT?.trim() ||
    "/cursor/stores/self/internal/mongodb-x509.pem";
  return path.isAbsolute(raw) ? raw : path.join(root, raw);
}

function parseOptionList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .map(String)
          .map((s) => s.trim())
          .filter((s) => /^[1-4]$/.test(s)),
      ),
    ].sort();
  }
  const s = String(raw).trim();
  if (!s) return [];
  if (/^[1-4]$/.test(s)) return [s];
  return [
    ...new Set(
      s
        .split(/[,/\s]+/)
        .map((x) => x.trim())
        .filter((x) => /^[1-4]$/.test(x)),
    ),
  ].sort();
}

function scoreSelection(selectedRaw, correctRaw, multiCorrect) {
  const selected = parseOptionList(selectedRaw);
  const correct = parseOptionList(correctRaw);
  if (!selected.length) return { marks: 0, outcome: "unattempted" };
  if (!multiCorrect || correct.length <= 1) {
    const ok =
      selected.length === 1 && correct.length === 1 && selected[0] === correct[0];
    return { marks: ok ? 4 : -1, outcome: ok ? "correct" : "wrong" };
  }
  const correctSet = new Set(correct);
  if (selected.some((s) => !correctSet.has(s))) {
    return { marks: -1, outcome: "wrong" };
  }
  if (
    selected.length === correct.length &&
    selected.every((s, i) => s === correct[i])
  ) {
    return { marks: 4, outcome: "correct" };
  }
  return { marks: Math.min(3, selected.length), outcome: "partial" };
}

function scoreRows(rows) {
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  let partialCount = 0;
  const subjectMap = {};
  const topicMap = new Map();

  for (const a of rows) {
    subjectMap[a.subject] ??= {
      correct: 0,
      wrong: 0,
      unattempted: 0,
      partial: 0,
      accuracy: 0,
    };
    const key = `${a.subject}::${a.topic}`;
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        topic: a.topic,
        subject: a.subject,
        correct: 0,
        wrong: 0,
        unattempted: 0,
        partial: 0,
      });
    }
    const t = topicMap.get(key);
    const multi =
      Boolean(a.multiCorrect) || parseOptionList(a.correctOptions).length > 1;
    const correct = parseOptionList(
      a.correctOptions?.length ? a.correctOptions : a.correctOption,
    );
    const picked =
      a.selectedOptions?.length
        ? a.selectedOptions
        : a.selectedOption
          ? [a.selectedOption]
          : [];
    const selected =
      a.status === "not_attempted" && !picked.length ? [] : picked;
    const { marks, outcome } = scoreSelection(selected, correct, multi);
    score += marks;
    if (outcome === "correct") {
      correctCount++;
      subjectMap[a.subject].correct++;
      t.correct++;
    } else if (outcome === "wrong") {
      wrongCount++;
      subjectMap[a.subject].wrong++;
      t.wrong++;
    } else if (outcome === "partial") {
      partialCount++;
      subjectMap[a.subject].partial++;
      t.partial++;
    } else {
      unattemptedCount++;
      subjectMap[a.subject].unattempted++;
      t.unattempted++;
    }
  }

  for (const s of Object.values(subjectMap)) {
    const tried = s.correct + s.wrong + s.partial;
    s.accuracy = tried
      ? Math.round((1000 * (s.correct + 0.5 * s.partial)) / tried) / 10
      : 0;
  }
  const topicStats = [...topicMap.values()].map((t) => {
    const tried = t.correct + t.wrong + t.partial;
    return {
      ...t,
      accuracy: tried
        ? Math.round((1000 * (t.correct + 0.5 * t.partial)) / tried) / 10
        : 0,
    };
  });

  return {
    score,
    correctCount,
    wrongCount,
    unattemptedCount,
    partialCount,
    subjectStats: subjectMap,
    topicStats,
  };
}

function loadYearByQuestionKey(year) {
  const paperPath = path.join(root, "content", "papers", `neet-${year}.paper.md`);
  const keyPath = path.join(root, "content", "papers", `neet-${year}.key.md`);
  if (!existsSync(paperPath) || !existsSync(keyPath)) return null;
  const paperRaw = readFileSync(paperPath, "utf8");
  const pm = paperRaw.match(/```neet-paper-json\n([\s\S]*?)\n```/);
  if (!pm) return null;
  const paper = JSON.parse(pm[1]);
  const kr = readFileSync(keyPath, "utf8");
  const km =
    kr.match(/```neet-keys-json\n([\s\S]*?)\n```/) ||
    kr.match(/```neet-key-json\n([\s\S]*?)\n```/);
  if (!km) return null;
  const keys = JSON.parse(km[1]).keys || {};
  const byKey = {};
  for (const q of paper.questions || []) {
    const k = keys[q.id] || {};
    byKey[q.id] = {
      subject: q.subject,
      topic: q.topic || `${q.subject} General`,
      correctOption: k.correctOption ?? q.correctOption,
      correctOptions:
        k.correctOptions || (k.correctOption ? [k.correctOption] : undefined),
      multiCorrect: Boolean(k.multiCorrect ?? q.multiCorrect),
    };
  }
  return byKey;
}

async function main() {
  const uri =
    process.env.MONGODB_URI?.trim() ||
    "mongodb+srv://cluster0.ms2kmgu.mongodb.net/?authSource=%24external&authMechanism=MONGODB-X509&compressors=zlib";
  const cert = resolveCertPath();
  await mongoose.connect(uri, {
    tls: true,
    tlsCertificateKeyFile: cert,
    authMechanism: "MONGODB-X509",
    authSource: "$external",
    dbName: process.env.MONGODB_DB?.trim() || "neet_cbt",
  });
  const db = mongoose.connection.db;
  const report = [];

  for (const email of TARGET_EMAILS) {
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      report.push({ email, error: "not found" });
      continue;
    }
    const userReport = { email, name: user.name, papers: [], topics: [] };

    const attempts = await db
      .collection("attempts")
      .find({
        userId: user._id,
        status: { $in: ["submitted", "approved"] },
      })
      .toArray();

    for (const a of attempts) {
      const byKey = loadYearByQuestionKey(a.year);
      if (!byKey) {
        userReport.papers.push({ year: a.year, skipped: "no paper md" });
        continue;
      }
      const rows = [];
      let missingKey = 0;
      for (const ans of a.answers || []) {
        const q = byKey[ans.questionKey];
        if (!q) {
          missingKey++;
          continue;
        }
        rows.push({
          subject: q.subject,
          topic: q.topic,
          correctOption: q.correctOption,
          correctOptions: q.correctOptions,
          multiCorrect: q.multiCorrect,
          selectedOption: ans.selectedOption,
          selectedOptions: ans.selectedOptions,
          status: ans.status,
        });
      }
      const result = scoreRows(rows);
      result.unattemptedCount += missingKey;
      const before = {
        score: a.score,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        unattemptedCount: a.unattemptedCount,
      };
      const changed =
        before.score !== result.score ||
        before.correctCount !== result.correctCount ||
        before.wrongCount !== result.wrongCount ||
        before.unattemptedCount !== result.unattemptedCount;
      if (!dryRun) {
        await db.collection("attempts").updateOne(
          { _id: a._id },
          {
            $set: {
              score: result.score,
              correctCount: result.correctCount,
              wrongCount: result.wrongCount,
              unattemptedCount: result.unattemptedCount,
              subjectStats: result.subjectStats,
              topicStats: {
                ...(a.topicStats || {}),
                topics: result.topicStats,
                partialCount: result.partialCount,
              },
            },
          },
        );
      }
      userReport.papers.push({
        id: String(a._id),
        year: a.year,
        before,
        after: {
          score: result.score,
          correctCount: result.correctCount,
          wrongCount: result.wrongCount,
          unattemptedCount: result.unattemptedCount,
        },
        changed,
        missingKey,
        meaningful:
          result.correctCount + result.wrongCount + result.partialCount > 0,
      });
    }

    const topics = await db
      .collection("topicattempts")
      .find({
        userId: user._id,
        status: { $in: ["submitted", "approved"] },
      })
      .toArray();

    for (const a of topics) {
      const qByKey = Object.fromEntries(
        (a.questions || []).map((q) => [q.questionKey, q]),
      );
      const rows = (a.answers || []).map((ans) => {
        const q = qByKey[ans.questionKey] || {};
        return {
          subject: q.subject || a.subject,
          topic: q.topic || a.topic,
          correctOption: q.correctOption,
          correctOptions: q.correctOptions,
          multiCorrect: q.multiCorrect,
          selectedOption: ans.selectedOption,
          selectedOptions: ans.selectedOptions,
          status: ans.status,
        };
      });
      const result = scoreRows(rows);
      const before = {
        score: a.score,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        unattemptedCount: a.unattemptedCount,
      };
      const changed =
        before.score !== result.score ||
        before.correctCount !== result.correctCount ||
        before.wrongCount !== result.wrongCount ||
        before.unattemptedCount !== result.unattemptedCount;
      if (!dryRun) {
        await db.collection("topicattempts").updateOne(
          { _id: a._id },
          {
            $set: {
              score: result.score,
              correctCount: result.correctCount,
              wrongCount: result.wrongCount,
              unattemptedCount: result.unattemptedCount,
              subjectStats: result.subjectStats,
              topicStats: {
                topics: result.topicStats,
                partialCount: result.partialCount,
                weakTopics: (a.topicStats || {}).weakTopics,
                strongTopics: (a.topicStats || {}).strongTopics,
                improvements: (a.topicStats || {}).improvements,
              },
            },
          },
        );
      }
      userReport.topics.push({
        id: String(a._id),
        topicId: a.topicId,
        difficulty: a.difficulty,
        before,
        after: {
          score: result.score,
          correctCount: result.correctCount,
          wrongCount: result.wrongCount,
          unattemptedCount: result.unattemptedCount,
        },
        changed,
      });
    }

    report.push(userReport);
  }

  const out = path.join(
    root,
    "data",
    "neet-ai",
    "audits",
    "dashboard-recalc-report.json",
  );
  writeFileSync(
    out,
    JSON.stringify({ dryRun, at: new Date().toISOString(), report }, null, 2),
  );
  console.log(JSON.stringify({ dryRun, emails: TARGET_EMAILS, out }, null, 2));
  for (const u of report) {
    if (u.error) {
      console.log(u.email, u.error);
      continue;
    }
    for (const p of u.papers) {
      console.log(
        `  ${u.email} paper ${p.year}: ${p.before?.score} → ${p.after?.score} (changed=${p.changed})`,
      );
    }
    for (const t of u.topics) {
      console.log(
        `  ${u.email} topic ${t.topicId}: ${t.before?.score} → ${t.after?.score} (changed=${t.changed})`,
      );
    }
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
