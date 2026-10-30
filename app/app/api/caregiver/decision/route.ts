import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../../lib/db";

const Body = z.object({
  requestId: z.number().int().positive(),
  action: z.enum(["approve", "deny"]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { requestId, action } = parsed.data;
  const newStatus = action === "approve" ? "approved" : "denied";

  // Only a request that is still waiting can be decided, and only once.
  const info = db
    .prepare("UPDATE requests SET status = ? WHERE id = ? AND status = 'needs_approval'")
    .run(newStatus, requestId);

  if (info.changes === 0) {
    return NextResponse.json({ error: "This request is no longer waiting for approval." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: newStatus });
}