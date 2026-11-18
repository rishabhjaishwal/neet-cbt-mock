#!/usr/bin/env node
/**
 * Re-score submitted/approved TopicAttempts for NEET AI mocks after key fixes.
 *
 * Uses data/neet-ai/key-delta.json + current NEET AI bank files to refresh
 * snapshotted correctOption, then recomputes score from stored student answers.
 * Does NOT wipe answers.
 *
 * Env: MONGODB_URI, MONGODB_X509_CERT or MONGODB_X509_CERT_PEM, MONGODB_DB
 *
 * Usage:
 *   node scripts/rescore-neet-ai-attempts.mjs [--dry-run] [--limit N]
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

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

function scoreAttempt(answers) {
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  let partialCount = 0;
  const subjectMap = {};
  const topicMap = new Map();

  for (const a of answers) {
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
      a.status === "not_attempted" && picked.length === 0 ? [] : picked;
    const { marks, outcome } = scoreSelection(selected, correct, multi);
    score += marks;
    if (outcome === "unattempted") {
      unattemptedCount++;
      subjectMap[a.subject].unattempted++;
      t.unattempted++;
    } else if (outcome === "correct") {
      correctCount++;
      subjectMap[a.subject].correct++;
      t.correct++;
    } else if (outcome === "partial") {
      partialCount++;
      subjectMap[a.subject].partial++;
      t.partial++;
    } else {
      wrongCount++;
      subjectMap[a.subject].wrong++;
      t.wrong++;
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

function loadKeyLookup() {
  const deltaPath = path.join(root, "data", "neet-ai", "key-delta.json");
  const delta = existsSync(deltaPath)
    ? JSON.parse(readFileSync(deltaPath, "utf8"))
    : { changes: {} };
  /** @type {Map<string, string>} */
  const byId = new Map();
  const banksDir = path.join(root, "data", "neet-ai", "banks");
  for (const file of readdirSync(banksDir).filter((f) => f.endsWith(".json"))) {
    const bank = JSON.parse(readFileSync(path.join(banksDir, file), "utf8"));
    for (const q of bank.questions || []) {
      byId.set(q.id, String(q.correctOption));
    }
  }
  for (const [id, ch] of Object.entries(delta.changes || {})) {
    if (!byId.has(id) && (ch.to || ch.new)) byId.set(id, String(ch.to || ch.new));
  }
  return { byId, delta };
}

const TopicAttemptSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    topicId: String,
    subject: String,
    topic: String,
    difficulty: String,
    status: String,
    score: Number,
    correctCount: Number,
    wrongCount: Number,
    unattemptedCount: Number,
    subjectStats: mongoose.Schema.Types.Mixed,
    topicStats: mongoose.Schema.Types.Mixed,
    questions: [mongoose.Schema.Types.Mixed],
    answers: [mongoose.Schema.Types.Mixed],
    submittedAt: Date,
  },
  { collection: "topicattempts", strict: false },
);

