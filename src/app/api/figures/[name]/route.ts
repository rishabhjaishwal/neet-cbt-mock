import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Params = { params: Promise<{ name: string }> };

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Serve exam figures from public/figures with a stable API path.
 * Fallback when static CDN/path resolution fails on some hosts.
 */
export async function GET(_req: Request, { params }: Params) {
  const { name } = await params;
  const safe = path.basename(name);
  if (!safe || safe !== name || safe.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const filePath = path.join(process.cwd(), "public", "figures", safe);
  try {
    const buf = await readFile(filePath);
    const ext = path.extname(safe).toLowerCase();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Figure not found" }, { status: 404 });
  }
}
