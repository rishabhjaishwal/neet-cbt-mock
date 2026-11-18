import { NextResponse } from "next/server";
import { listNeetAiCatalog } from "@/lib/neet-ai";

export async function GET() {
  const catalog = await listNeetAiCatalog();
  return NextResponse.json({ ok: true, catalog });
}
