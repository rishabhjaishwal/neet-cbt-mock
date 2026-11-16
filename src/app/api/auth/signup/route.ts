import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, findUserByEmail, hashPassword } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { User } from "@/lib/models";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();
    if (await findUserByEmail(email)) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    const passwordHash = await hashPassword(body.password);
    const user = await User.create({
      email,
      name: body.name.trim(),
      passwordHash,
      role: "student",
    });
    await createSession({
      id: String(user._id),
      email,
      name: body.name.trim(),
      role: "student",
    });
    return NextResponse.json({ ok: true, role: "student" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Signup failed" },
      { status: 400 },
    );
  }
}
