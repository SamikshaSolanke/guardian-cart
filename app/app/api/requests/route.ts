import { NextResponse } from "next/server";
import { z } from "zod";
import { processRequest } from "../../../lib/agent/pipeline";

const Body = z.object({
  text: z.string().trim().min(3).max(500),
  parentId: z.number().int().positive().default(1), // demo: single seeded parent
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please tell me what you need." }, { status: 400 });
  }
  try {
    const result = await processRequest(parsed.data.parentId, parsed.data.text);
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}