async function main() {
  const uri =
    process.env.MONGODB_URI?.trim() ||
    "mongodb+srv://cluster0.ms2kmgu.mongodb.net/?authSource=%24external&authMechanism=MONGODB-X509&compressors=zlib";
  const certPath = resolveCertPath();
  if (!existsSync(certPath)) {
    console.error("X509 PEM missing at", certPath);
    process.exit(1);
  }
  await mongoose.connect(uri, {
    tls: true,
    tlsCertificateKeyFile: certPath,
    authMechanism: "MONGODB-X509",
    authSource: "$external",
    dbName: process.env.MONGODB_DB?.trim() || "neet_cbt",
    serverSelectionTimeoutMS: 25_000,
  });

  const TopicAttempt =
    mongoose.models.TopicAttemptNeetAiRescore ||
    mongoose.model("TopicAttemptNeetAiRescore", TopicAttemptSchema);

  const { byId, delta } = loadKeyLookup();
  const changedIds = new Set(Object.keys(delta.changes || {}));

  let q = TopicAttempt.find({
    status: { $in: ["submitted", "approved"] },
    topicId: { $regex: /^neet-ai/i },
  }).sort({ submittedAt: -1 });
  if (limit > 0) q = q.limit(limit);
  const attempts = await q.exec();

  const summary = {
    dryRun,
    attemptsScanned: attempts.length,
    attemptsUpdated: 0,
    attemptsUnchanged: 0,
    questionsKeyFlipped: 0,
    scoreDeltas: [],
    attemptIdsUpdated: [],
  };

  for (const attempt of attempts) {
    let keyFlips = 0;
    const questions = (attempt.questions || []).map((qq) => {
      const qid = qq.questionKey || qq.id;
      const fresh = byId.get(qid);
      const prev = String(qq.correctOption || "");
      if (fresh && fresh !== prev) {
        keyFlips++;
        return {
          ...((qq.toObject && qq.toObject()) || qq),
          correctOption: fresh,
          correctOptions: [fresh],
        };
      }
      const co = fresh || prev;
      if (co && (!qq.correctOptions || !qq.correctOptions.length)) {
        return {
          ...((qq.toObject && qq.toObject()) || qq),
          correctOption: co,
          correctOptions: [co],
        };
      }
      return (qq.toObject && qq.toObject()) || qq;
    });

    const intersects = (attempt.questions || []).some((qq) =>
      changedIds.has(qq.questionKey || qq.id),
    );
    if (!intersects && keyFlips === 0) {
      summary.attemptsUnchanged++;
      continue;
    }

    const answersByKey = new Map(
      (attempt.answers || []).map((a) => [a.questionKey, a]),
    );
    const scoreInput = questions.map((qq, i) => {
      const a = answersByKey.get(qq.questionKey) || {};
      const selectedOptions = parseOptionList(
        a.selectedOptions?.length
          ? a.selectedOptions
          : a.selectedOption
            ? [a.selectedOption]
            : [],
      );
      const status = a.status || "not_attempted";
      const picked =
        status === "not_attempted" && selectedOptions.length === 0
          ? []
          : selectedOptions;
      const correctOptions = parseOptionList(
        qq.correctOptions?.length ? qq.correctOptions : qq.correctOption,
      );
      return {
        questionId: qq.questionKey,
        number: qq.number ?? i + 1,
        subject: qq.subject || attempt.subject,
        topic: qq.topic || attempt.topic,
        correctOption: correctOptions.join(",") || "1",
        correctOptions,
        multiCorrect: Boolean(qq.multiCorrect),
        selectedOption: picked[0] ?? null,
        selectedOptions: picked,
        status,
      };
    });

    const result = scoreAttempt(scoreInput);
    const prevScore = attempt.score;
    const changedScore =
      prevScore !== result.score ||
      attempt.correctCount !== result.correctCount ||
      attempt.wrongCount !== result.wrongCount ||
      keyFlips > 0;

    if (!changedScore) {
      summary.attemptsUnchanged++;
      continue;
    }

    summary.questionsKeyFlipped += keyFlips;
    summary.scoreDeltas.push({
      id: String(attempt._id),
      topicId: attempt.topicId,
      oldScore: prevScore,
      newScore: result.score,
      keyFlips,
      oldCorrect: attempt.correctCount,
      newCorrect: result.correctCount,
    });
    summary.attemptIdsUpdated.push(String(attempt._id));
    summary.attemptsUpdated++;

    if (!dryRun) {
      attempt.questions = questions;
      attempt.score = result.score;
      attempt.correctCount = result.correctCount;
      attempt.wrongCount = result.wrongCount;
      attempt.unattemptedCount = result.unattemptedCount;
      attempt.subjectStats = result.subjectStats;
      attempt.topicStats = {
        ...(attempt.topicStats && typeof attempt.topicStats === "object"
          ? attempt.topicStats
          : {}),
        topics: result.topicStats,
        partialCount: result.partialCount,
        rescoredAt: new Date().toISOString(),
        rescoreReason: "neet-ai-answer-key-audit",
      };
      attempt.markModified("questions");
      attempt.markModified("topicStats");
      attempt.markModified("subjectStats");
      await attempt.save();
    }
  }

  const outPath = path.join(root, "data", "neet-ai", "audits", "rescore-report.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      {
        ...summary,
        scoreDeltas: summary.scoreDeltas.slice(0, 30),
        attemptIdsUpdated: summary.attemptIdsUpdated.slice(0, 50),
        report: outPath,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
