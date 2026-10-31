import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { resetDemoData } from "../../../../lib/demo/seed";

function same(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export async function POST(req: Request) {
  const key = process.env.DEMO_RESET_KEY;
  if (!key) return NextResponse.json({ error: "Reset is not enabled." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const given = typeof body?.key === "string" ? body.key : "";
  if (!same(given, key)) return NextResponse.json({ error: "Wrong key." }, { status: 401 });

  resetDemoData();
  return NextResponse.json({ ok: true });
}