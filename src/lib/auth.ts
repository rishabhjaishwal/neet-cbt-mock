import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ensureSeeded } from "./seed";
import { User, type UserDoc } from "./models";

const COOKIE = "neet_session";
const secret = () =>
  new TextEncoder().encode(
    process.env.AUTH_SECRET?.trim() || "neet-cbt-dev-secret-change-me",
  );

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "student" | "examiner";
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  await ensureSeeded();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role === "examiner" ? "examiner" : "student",
    };
  } catch {
    return null;
  }
}

export async function requireUser(role?: "student" | "examiner") {
  const user = await getSession();
  if (!user) throw new Error("UNAUTHORIZED");
  if (role && user.role !== role) throw new Error("FORBIDDEN");
  return user;
}

export async function findUserByEmail(email: string) {
  await ensureSeeded();
  const user = (await User.findOne({ email: email.toLowerCase() }).lean()) as
    | (UserDoc & { passwordHash: string })
    | null;
  if (!user) return null;
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role as "student" | "examiner",
    password_hash: user.passwordHash,
  };
}
