import bcrypt from "bcryptjs";
import { connectDb } from "./db";
import { AppMeta, Attempt, User } from "./models";
import { CONTENT_VERSION } from "./content-version";

export { CONTENT_VERSION } from "./content-version";

let syncedVersion = 0;
let seedInflight: Promise<void> | null = null;

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

/**
 * Users + AppMeta only. Year papers/keys live in content/papers/*.md —
 * no Mongo Question/Paper seeding.
 */
export async function ensureSeeded() {
  if (syncedVersion === CONTENT_VERSION) return;
  await connectDb();
  if (syncedVersion === CONTENT_VERSION) return;

  const meta = await AppMeta.findOne({ key: "content" })
    .select("contentVersion")
    .lean();
  if (meta && meta.contentVersion === CONTENT_VERSION) {
    syncedVersion = CONTENT_VERSION;
    return;
  }

  if (!seedInflight) {
    seedInflight = seedDatabase()
      .then(async () => {
        await AppMeta.findOneAndUpdate(
          { key: "content" },
          { key: "content", contentVersion: CONTENT_VERSION, updatedAt: new Date() },
          { upsert: true },
        );
        syncedVersion = CONTENT_VERSION;
      })
      .finally(() => {
        seedInflight = null;
      });
  }
  await seedInflight;
}

export async function seedDatabase() {
  await connectDb();

  await User.findOneAndUpdate(
    { email: "examiner@neet.local" },
    {
      email: "examiner@neet.local",
      name: "NEET Examiner",
      passwordHash: await hashPassword("Examiner@123"),
      role: "examiner",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await User.findOneAndUpdate(
    { email: "student@neet.local" },
    {
      email: "student@neet.local",
      name: "Demo Student",
      passwordHash: await hashPassword("Student@123"),
      role: "student",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  try {
    await Attempt.collection.dropIndex("userId_1_year_1");
  } catch {
    /* old unique index may already be gone */
  }
  await Attempt.createIndexes();
}
