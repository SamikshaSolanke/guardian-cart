import { randomUUID } from "node:crypto";

const BASE = "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

export function appUrl(req: Request) {
  return process.env.APP_URL ?? new URL(req.url).origin;
}

async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(`PayPal auth failed (${r.status}): ${JSON.stringify(data)}`);
  }
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: any) {
    super(`PayPal ${status}: ${JSON.stringify(body)}`);
  }
  hasIssue(issue: string) {
    return Array.isArray(this.body?.details) && this.body.details.some((d: any) => d.issue === issue);
  }
}

async function ppFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const token = await getAccessToken();
  const { idempotencyKey, ...rest } = init;
  const r = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new PayPalError(r.status, body);
  return body;
}

export async function createOrder(opts: {
  amountCents: number;
  currency: string;
  description: string;
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; approveUrl: string }> {
  const body = await ppFetch("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.referenceId,
          description: opts.description.slice(0, 127),
          amount: {
            currency_code: opts.currency,
            value: (opts.amountCents / 100).toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Guardian Cart",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
          },
        },
      },
    }),
  });

  const link = (body.links ?? []).find((l: any) => l.rel === "payer-action" || l.rel === "approve");
  if (!body.id || !link?.href) throw new Error(`No approval link in PayPal response: ${JSON.stringify(body)}`);
  return { id: body.id, approveUrl: link.href };
}

export async function getOrder(orderId: string) {
  return ppFetch(`/v2/checkout/orders/${orderId}`);
}

/** Returns the final order status ("COMPLETED" on success). Safe to call twice. */
export async function captureOrder(orderId: string): Promise<{ status: string }> {
  try {
    const body = await ppFetch(`/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      idempotencyKey: `capture-${orderId}`,
    });
    const captureStatus = body.purchase_units?.[0]?.payments?.captures?.[0]?.status;
    return { status: captureStatus === "COMPLETED" ? "COMPLETED" : (captureStatus ?? body.status) };
  } catch (e) {
    if (e instanceof PayPalError && e.hasIssue("ORDER_ALREADY_CAPTURED")) {
      const o = await getOrder(orderId);
      return { status: o.status };
    }
    throw e;
  }
}