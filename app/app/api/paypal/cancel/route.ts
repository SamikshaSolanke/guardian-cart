import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { appUrl } from "../../../../lib/paypal";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = Number(url.searchParams.get("requestId"));
  const token = url.searchParams.get("token");

  if (requestId && token) {
    db.prepare(
      "UPDATE orders SET status = 'CANCELLED' WHERE request_id = ? AND paypal_order_id = ? AND status = 'CREATED'"
    ).run(requestId, token);
  }
  // The request keeps its old status, so the parent can try paying again.
  return NextResponse.redirect(new URL(`/?cancelled=${requestId || ""}`, appUrl(req)));
}