import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET(req: Request) {
  const requestId = Number(new URL(req.url).searchParams.get("requestId"));
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

  const row = db
    .prepare(
      `SELECT r.id, r.status, rec.title, rec.price_cents AS priceCents, rec.merchant_domain AS merchantDomain
       FROM requests r
       LEFT JOIN recommendations rec ON rec.request_id = r.id
       WHERE r.id = ?
       ORDER BY rec.id DESC LIMIT 1`
    )
    .get(requestId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}