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
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({ ok: true, role: user.role });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 400 },
    );
  }
}
