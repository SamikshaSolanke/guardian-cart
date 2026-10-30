import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { captureOrder, appUrl } from "../../../../lib/paypal";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = Number(url.searchParams.get("requestId"));
  const token = url.searchParams.get("token"); // PayPal's order ID
  const back = (q: string) => NextResponse.redirect(new URL(`/?${q}`, appUrl(req)));

  if (!requestId || !token) return back("error=missing");

  // Only capture orders that WE created for this request.
  const order = db
    .prepare("SELECT * FROM orders WHERE request_id = ? AND paypal_order_id = ?")
    .get(requestId, token) as any;
  if (!order) return back("error=unknown-order");
  if (order.status === "COMPLETED") return back(`paid=${requestId}`);

  try {
    const cap = await captureOrder(token);
    if (cap.status === "COMPLETED") {
      db.prepare("UPDATE orders SET status = 'COMPLETED', captured_at = datetime('now') WHERE id = ?").run(order.id);
      db.prepare("UPDATE requests SET status = 'paid' WHERE id = ?").run(requestId);
      return back(`paid=${requestId}`);
    }
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(cap.status, order.id);
    return back(`error=payment-${cap.status}`);
  } catch (e) {
    console.error(e);
    return back("error=capture-failed");
  }
}