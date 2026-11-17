import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, findUserByEmail, verifyPassword } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = schema.parse(await req.json());
    const user = await findUserByEmail(body.email.toLowerCase());
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    // Public app is student-only — examiner accounts cannot use this login.
    if (user.role !== "student") {
      return NextResponse.json(
        { error: "This login is for students only." },
        { status: 403 },
      );
    }
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "student",
    });
    return NextResponse.json({ ok: true, role: "student" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 400 },
    );
  }
}
