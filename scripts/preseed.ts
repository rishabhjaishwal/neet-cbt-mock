async function main() {
  process.env.MONGODB_URI ??=
    "mongodb+srv://cluster0.ms2kmgu.mongodb.net/?authSource=%24external&authMechanism=MONGODB-X509&compressors=zlib";
  process.env.MONGODB_X509_CERT ??=
    "/cursor/stores/self/internal/mongodb-x509.pem";
  process.env.MONGODB_DB ??= "neet_cbt";
  const { ensureSeeded } = await import("../src/lib/seed");
  await ensureSeeded();
  const { User, Paper, Question } = await import("../src/lib/models");
  console.log({
    users: await User.countDocuments(),
    papers: await Paper.countDocuments(),
    questions: await Question.countDocuments(),
  });
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
