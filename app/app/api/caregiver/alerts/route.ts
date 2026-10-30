import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../../lib/db";

const Body = z.object({
  alertId: z.number().int().positive(),
  parentId: z.number().int().positive().default(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const info = db
    .prepare("UPDATE alerts SET resolved = 1 WHERE id = ? AND parent_id = ?")
    .run(parsed.data.alertId, parsed.data.parentId);

  if (info.changes === 0) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}