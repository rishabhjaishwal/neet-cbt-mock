import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";

const g = globalThis as typeof globalThis & {
  __neetMongo?: Promise<typeof mongoose>;
};

function resolveCertPath(): string {
  const inline = process.env.MONGODB_X509_CERT_PEM?.trim();
  if (inline) {
    const tmp = path.join(os.tmpdir(), "neet-mongodb-x509.pem");
    // Normalize escaped newlines from secret managers
    const pem = inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
    fs.writeFileSync(tmp, pem, { mode: 0o600 });
    return tmp;
  }

  const raw =
    process.env.MONGODB_X509_CERT?.trim() ||
    "/cursor/stores/self/internal/mongodb-x509.pem";
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

export function mongoConfig() {
  const uri =
    process.env.MONGODB_URI?.trim() ||
    "mongodb+srv://cluster0.ms2kmgu.mongodb.net/?authSource=%24external&authMechanism=MONGODB-X509&compressors=zlib";
  const certPath = resolveCertPath();
  return { uri, certPath };
}

export async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!g.__neetMongo) {
    g.__neetMongo = (async () => {
      const { uri, certPath } = mongoConfig();
      if (!fs.existsSync(certPath)) {
        throw new Error(
          `X509 PEM missing at ${certPath}. Set MONGODB_X509_CERT (file path) or MONGODB_X509_CERT_PEM (PEM text).`,
        );
      }
      await mongoose.connect(uri, {
        tls: true,
        tlsCertificateKeyFile: certPath,
        authMechanism: "MONGODB-X509",
        authSource: "$external",
        dbName: process.env.MONGODB_DB?.trim() || "neet_cbt",
        serverSelectionTimeoutMS: 20_000,
      });
      return mongoose;
    })().catch((err) => {
      g.__neetMongo = undefined;
      throw err;
    });
  }
  return g.__neetMongo;
}
