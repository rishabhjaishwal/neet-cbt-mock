import { NextResponse } from "next/server";
import { CONTENT_VERSION } from "@/lib/content-version";

export async function GET() {
  const res = NextResponse.json({
    contentVersion: CONTENT_VERSION,
    store: "content/papers",
  });
  res.headers.set("X-Content-Version", String(CONTENT_VERSION));
  res.headers.set("Cache-Control", "no-cache");
  return res;
}
