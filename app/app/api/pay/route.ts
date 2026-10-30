import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../lib/db";
import { createOrder, appUrl } from "../../../lib/paypal";
import { getRules, getSpentThisMonthCents } from "../../../lib/policy/queries";

const Body = z.object({ requestId: z.number().int().positive() });

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Missing request.", 400);
  const { requestId } = parsed.data;

  const request = db
    .prepare("SELECT id, parent_id, status FROM requests WHERE id = ?")
    .get(requestId) as { id: number; parent_id: number; status: string } | undefined;
  if (!request) return fail("Request not found.", 404);

  // Only these two states may be paid. "approved" is set by the caregiver (next step).
  if (request.status !== "ready_to_pay" && request.status !== "approved") {
    return fail("This purchase isn't ready to be paid yet.", 409);
  }

  const rec = db
    .prepare("SELECT * FROM recommendations WHERE request_id = ? ORDER BY id DESC LIMIT 1")
    .get(requestId) as any;
  if (!rec) return fail("No product found for this request.", 409);

  const alreadyPaid = db
    .prepare("SELECT 1 FROM orders WHERE request_id = ? AND status = 'COMPLETED'")
    .get(requestId);
  if (alreadyPaid) return fail("This purchase has already been paid.", 409);

  // Re-check money rules at payment time (the month's spending may have changed since the request).
  const rules = getRules(request.parent_id);
  if (rec.price_cents > rules.perPurchaseLimitCents) {
    return fail("This is above the limit for a single purchase.", 403);
  }
  if (request.status === "ready_to_pay") {
    const spent = getSpentThisMonthCents(request.parent_id);
    if (spent + rec.price_cents > rules.monthlyBudgetCents) {
      db.prepare("UPDATE requests SET status = 'needs_approval' WHERE id = ?").run(requestId);
      return fail("This would go over the monthly budget, so it now needs your caregiver's OK.", 409);
    }
  }

  try {
    const base = appUrl(req);
    const order = await createOrder({
      amountCents: rec.price_cents,
      currency: rec.currency,
      description: rec.title,
      referenceId: String(requestId),
      returnUrl: `${base}/api/paypal/return?requestId=${requestId}`,
      cancelUrl: `${base}/api/paypal/cancel?requestId=${requestId}`,
    });

    db.prepare(
      "INSERT INTO orders (request_id, paypal_order_id, status, amount_cents, currency) VALUES (?,?,?,?,?)"
    ).run(requestId, order.id, "CREATED", rec.price_cents, rec.currency);

    return NextResponse.json({ approveUrl: order.approveUrl, orderId: order.id });
  } catch (e) {
    console.error(e);
    return fail("Couldn't start the payment. Please try again.", 502);
  }
}